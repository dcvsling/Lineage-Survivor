import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';
import {ComponentWorld, createEnemyEntity} from '../dist/ecs.js';
import {stepEnemyMovement} from '../dist/enemy-movement.js';

test('slow timer remains absent in initial JSON but is owned by movement ECS after frost', () => {
  const g = new Engine('mage', {}, 42);
  const enemy = g.spawn('melee');
  enemy.x = g.player.x + 100;
  enemy.y = g.player.y;
  const movement = g.ecs.getComponent(enemy.ecsEntityId, 'movement');
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(enemy)), 'slowTimer'), false);
  assert.equal(Object.hasOwn(movement, 'slowTimer'), false);
  assert.equal(g.useAbility(), true);
  assert.equal(enemy.slowTimer, 3);
  assert.equal(movement.slowTimer, 3);
  assert.equal(JSON.parse(JSON.stringify(enemy)).slowTimer, 3);
  g.spawnTimer = 100;
  g.attackTimer = 100;
  g.update(.1);
  assert.ok(Math.abs(movement.slowTimer - 2.9) < 1e-9);
  movement.slowTimer = 1.5;
  assert.equal(enemy.slowTimer, 1.5);
  enemy.slowTimer = 2;
  assert.equal(movement.slowTimer, 2);
  g.togglePause();
  g.update(.25);
  assert.equal(movement.slowTimer, 2);
});

test('movement helper preserves pre-move contact distance and slowed displacement', () => {
  const world = new ComponentWorld();
  const {id, enemy} = createEnemyEntity(world, {
    id: 7, type: 'melee', x: 100, y: 100, radius: 10,
    hp: 20, maxHp: 20, speed: 100, slowTimer: .5
  });
  assert.equal(stepEnemyMovement(enemy, {x: 200, y: 100}, .1), 100);
  assert.ok(Math.abs(enemy.x - 104) < 1e-9);
  assert.ok(Math.abs(enemy.slowTimer - .4) < 1e-9);
  assert.equal(world.getComponent(id, 'movement').slowTimer, enemy.slowTimer);
  assert.ok(Object.hasOwn(JSON.parse(JSON.stringify(enemy)), 'slowTimer'));
});

test('ranged spacing, expiration and world clamping retain legacy behavior', () => {
  const e = {type:'ranged', x:100, y:100, speed:100, slowTimer:.1};
  assert.equal(stepEnemyMovement(e, {x:300,y:100}, .1),200);
  assert.equal(e.x,100,'ranged enemy holds at its preferred distance');
  assert.equal(e.slowTimer,0);
  stepEnemyMovement(e,{x:110,y:100},.1);
  assert.equal(e.x,94,'ranged enemy retreats when player is too close');
  e.type='melee';e.x=2384;e.y=100;
  stepEnemyMovement(e,{x:2500,y:100},.5);
  assert.equal(e.x,2385,'enemy position remains inside world bounds');
});
