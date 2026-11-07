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
