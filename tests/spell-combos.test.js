import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';
import {activeSpellCombos, spellComboProgress, lightningInterval, orbRange, lightningTargets, SPELL_COMBOS} from '../dist/spell-combos.js';
import {buildSummary, upgradeInfo} from '../dist/build-info.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('雷焰共鳴 requires two rank-three spells and is a pure stateless rule', () => {
  const upgrades = {orb: 3, lightning: 2};
  const before = JSON.stringify(upgrades);
  assert.deepEqual(activeSpellCombos(upgrades), []);
  close(lightningInterval(upgrades), 2);
  upgrades.lightning = 3;
  assert.deepEqual(activeSpellCombos(upgrades).map(combo => combo.id), ['thunderflame']);
  assert.equal(SPELL_COMBOS.thunderflame.required.orb, 3);
  close(lightningInterval(upgrades), 1.8);
  upgrades.lightning = 5;
  close(lightningInterval(upgrades), 1.17);
  assert.equal(String(lightningInterval(upgrades)), '1.17');
  upgrades.orb = 2;
  close(lightningInterval(upgrades), 1.3);
  assert.deepEqual(activeSpellCombos(null), []);
  assert.deepEqual(activeSpellCombos({orb: Infinity, lightning: 5}), []);
  assert.equal(before, '{"orb":3,"lightning":2}');
});

test('ECS thunderflame cadence changes only when activated; damage and paused state stay stable', () => {
  for (const [orb, lightning, expected] of [[2, 3, 2], [3, 2, 2], [3, 3, 1.8], [3, 5, 1.17], [2, 5, 1.3]]) {
    const game = new Engine('mage', {}, 42);
    game.spawnTimer = game.attackTimer = game.orbTimer = 100;
    game.lightningTimer = 0;
    game.upgrades.orb = orb;
    game.upgrades.lightning = lightning;
    const enemy = game.spawn('melee');
    enemy.x = game.player.x + 300;
    enemy.y = game.player.y;
    enemy.hp = enemy.maxHp = 1000;
    game.update(1 / 30);
    close(game.ecs.getComponent(game.playerEntityId, 'spells').lightningTimer, expected);
    close(game.damage.lightning, 22 + lightning * 12);
    const snapshot = JSON.stringify(game);
    game.togglePause();
    const paused = JSON.stringify(game);
    game.update(1);
    assert.equal(JSON.stringify(game), paused);
    assert.notEqual(snapshot, paused);
  }
});

test('build summary and next-rank upgrade preview expose the real combo bonus without mutation', () => {
  const game = new Engine('knight', {}, 7);
  game.upgrades.orb = 3;
  game.upgrades.lightning = 2;
  assert.equal(buildSummary(game).some(entry => entry.id === 'combo:thunderflame'), false);
  assert.match(upgradeInfo('knight', 'lightning', 2, game).description, /解鎖雷焰共鳴/);
  game.upgrades.lightning = 3;
  const before = JSON.stringify(game);
  const summary = buildSummary(game);
  const combo = summary.find(entry => entry.id === 'combo:thunderflame');
  assert.equal(combo.active, true);
  assert.match(combo.description, /10%/);
  close(summary.find(entry => entry.id === 'lightning').stats.interval, 1.8);
  close(upgradeInfo('knight', 'lightning', 3, game).current.interval, 1.8);
  assert.equal(JSON.stringify(game), before);
  game.upgrades.lightning = 2;
  game.upgrades.orb = 2;
  assert.match(upgradeInfo('knight', 'orb', 2, {...game, upgrades: {...game.upgrades, lightning: 3}}).description, /解鎖雷焰共鳴/);
});

test('魂焰牽引 needs compass and third-rank orb without changing unrelated combos', () => {
  const ranks = {orb: 3, lightning: 3};
  const before = JSON.stringify(ranks);
  assert.deepEqual(activeSpellCombos(ranks).map(c => c.id), ['thunderflame']);
  assert.deepEqual(activeSpellCombos(ranks, 'compass').map(c => c.id), ['thunderflame', 'soulflare']);
  assert.equal(SPELL_COMBOS.soulflare.requiredRelic, 'compass');
  close(orbRange(ranks), 85);
  close(orbRange(ranks, 'compass'), 105);
  close(lightningInterval(ranks), 1.8);
  ranks.orb = 5;
  close(orbRange(ranks, 'compass'), 142);
  close(lightningInterval(ranks), 1.8);
  ranks.orb = 2;
  assert.deepEqual(activeSpellCombos(ranks, 'compass'), []);
  close(orbRange(ranks, 'compass'), 85);
  assert.deepEqual(activeSpellCombos({orb: Infinity}, 'compass'), []);
  assert.deepEqual(activeSpellCombos(null, 'compass'), []);
  assert.equal(before, '{"orb":3,"lightning":3}');
});

