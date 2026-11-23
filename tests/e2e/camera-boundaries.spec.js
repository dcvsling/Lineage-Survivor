import {test, expect} from '@playwright/test';

// Browser-only hook appended to the real game's ES module by Playwright.
// Production code is unchanged; Engine.update() performs every movement step.
const harness = '(' + function edgeCameraHarness() {
  let realUpdate;
  const edge = {
    setup() {
      if (!game || game.status !== 'playing') throw new Error('Run is not playing');
      realUpdate = game.update.bind(game);
      game.spawnTimer = 100000;
      game.enemies = [];
      game.pickups = [];
      game.effects = [];
      game.projectiles = [];
      game.player.y = 900;
      game.hurtTimer = 0;
      game.update = () => {}; // Freeze only the animation-loop step, not Engine.
      return this.state();
    },
    near(side) {
      if (!realUpdate) throw new Error('Fixture not initialized');
      const left = side === 'left';
      if (!left && side !== 'right') throw new Error('Invalid edge');
      const input = {x:left ? -1 : 1, y:0};
      const threshold = left ? 100 : 2280;
      let steps = 0;
      while ((left ? game.player.x > threshold : game.player.x < threshold) && steps < 100) {
        realUpdate(0.25, input);
        steps++;
      }
      if (steps === 100 || game.status !== 'playing') throw new Error('Engine did not approach edge');
      // A stationary magenta marker verifies camera projection independently
      // of ground coverage. It is deliberately above the ground sample band.
      game.projectiles = [{
        x:left ? -80 : 2480, y:825, vx:0, vy:0, life:100,
        radius:5, hostile:false, color:'#ff00ff', hitIds:[], pierce:1
      }];
      return this.state();
    },
    finish(side) {
      const left = side === 'left', target = left ? 20 : 2380;
      let steps = 0;
      while ((left ? game.player.x > target : game.player.x < target) && steps < 12) {
        realUpdate(0.25, {x:left ? -1 : 1, y:0});
        steps++;
      }
      if (steps === 12 || game.status !== 'playing') throw new Error('Engine did not reach edge');
      return this.state();
    },
    state() {
      return {
        playerX:game.player.x, playerY:game.player.y,
        markerX:game.projectiles[0]?.x ?? null,
        markerY:game.projectiles[0]?.y ?? null,
        status:game.status
      };
    }
  };
  globalThis.__edgeCameraE2E = edge;
}.toString() + ')();';

async function raster(page, side) {
  return page.evaluate(async side => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector('#world');
    const ctx = canvas.getContext('2d');
    const {width, height} = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const idx = (x, y) => (y * width + x) * 4;
    const palette = new Set([
      '24,43,32', '27,48,34', '32,54,40', '25,45,33', '37,54,43'
    ]); // The five actual forest tile base colors, not the background fill.
    function patch(x, y, w, h) {
      let ground = 0, opaque = 0, background = 0;
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const i = idx(px, py);
          const rgb = [data[i], data[i+1], data[i+2]].join(',');
          if (palette.has(rgb)) ground++;
          if (data[i+3] === 255) opaque++;
          if (rgb === '20,37,28') background++;
        }
      }
      return {x, y, w, h, ground, opaque, background, total:w*h};
    }
    // At the respective edge the world x=0 and x=2560 chunk seams
    // project to backing x=163 and x=283. Stay clear of the ancient border
    // (around x=166/184), the player, tree positions and the marker at y=825.
    const seam = side === 'left' ? {
      before:patch(160, 160, 3, 26),
      after:patch(163, 160, 2, 26)
    } : {
      before:patch(280, 160, 3, 26),
      after:patch(285, 160, 3, 26)
    };
    let markerCount = 0, markerTotalX = 0, markerTotalY = 0, heroPixels = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(x,y), r = data[i], g = data[i+1], b = data[i+2];
        if (r > 235 && g < 40 && b > 235) {
          markerCount++;
          markerTotalX += x;
          markerTotalY += y;
        }
        if (x >= 170 && x <= 180 && y >= 156 && y <= 176 &&
            ((r === 163 && g === 183 && b === 190) ||
             (r === 209 && g === 185 && b === 154))) heroPixels++;
      }
    }
    return {
      cssWidth:innerWidth, cssHeight:innerHeight, width, height,
      smoothing:ctx.imageSmoothingEnabled,
      state:globalThis.__edgeCameraE2E.state(),
      marker:markerCount ? {x:markerTotalX/markerCount, y:markerTotalY/markerCount, count:markerCount} : null,
      heroPixels, seam
    };
  }, side);
}

