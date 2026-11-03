import test from 'node:test';
import assert from 'node:assert/strict';
import {ComponentWorld, createPlayerEntity} from '../dist/ecs.js';
import {Engine} from '../dist/engine.js';

test('ECS entities, components and queries have predictable lifetimes', () => {
  const world = new ComponentWorld();
  const a = world.createEntity(), b = world.createEntity();
  const aPosition = {x:1,y:2};
  world.addComponent(a,'position',aPosition);
  world.addComponent(a,'vitals',{hp:20});
  world.addComponent(b,'position',{x:3,y:4});
  assert.equal(world.getComponent(a,'position'),aPosition);
  assert.deepEqual([...world.query('position')],[a,b]);
  assert.deepEqual([...world.query('position','vitals')],[a]);
  assert.deepEqual([...world.query('missing')],[]);
  assert.throws(()=>world.addComponent(a,'position',{}),/Duplicate/);
  assert.throws(()=>world.addComponent(100,'position',{}),RangeError);
  assert.equal(world.removeComponent(a,'vitals'),true);
  assert.deepEqual([...world.query('position','vitals')],[]);
  assert.equal(world.destroyEntity(a),true);
  assert.equal(world.destroyEntity(a),false);
  assert.equal(world.getComponent(a,'position'),undefined);
  assert.deepEqual([...world.query()],[b]);
});

test('legacy player view and ECS components share the same authoritative values', () => {
  const world = new ComponentWorld();
  const {id,player} = createPlayerEntity(world, {
    x:1200,y:1200,radius:13,hp:120,maxHp:140,speed:200,facing:0
  });
  const position = world.getComponent(id,'position');
  const vitals = world.getComponent(id,'vitals');
  const movement = world.getComponent(id,'movement');
  assert.deepEqual(Object.keys(player), ['x','y','radius','hp','maxHp','speed','facing']);
  player.hp = 75;
  player.x += 3;
  player.speed *= 1.09;
  assert.equal(vitals.hp,75);
  assert.equal(position.x,1203);
  assert.equal(movement.speed,218);
  vitals.maxHp = 160;
  movement.facing = 1.5;
  assert.equal(player.maxHp,160);
  assert.equal(player.facing,1.5);
  assert.deepEqual(JSON.parse(JSON.stringify(player)), {
    x:1203,y:1200,radius:13,hp:75,maxHp:160,speed:218,facing:1.5
  });
});

test('combat Engine reads and writes ECS player state without changing public player shape', () => {
  for (const classId of ['knight','elf','mage']) {
    const game = new Engine(classId,{armor:2,boots:1},42);
    const id = game.playerEntityId;
    const position = game.ecs.getComponent(id,'position');
    const vitals = game.ecs.getComponent(id,'vitals');
    const movement = game.ecs.getComponent(id,'movement');
    assert.equal(position.x,game.player.x);
    assert.equal(vitals.hp,game.player.hp);
    assert.equal(movement.speed,game.player.speed);
    const startingX = game.player.x;
    game.spawnTimer = 100;
    game.update(1/30,{x:1,y:0});
    assert.ok(position.x>startingX);
    assert.equal(position.x,game.player.x);
    game.player.hp = 1;
    assert.equal(game.heal(),true);
    assert.equal(vitals.hp,game.player.hp);
    assert.equal(JSON.parse(JSON.stringify(game)).ecs,undefined,
      'ECS internal index must not expand deterministic game snapshots');
  }
  const ward = new Engine('knight',{},42,'ward');
  assert.equal(ward.ecs.getComponent(ward.playerEntityId,'movement').speed,ward.player.speed);
});