test('ECS soulflare hits only inside its enlarged orb radius and freezes on pause', () => {
  for (const [relic, orb, empowered] of [
    ['none', 3, false], ['compass', 2, false], ['compass', 3, true],
    ['none', 5, false], ['compass', 5, true]
  ]) {
    const game = new Engine('mage', {}, 42, relic);
    game.spawnTimer = game.attackTimer = game.lightningTimer = 100;
    game.orbTimer = 0;
    game.upgrades.orb = orb;
    const enemy = game.spawn('melee');
    enemy.hp = enemy.maxHp = 1000;
    const base = orb >= 5 ? 122 : 85;
    enemy.x = game.player.x + base + enemy.radius + 10;
    enemy.y = game.player.y;
    game.update(1 / 30);
    close(game.damage.orb, empowered ? 5 + orb * 5 : 0);
    close(game.orbTimer, .5);
    const snapshot = JSON.stringify(game);
    game.togglePause();
    const paused = JSON.stringify(game);
    game.update(1);
    assert.equal(JSON.stringify(game), paused);
    assert.notEqual(snapshot, paused);
  }
});

test('compass upgrade preview, build summary and lightning cadence reflect combined effects without mutation', () => {
  const game = new Engine('elf', {}, 7, 'compass');
  game.upgrades.orb = 2;
  assert.equal(buildSummary(game).some(e => e.id === 'combo:soulflare'), false);
  const preview = upgradeInfo('elf', 'orb', 2, game);
  assert.match(preview.description, /解鎖魂焰牽引/);
  close(preview.current.range, 85);
  close(preview.next.range, 105);
  game.upgrades.orb = 3;
  game.upgrades.lightning = 3;
  const before = JSON.stringify(game);
  const entries = buildSummary(game);
  assert.equal(entries.find(e => e.id === 'combo:soulflare').stats.orbRangeBonus, 20);
  close(entries.find(e => e.id === 'orb').stats.range, 105);
  close(entries.find(e => e.id === 'lightning').stats.interval, 1.8);
  close(upgradeInfo('elf', 'orb', 3, game).current.range, 105);
  assert.deepEqual(entries.filter(e => e.id.startsWith('combo:')).map(e => e.id), ['combo:thunderflame', 'combo:soulflare']);
  assert.equal(JSON.stringify(game), before);
  const plain = new Engine('elf', {}, 7);
  plain.upgrades.orb = 2;
  assert.match(upgradeInfo('elf', 'orb', 2, plain).description, /魂焰牽引：尚需 需裝備獵魂羅盤/);
});

test('combo unlock progress enumerates missing ranks and relic without state mutation', () => {
  const game = new Engine('mage', {}, 7);
  const before = JSON.stringify(game);
  const rows = spellComboProgress(game.upgrades, game.relicId);
  assert.deepEqual(rows.map(row => row.id), ['thunderflame', 'soulflare', 'thunderEcho']);
  assert.deepEqual(rows[0].missing, ['聖焰環 0/3 階', '雷霆誓約 0/3 階']);
  assert.deepEqual(rows[1].missing, ['聖焰環 0/3 階', '需裝備獵魂羅盤（下局出發前選擇）']);
  assert.deepEqual(rows[0].requirements.map(req => [req.id, req.current, req.required, req.met]),
    [['orb', 0, 3, false], ['lightning', 0, 3, false]]);
  assert.equal(JSON.stringify(game), before);
  assert.equal(spellComboProgress(null)[0].active, false);
  assert.deepEqual(spellComboProgress({orb:Infinity, lightning:NaN}, 'compass')[0].missing,
    ['聖焰環 0/3 階', '雷霆誓約 0/3 階']);
  for (const relic of ['none', 'compass', 'ward', 'hourglass']) {
    for (const orb of [0, 2, 3, 5]) for (const lightning of [0, 2, 3, 5]) {
      const upgrades = {orb, lightning};
      const active = activeSpellCombos(upgrades, relic).map(combo => combo.id);
      const progress = spellComboProgress(upgrades, relic);
      assert.deepEqual(progress.filter(row => row.active).map(row => row.id), active);
      for (const row of progress) assert.equal(row.active, row.missing.length === 0);
    }
  }
});

