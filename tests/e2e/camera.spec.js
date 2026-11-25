import {test, expect} from '@playwright/test';

// Append a browser-only fixture to the real game's module. No debug hooks ship
// in dist/, and all assertions inspect pixels from the displayed world Canvas.
const harness = `
let cameraAdvance;
globalThis.__cameraE2E = {
  setup() {
    if (!game || game.status !== 'playing') throw new Error('Run is not playing');
    const p = game.player;
    game.spawnTimer = 100000;
    game.enemies = [];
    game.pickups = [];
    game.effects = [];
    // Distinct magenta projectile: a fixed world landmark 100 units right
    // of the player. The engine and real Renderer draw it normally.
    game.projectiles = [{
      x:p.x + 100, y:p.y, vx:0, vy:0, life:100, radius:4,
      hostile:false, color:'#ff00ff', hitIds:[], pierce:1
    }];
    const originalUpdate = game.update.bind(game);
    game.update = () => {}; // Hold exactly one world state across both resizes.
    cameraAdvance = dt => originalUpdate(dt, {x:1, y:0});
    return this.state();
  },
  setupAspect() {
    this.setup();
    const p = game.player;
    // Two inner markers remain visible in both orientations; the outer
    // markers are deliberately inside just one axis of the visible extent.
    game.projectiles = [
      [100, 0, '#ff00ff'],
      [0, 100, '#00ffff'],
      [220, 0, '#ff0000'],
      [0, 220, '#0000ff']
    ].map(([dx,dy,color]) => ({
      x:p.x + dx, y:p.y + dy, vx:0, vy:0, life:100, radius:5,
      hostile:false, color, hitIds:[], pierce:1
    }));
    return this.aspectState();
  },
  aspectState() {
    return {
      playerX:game.player.x, playerY:game.player.y, status:game.status,
      landmarks:game.projectiles.map(({x,y,color}) => ({x,y,color}))
    };
  },
  advance(dt) {
    if (!cameraAdvance) throw new Error('Fixture not initialized');
    cameraAdvance(dt); // Genuine Engine movement, without frame-time jitter.
    return this.state();
  },
  state() {
    return {
      playerX:game.player.x, playerY:game.player.y,
      landmarkX:game.projectiles[0].x,
      landmarkY:game.projectiles[0].y,
      status:game.status
    };
  }
};
`;

async function raster(page) {
  return page.evaluate(async () => {
    // Allow resize and the game's requestAnimationFrame renderer to finish.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.getElementById('world');
    const {width, height} = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let count = 0, xTotal = 0, yTotal = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Sample pixels actually drawn by the real Renderer, not camera math.
        if (data[i] > 235 && data[i + 1] < 40 && data[i + 2] > 235) {
          count++;
          xTotal += x;
          yTotal += y;
        }
      }
    }
    return {
      cssWidth:innerWidth, width, height,
      smoothing:canvas.getContext('2d').imageSmoothingEnabled,
      marker:count ? {x:xTotal / count, y:yTotal / count, count} : null,
      state:globalThis.__cameraE2E.state()
    };
  });
}

test('699→700 CSS px changes real Canvas camera scale within the same run, then follows movement', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/main.js', async route => {
    const response = await route.fetch();
    const moduleSource = await response.text();
    if (!moduleSource.includes('requestAnimationFrame(frame)')) {
      throw new Error('Camera fixture injection point changed');
    }
    await route.fulfill({response, body:moduleSource + '\n' + harness});
  });
  await page.goto('/');
  await expect(page.locator('#classes .class-card')).toHaveCount(3);
  await page.locator('#start').click();
  await page.getByRole('button', {name:'我準備好了，出發'}).click();
  await expect(page.locator('#hud')).toBeVisible();
  const before = await page.evaluate(() => globalThis.__cameraE2E.setup());
  expect(before.status).toBe('playing');
  expect(before.landmarkX - before.playerX).toBe(100);

  await page.setViewportSize({width:699, height:700});
  const narrow = await raster(page);
  expect(narrow.cssWidth).toBe(699);
  expect(narrow.width).toBe(350);
  expect(narrow.height).toBe(350);
  expect(narrow.smoothing).toBe(false);
  expect(narrow.marker?.count).toBeGreaterThan(8);
  expect(Math.abs(narrow.marker.x - (narrow.width / 2 + 60))).toBeLessThan(2);

  // The backing width is unchanged: only the 700px camera breakpoint moves
  // the same world landmark from ~60px to ~72px off the center.
  await page.setViewportSize({width:700, height:700});
  const wide = await raster(page);
  expect(wide.cssWidth).toBe(700);
  expect(wide.width).toBe(350);
  expect(wide.height).toBe(350);
  expect(wide.smoothing).toBe(false);
  expect(wide.state).toEqual(narrow.state);
  expect(wide.marker?.count).toBeGreaterThan(8);
  expect(Math.abs(wide.marker.x - (wide.width / 2 + 72))).toBeLessThan(2);
  expect(Math.abs(wide.marker.x - narrow.marker.x - 12)).toBeLessThan(2);
  expect(Math.abs(wide.marker.y - narrow.marker.y)).toBeLessThan(2);

  // Advance the real movement system while the landmark stays fixed in
  // world coordinates. Camera following keeps the hero centered and shifts
  // the landmark left by movement * 0.72 backing pixels.
  const moved = await page.evaluate(() => globalThis.__cameraE2E.advance(0.25));
  expect(moved.playerX).toBeGreaterThan(before.playerX + 15);
  expect(moved.landmarkX).toBe(before.landmarkX);
  const followed = await raster(page);
  expect(followed.marker?.count).toBeGreaterThan(8);
  const expectedX = followed.width / 2 + (moved.landmarkX - moved.playerX) * .72;
  expect(Math.abs(followed.marker.x - expectedX)).toBeLessThan(2);
  expect(followed.marker.x).toBeLessThan(wide.marker.x - 8);
  expect(followed.state.status).toBe('playing');
  expect(errors).toEqual([]);
});

