import {test, expect} from '@playwright/test';

// Intercept only the test browser's module response. No debug globals or
// mutating commands are shipped in dist/ to production users.
const harness = [
  'globalThis.__upgradeE2E = {',
  '  open(ranks, ids) {',
  '    if (!game || game.status !== "playing") throw Error("Run is not playing");',
  '    Object.assign(game.upgrades, ranks);',
  '    game.choices = ids.map(id => ({id}));',
  '    game.level += 1;',
  '    game.status = "upgrade";',
  '    lastStatus = "";',
  '    syncStatus();',
  '  },',
  '  snapshot() { return {status:game.status, upgrades:{...game.upgrades}}; }',
  '};'
].join('\n');

async function beginRun(page) {
  await page.route('**/main.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    if (!source.includes('function syncStatus()')) throw Error('Upgrade harness injection point changed');
    await route.fulfill({response, body:source + '\n' + harness});
  });
  await page.goto('/');
  await expect(page.locator('#classes .class-card')).toHaveCount(3);
  await page.locator('#start').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.getByRole('button', {name:'我準備好了，出發'}).click();
  await expect(page.locator('#camp')).toBeHidden();
}

async function openUpgrade(page, ranks, ids=['orb','lightning','haste']) {
  await page.evaluate(({ranks,ids}) => globalThis.__upgradeE2E.open(ranks,ids), {ranks,ids});
  await expect(page.locator('#modal-title')).toHaveText('靈魂覺醒');
  await expect(page.locator('#modal .upgrade-options button')).toHaveCount(ids.length);
}

test('upgrade modal renders separate post-pick combo progress without prematurely changing the run', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await beginRun(page);
  await openUpgrade(page, {orb:1,lightning:1});
  const cards = page.locator('#modal .upgrade-options button');
  const orb = cards.nth(0);
  await expect(orb.locator('.combo-preview')).toContainText('雷焰共鳴：尚需 聖焰環 2/3 階、雷霆誓約 1/3 階');
  await expect(orb.locator('.combo-preview')).toContainText('魂焰牽引');
  await expect(orb.locator('small:not(.combo-preview)').last()).not.toContainText('選擇後組合進度');
  await expect(cards.nth(1).locator('.combo-preview')).toContainText('雷霆誓約 2/3 階');
  await expect(cards.nth(2).locator('.combo-preview')).toHaveCount(0);
  const before = await page.evaluate(() => globalThis.__upgradeE2E.snapshot());
  expect(before.upgrades.orb).toBe(1);
  expect(before.upgrades.lightning).toBe(1);
  expect(before.status).toBe('upgrade');
  await orb.click();
  await expect(page.locator('#modal')).toBeHidden();
  const after = await page.evaluate(() => globalThis.__upgradeE2E.snapshot());
  expect(after.upgrades.orb).toBe(2);
  expect(after.upgrades.lightning).toBe(1);
  expect(after.status).toBe('playing');
  expect(errors).toEqual([]);
});

test('ready-to-unlock card keeps unlocked combo outside remaining requirements', async ({page}) => {
  await beginRun(page);
  await openUpgrade(page, {orb:2,lightning:3});
  const orb = page.locator('#modal .upgrade-options button').first();
  await expect(orb.locator('small:not(.combo-preview)').last()).toContainText('解鎖雷焰共鳴');
  await expect(orb.locator('.combo-preview')).toContainText('魂焰牽引');
  await expect(orb.locator('.combo-preview')).not.toContainText('雷焰共鳴：尚需');
  expect((await page.evaluate(() => globalThis.__upgradeE2E.snapshot())).upgrades.orb).toBe(2);
});

test('portrait and short landscape upgrade cards remain scrollable without horizontal clipping', async ({page}) => {
  await beginRun(page);
  await openUpgrade(page, {orb:1,lightning:1});
  const panel = page.locator('#modal .panel');
  const cards = page.locator('#modal .upgrade-options button');
  for (const viewport of [{width:390,height:780},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
    for (const n of [0,1]) {
      const card = cards.nth(n);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('.combo-preview')).toBeVisible();
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  }
});