test('upgrade cards show remaining combo ranks after choosing a spell, without mutating the run', () => {
  const game = new Engine('knight', {}, 42);
  game.upgrades.orb = 1;
  game.upgrades.lightning = 1;
  const snapshot = JSON.stringify(game);
  const preview = upgradeInfo('knight', 'orb', 1, game);
  assert.equal(preview.nextLevel, 2);
  assert.ok(preview.description.includes('選擇後組合進度'));
  assert.ok(preview.description.includes('雷焰共鳴：尚需 聖焰環 2/3 階、雷霆誓約 1/3 階'));
  assert.ok(preview.description.includes('魂焰牽引：尚需 聖焰環 2/3 階、需裝備獵魂羅盤'));
  assert.ok(!preview.description.includes('聖焰環 1/3 階'));
  assert.equal(JSON.stringify(game), snapshot);
});

test('upgrade previews switch from pending to unlock and respect equipped relic requirements', () => {
  const plain = new Engine('mage', {}, 7);
  plain.upgrades.orb = 2;
  plain.upgrades.lightning = 3;
  const orb = upgradeInfo('mage', 'orb', 2, plain);
  assert.ok(orb.description.includes('解鎖雷焰共鳴'));
  assert.ok(!orb.description.includes('雷焰共鳴：尚需'));
  assert.ok(orb.description.includes('魂焰牽引：尚需 需裝備獵魂羅盤'));
  const compass = new Engine('mage', {}, 7, 'compass');
  compass.upgrades.orb = 2;
  compass.upgrades.lightning = 3;
  const both = upgradeInfo('mage', 'orb', 2, compass);
  assert.ok(both.description.includes('解鎖雷焰共鳴、魂焰牽引'));
  assert.ok(!both.description.includes('選擇後組合進度'));
});

test('only relevant non-maxed spell cards show pending combos; lightning uses post-choice rank', () => {
  const game = new Engine('elf', {}, 12, 'ward');
  game.upgrades.orb = 1;
  game.upgrades.lightning = 1;
  const lightning = upgradeInfo('elf', 'lightning', 1, game);
  assert.ok(lightning.description.includes('雷焰共鳴：尚需 聖焰環 1/3 階、雷霆誓約 2/3 階'));
  assert.ok(!lightning.description.includes('魂焰牽引：'));
  for (const id of ['weapon', 'haste', 'vitality', 'speed', 'magnet', 'armor']) {
    assert.ok(!upgradeInfo('elf', id, 1, game).description.includes('選擇後組合進度'), id);
  }
  assert.ok(!upgradeInfo('elf', 'orb', 5, game).description.includes('選擇後組合進度'));
  assert.ok(!upgradeInfo('elf', 'lightning', 5, game).description.includes('選擇後組合進度'));
});


test('combo hints expose a separate card section without changing the existing description API', () => {
  const game = new Engine('knight', {}, 27);
  game.upgrades.orb = 1;
  game.upgrades.lightning = 1;
  const snapshot = JSON.stringify(game);
  const orb = upgradeInfo('knight', 'orb', 1, game);
  assert.deepEqual(orb.comboProgress, [
    '雷焰共鳴：尚需 聖焰環 2/3 階、雷霆誓約 1/3 階',
    '魂焰牽引：尚需 聖焰環 2/3 階、需裝備獵魂羅盤（下局出發前選擇）'
  ]);
  assert.ok(!orb.baseDescription.includes('選擇後組合進度'));
  assert.equal(orb.description, orb.baseDescription + '；選擇後組合進度：' + orb.comboProgress.join('；'));
  for (const id of ['weapon', 'haste', 'armor']) {
    const info = upgradeInfo('knight', id, 0, game);
    assert.equal(info.baseDescription, info.description);
    assert.deepEqual(info.comboProgress, []);
  }
  assert.equal(JSON.stringify(game), snapshot);
});