async function aspectRaster(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.getElementById('world');
    const {width,height} = canvas;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0,0,width,height).data;
    const colors = ['#ff00ff','#00ffff','#ff0000','#0000ff'];
    const sums = Object.fromEntries(colors.map(color => [color,{count:0,x:0,y:0}]));
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const color = r > 235 && g < 20 && b > 235 ? colors[0]
        : r < 20 && g > 235 && b > 235 ? colors[1]
        : r > 235 && g < 20 && b < 20 ? colors[2]
        : r < 20 && g < 20 && b > 235 ? colors[3] : null;
      if (!color || data[i+3] !== 255) continue;
      const pixel = i / 4;
      const sum = sums[color];
      sum.count++;
      sum.x += pixel % width;
      sum.y += Math.floor(pixel / width);
    }
    const markers = Object.fromEntries(colors.map(color => {
      const {count,x,y} = sums[color];
      return [color,count ? {count,x:x/count,y:y/count} : null];
    }));
    return {
      cssWidth:innerWidth, cssHeight:innerHeight, width,height,
      smoothing:ctx.imageSmoothingEnabled, markers,
      state:globalThis.__cameraE2E.aspectState()
    };
  });
}

test('same run portrait and landscape Canvas swap axis visibility and preserve world landmarks', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/main.js', async route => {
    const response = await route.fetch();
    const moduleSource = await response.text();
    if (!moduleSource.includes('requestAnimationFrame(frame)')) {
      throw new Error('Camera fixture injection point changed');
    }
    await route.fulfill({response, body:moduleSource + '\n' + harness});
  });
  await page.goto('/');
  await expect(page.locator('#classes .class-card')).toHaveCount(3);
  await page.locator('#start').click();
  await page.getByRole('button', {name:'我準備好了，出發'}).click();
  await expect(page.locator('#hud')).toBeVisible();
  const before = await page.evaluate(() => globalThis.__cameraE2E.setupAspect());
  expect(before.status).toBe('playing');

  const portrait = {width:390,height:780,backingWidth:195,backingHeight:390,scale:.60,hidden:'#ff0000'};
  const landscape = {width:844,height:390,backingWidth:422,backingHeight:195,scale:.72,hidden:'#0000ff'};
  // Rotate back as well: a marker clipped in one orientation must reappear
  // at its original projected position, without another game or mutation.
  for (const view of [portrait,landscape,portrait]) {
    await page.setViewportSize({width:view.width,height:view.height});
    const image = await aspectRaster(page);
    expect([image.cssWidth,image.cssHeight]).toEqual([view.width,view.height]);
    expect([image.width,image.height]).toEqual([view.backingWidth,view.backingHeight]);
    expect(image.smoothing).toBe(false);
    expect(image.state).toEqual(before);
    for (const landmark of before.landmarks) {
      const marker = image.markers[landmark.color];
      if (landmark.color === view.hidden) {
        expect(marker, 'offscreen marker ' + landmark.color).toBeNull();
        continue;
      }
      expect(marker?.count, 'visible marker ' + landmark.color).toBeGreaterThan(8);
      const expectedX = view.backingWidth / 2 + (landmark.x - before.playerX) * view.scale;
      const expectedY = view.backingHeight / 2 + (landmark.y - before.playerY) * view.scale;
      expect(Math.abs(marker.x - expectedX)).toBeLessThan(2);
      expect(Math.abs(marker.y - expectedY)).toBeLessThan(2);
    }
  }
  expect(errors).toEqual([]);
});