function expectCameraImage(image) {
  expect(image.cssWidth).toBe(699);
  expect(image.cssHeight).toBe(700);
  expect(image.width).toBe(350);
  expect(image.height).toBe(350);
  expect(image.smoothing).toBe(false);
  expect(image.state.status).toBe('playing');
  expect(image.state.playerY).toBe(900);
  expect(image.marker?.count).toBeGreaterThan(8);
  const expectedX = 175 + (image.state.markerX - image.state.playerX) * 0.6;
  const expectedY = 175 + (image.state.markerY - image.state.playerY) * 0.6;
  expect(Math.abs(image.marker.x - expectedX)).toBeLessThan(2);
  expect(Math.abs(image.marker.y - expectedY)).toBeLessThan(2);
  expect(image.heroPixels).toBeGreaterThan(2);
}

function expectTerrainOnBothSides(image) {
  // A projectile alone cannot establish whether a ground chunk is missing.
  // Require actual forest palette coverage on EACH side of the chunk seam,
  // rather than accepting the renderer's opaque background (#14251c).
  for (const [side, patch] of Object.entries(image.seam)) {
    expect(patch.opaque, side + ': transparent raster').toBe(patch.total);
    expect(patch.ground / patch.total, side + ': missing forest tiles ' + JSON.stringify(patch))
      .toBeGreaterThan(0.55);
    expect(patch.background / patch.total, side + ': blank world background')
      .toBeLessThan(0.2);
  }
}

test('real Engine follows X=20 and 2380; actual Canvas forest covers both boundary chunk seams', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:699, height:700});
  await page.route('**/main.js', async route => {
    const response = await route.fetch();
    const moduleSource = await response.text();
    if (!moduleSource.includes('requestAnimationFrame(frame)')) {
      throw new Error('Camera E2E module hook changed');
    }
    await route.fulfill({response, body:moduleSource + '\n' + harness});
  });
  await page.goto('/');
  await expect(page.locator('#classes .class-card')).toHaveCount(3);
  await page.locator('#start').click();
  await page.getByRole('button', {name:'我準備好了，出發'}).click();
  await expect(page.locator('#hud')).toBeVisible();
  const start = await page.evaluate(() => globalThis.__edgeCameraE2E.setup());
  expect(start.status).toBe('playing');
  expect(start.playerY).toBe(900);

  const leftNear = await page.evaluate(() => globalThis.__edgeCameraE2E.near('left'));
  expect(leftNear.playerX).toBeGreaterThan(20);
  const leftApproachImage = await raster(page, 'left');
  expectCameraImage(leftApproachImage);
  const left = await page.evaluate(() => globalThis.__edgeCameraE2E.finish('left'));
  expect(left.playerX).toBe(20);
  expect(left.markerX).toBe(leftNear.markerX);
  const leftEdgeImage = await raster(page, 'left');
  expectCameraImage(leftEdgeImage);
  expect(leftEdgeImage.marker.x - leftApproachImage.marker.x).toBeGreaterThan(15);
  expectTerrainOnBothSides(leftEdgeImage);

  const rightNear = await page.evaluate(() => globalThis.__edgeCameraE2E.near('right'));
  expect(rightNear.playerX).toBeLessThan(2380);
  const rightApproachImage = await raster(page, 'right');
  expectCameraImage(rightApproachImage);
  const right = await page.evaluate(() => globalThis.__edgeCameraE2E.finish('right'));
  expect(right.playerX).toBe(2380);
  expect(right.markerX).toBe(rightNear.markerX);
  const rightEdgeImage = await raster(page, 'right');
  expectCameraImage(rightEdgeImage);
  expect(rightApproachImage.marker.x - rightEdgeImage.marker.x).toBeGreaterThan(15);
  expectTerrainOnBothSides(rightEdgeImage);
  expect(errors).toEqual([]);
});
