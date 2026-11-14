import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';
import {activeSpellCombos, lightningInterval, orbRange, SPELL_COMBOS} from '../dist/spell-combos.js';
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
  assert.doesNotMatch(upgradeInfo('elf', 'orb', 2, plain).description, /魂焰牽引/);
});
