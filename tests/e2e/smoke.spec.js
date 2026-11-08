import {test, expect} from '@playwright/test';

async function beginRun(page) {
  await page.goto('/');
  await expect(page.locator('#classes .class-card')).toHaveCount(3);
  await page.locator('#start').click();
  // Fresh browser storage intentionally exercises the first-run guide.
  await expect(page.locator('#modal')).toBeVisible();
  await page.getByRole('button', {name: '我準備好了，出發'}).click();
  await expect(page.locator('#camp')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
}

async function openDiagnostics(page) {
  await page.getByText('遠征情報 · 唯讀指令', {exact: true}).click();
  return page.locator('#modal details.diagnostics').filter({hasText: '遠征情報 · 唯讀指令'});
}

async function runCommand(section, command) {
  await section.locator('input').fill(command);
  await section.getByRole('button', {name: '查詢'}).click();
  return section.locator('output').textContent();
}

test('fresh run displays classes, Canvas and HUD without page errors', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await beginRun(page);
  await expect(page.locator('#class-name')).toContainText('騎士');
  await expect.poll(() => page.locator('#world').evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('pause diagnostics remain read-only and WASD works after closing modal', async ({page}) => {
  await beginRun(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeVisible();
  let section = await openDiagnostics(page);
  expect(await runCommand(section, 'status')).toContain('paused');
  const first = await runCommand(section, 'player');
  const firstX = Number(first.match(/座標: \((\d+),\s*\d+\)/)?.[1]);
  expect(Number.isFinite(firstX)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
  await page.keyboard.down('d');
  await page.waitForTimeout(450);
  await page.keyboard.up('d');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeVisible();
  section = await openDiagnostics(page);
  const second = await runCommand(section, 'player');
  const secondX = Number(second.match(/座標: \((\d+),\s*\d+\)/)?.[1]);
  expect(secondX).toBeGreaterThan(firstX + 10);
  expect(await runCommand(section, 'eval alert(1)')).toContain('未知指令');
});

test('optional touch controls toggle without interfering with camp', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#touch')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#touch').click();
  await expect(page.locator('#touch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#camp')).toBeVisible();
});

test('Canvas backing store resizes without re-enabling pixel smoothing', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await beginRun(page);
  const canvas = page.locator('#world');
  const snapshot = () => canvas.evaluate(el => ({
    width: el.width, height: el.height,
    smoothing: el.getContext('2d').imageSmoothingEnabled
  }));
  await page.setViewportSize({width:1200,height:800});
  await expect.poll(snapshot).toEqual({width:600,height:400,smoothing:false});
  await page.setViewportSize({width:390,height:780});
  await expect.poll(snapshot).toEqual({width:195,height:390,smoothing:false});
  expect(pageErrors).toEqual([]);
});

test('narrow-viewport joystick pointer moves the player and releases cleanly', async ({page}) => {
  await page.setViewportSize({width:390,height:780});
  await beginRun(page);
  const joystick = page.locator('#joystick');
  await expect(joystick).toBeVisible();

  await page.locator('#pause').click();
  let section = await openDiagnostics(page);
  const before = await runCommand(section,'player');
  const firstX = Number(before.match(/座標: \((\d+),\s*\d+\)/)?.[1]);
  expect(Number.isFinite(firstX)).toBe(true);

  await page.getByRole('button',{name:'繼續遠征'}).click();
  const bounds = await joystick.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds.x+bounds.width/2, y = bounds.y+bounds.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+29,y,{steps:6});
  await page.waitForTimeout(650);
  await page.mouse.up();
  expect(await joystick.locator('div').evaluate(el=>el.style.transform)).toBe('translate(0px, 0px)');

  await page.locator('#pause').click();
  section = await openDiagnostics(page);
  const after = await runCommand(section,'player');
  const secondX = Number(after.match(/座標: \((\d+),\s*\d+\)/)?.[1]);
  expect(secondX).toBeGreaterThan(firstX+20);
});
