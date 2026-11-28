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
  '  cast() {',
  '    if (!game || game.status !== "playing") throw Error("Run is not playing");',
  '    const advance=game.update.bind(game);game.update=()=>{};',
  '    game.spawnTimer=game.attackTimer=game.orbTimer=100;',
  '    game.lightningTimer=0;game.enemies=[];game.effects=[];game.projectiles=[];game.pickups=[];',
  '    const p=game.player;',
  '    const offsets=[[-100,0],[0,-100],[100,0],[0,100],[185,70]];',
  '    for(const [dx,dy] of offsets){const e=game.spawn("melee");e.x=p.x+dx;e.y=p.y+dy;e.hp=e.maxHp=1000;e.speed=0;}',
  '    advance(1/30);',
  '    return {metrics:{...game.spellMetrics}, player:{x:p.x,y:p.y}, effects:game.effects.filter(e=>e.type==="lightning"||e.type==="lightningEcho")};',
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

test('hourglass card explains rank-three unlock and only the real extra target gets a gold diamond on Canvas', async ({page}) => {
  await page.setViewportSize({width:699,height:700});
  await page.addInitScript(() => localStorage.setItem('lineage-survivor-v1', JSON.stringify({
    version:2,equipment:{weapon:0,armor:0,boots:0},gold:0,best:60,wins:0,relic:'none'
  })));
  await page.route('**/main.js', async route => {
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())+'\n'+harness});
  });
  await page.goto('/');
  await page.locator('#relic').click();
  const card=page.locator('.relic-grid section').filter({hasText:'回響沙漏'});
  await expect(card).toContainText('雷霆誓約達第 3 階');
  await expect(card).toContainText('金色菱形雷擊');
  await card.getByRole('button',{name:'裝備回響沙漏'}).click();
  await expect(card.getByRole('button',{name:'已裝備'})).toBeDisabled();
  await page.getByRole('button',{name:'返回營地'}).click();
  await page.locator('#start').click();
  await expect(page.locator('#camp')).toBeHidden();
  await openUpgrade(page,{lightning:2},['lightning','haste','orb']);
  const lightning=page.locator('#modal .upgrade-options button').first();
  await expect(lightning).toContainText('目標 3 → 5');
  await expect(lightning).toContainText('解鎖雷霆回響（額外目標 +1，金色菱形雷擊）');
  expect((await page.evaluate(()=>globalThis.__upgradeE2E.snapshot())).upgrades.lightning).toBe(2);
  await lightning.click();
  await expect(page.locator('#modal')).toBeHidden();
  const result=await page.evaluate(()=>globalThis.__upgradeE2E.cast());
  expect(result.metrics.thunderEchoExtraHits).toBe(1);
  expect(result.effects.filter(e=>e.type==='lightning')).toHaveLength(4);
  const bonus=result.effects.filter(e=>e.type==='lightningEcho');
  expect(bonus).toHaveLength(1);
  expect(bonus[0].x-result.player.x).toBe(185);
  // Use actual Canvas pixels below each target: the gold diamond vertex is
  // 36 world units down, outside the normal lightning ring and damage text.
  const pixels=await page.evaluate(async ({player,effects})=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
    return effects.map(e=>{
      const x=Math.round(canvas.width/2+(e.x-player.x)*.60);
      const y=Math.round(canvas.height/2+(e.y-player.y+36)*.60);
      const data=ctx.getImageData(x-5,y-4,11,9).data;
      let gold=0;
      for(let i=0;i<data.length;i+=4)if(data[i]>170&&data[i+1]>125&&data[i+2]<125&&data[i]-data[i+1]>10&&data[i+1]-data[i+2]>35)gold++;
      return {type:e.type,gold};
    });
  },{player:result.player,effects:result.effects});
  expect(pixels.find(p=>p.type==='lightningEcho').gold).toBeGreaterThan(2);
  expect(pixels.filter(p=>p.type==='lightning').every(p=>p.gold===0)).toBe(true);
});
