import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';
import {activeSpellCombos, lightningInterval, SPELL_COMBOS} from '../dist/spell-combos.js';
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