test('雷霆回響 activates only for hourglass and rank-three lightning; cadence is independent', () => {
  for (const relic of ['none','ward','compass','hourglass']) {
    for (const level of [0,1,2,3,5]) {
      const upgrades = Object.freeze({orb:3,lightning:level});
      const bonus = relic === 'hourglass' && level >= 3 ? 1 : 0;
      assert.equal(lightningTargets(upgrades,relic),level ? level+1+bonus : 0);
      assert.equal(activeSpellCombos(upgrades,relic).some(c=>c.id==='thunderEcho'),!!bonus);
      assert.equal(spellComboProgress(upgrades,relic).find(c=>c.id==='thunderEcho').active,!!bonus);
      close(lightningInterval(upgrades),level>=5?1.17:level>=3?1.8:2);
    }
  }
  assert.equal(lightningTargets({lightning:Infinity},'hourglass'),0);
});

test('ECS 雷霆回響 hits one additional distinct in-range living enemy, preserving original damage and cadence', () => {
  for (const [relic,level,orb] of [['none',3,3],['ward',3,3],['compass',3,3],['hourglass',2,3],['hourglass',3,0],['hourglass',3,3],['hourglass',5,3]]) {
    const game = new Engine('mage',{},42,relic);
    game.spawnTimer=game.attackTimer=game.orbTimer=100;
    game.lightningTimer=0;
    Object.assign(game.upgrades,{lightning:level,orb});
    const enemies=Array.from({length:8},(_,i)=>{
      const e=game.spawn('melee');e.x=game.player.x+200+20*i;e.y=game.player.y;e.hp=e.maxHp=1000;return e;
    });
    const far=game.spawn('melee');far.x=game.player.x+650;far.y=game.player.y;far.hp=far.maxHp=1000;
    const dead=game.spawn('melee');dead.x=game.player.x+100;dead.y=game.player.y;dead.hp=0;
    const expected=level+1+(relic==='hourglass'&&level>=3?1:0);
    const damage=22+12*level;
    game.update(1/30);
    assert.equal(game.damage.lightning,expected*damage);
    for(const [i,e] of enemies.entries())assert.equal(e.hp,1000-(i<expected?damage:0));
    assert.equal(far.hp,1000);
    close(game.ecs.getComponent(game.playerEntityId,'spells').lightningTimer,level===5?1.17:orb>=3&&level>=3?1.8:2);
    assert.equal(game.potions,relic==='hourglass'?2:3);
  }
  const sparse=new Engine('mage',{},42,'hourglass');
  sparse.spawnTimer=sparse.attackTimer=sparse.orbTimer=100;sparse.lightningTimer=0;sparse.upgrades.lightning=3;
  const only=sparse.spawn('melee');only.x=sparse.player.x+200;only.y=sparse.player.y;only.hp=only.maxHp=1000;
  sparse.update(1/30);
  assert.equal(only.hp,942);assert.equal(sparse.damage.lightning,58);
});

test('雷霆回響 preview and build summary report actual target cap and potion tradeoff without mutation', () => {
  const game=new Engine('mage',{},42,'hourglass');
  game.upgrades.lightning=2;
  const before=JSON.stringify(game);
  const preview=upgradeInfo('mage','lightning',2,game);
  assert.equal(preview.current.targets,3);assert.equal(preview.next.targets,5);
  assert.match(preview.baseDescription,/解鎖雷霆回響/);
  assert.equal(JSON.stringify(game),before);
  game.status='upgrade';game.choices=[{id:'lightning'}];
  assert.equal(game.chooseUpgrade('lightning'),true);
  const after=JSON.stringify(game),rows=buildSummary(game);
  assert.equal(rows.find(e=>e.id==='lightning').stats.targets,5);
  assert.equal(rows.find(e=>e.id==='combo:thunderEcho').stats.lightningTargetBonus,1);
  assert.match(rows.find(e=>e.id==='relic').description,/2 瓶/);
  assert.equal(JSON.stringify(game),after);
  const plain=new Engine('mage',{},42);
  plain.upgrades.lightning=2;
  assert.equal(upgradeInfo('mage','lightning',2,plain).next.targets,4);
  assert.match(upgradeInfo('mage','lightning',2,plain).description,/需裝備回響沙漏/);
});
