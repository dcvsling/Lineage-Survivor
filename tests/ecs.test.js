import test from 'node:test';
import assert from 'node:assert/strict';
import {ComponentWorld, createPlayerEntity, createEnemyEntity} from '../dist/ecs.js';
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
  assert.ok(Math.abs(movement.speed - 218) < 1e-9);
  vitals.maxHp = 160;
  movement.facing = 1.5;
  assert.equal(player.maxHp,160);
  assert.equal(player.facing,1.5);
  assert.deepEqual(JSON.parse(JSON.stringify(player)), {
    x:1203,y:1200,radius:13,hp:75,maxHp:160,speed:200 * 1.09,facing:1.5
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

test('enemy components are live and legacy enemy shape remains serializable', () => {
  const game = new Engine('mage',{},42);
  const enemy = game.spawn('ranged');
  const id = enemy.ecsEntityId;
  assert.ok(Number.isInteger(id));
  assert.equal(Object.prototype.propertyIsEnumerable.call(enemy,'ecsEntityId'),false);
  assert.deepEqual([...game.ecs.query('enemy')],[id]);
  const before = JSON.parse(JSON.stringify(enemy));
  assert.ok(!Object.hasOwn(before,'ecsEntityId'));
  assert.equal(before.type,'ranged');
  enemy.x += 15;
  enemy.hp -= 4;
  enemy.speed *= .5;
  assert.equal(game.ecs.getComponent(id,'position').x,enemy.x);
  assert.equal(game.ecs.getComponent(id,'vitals').hp,enemy.hp);
  assert.equal(game.ecs.getComponent(id,'movement').speed,enemy.speed);
  game.ecs.getComponent(id,'position').y -= 10;
  assert.equal(enemy.y, before.y - 10);
});

test('dead enemies remove their ECS entities on cleanup without additional rewards', () => {
  const game = new Engine('knight',{},17);
  const enemy = game.spawn('melee');
  const id = enemy.ecsEntityId;
  game.hit(enemy,9999);
  assert.equal(game.ecs.getComponent(id,'vitals').hp<=0,true);
  game.spawnTimer = 100;
  game.update(1/30);
  assert.equal(game.enemies.some(e=>e.id===enemy.id),false);
  assert.equal(game.ecs.getComponent(id,'position'),undefined);
  assert.equal(game.ecs.getComponent(id,'combat'),undefined);
  assert.deepEqual([...game.ecs.query('enemy')],[]);
  assert.equal(game.kills,1);
});

test('boss spawn at population cap retires an ECS entity without a phantom enemy', () => {
  const game = new Engine('elf',{},123);
  for(let i=0;i<180;i++)assert.ok(game.spawn('melee'));
  const originalIds = new Set(game.enemies.map(e=>e.ecsEntityId));
  const boss = game.spawn('boss');
  assert.ok(boss);
  assert.equal(game.enemies.length,180);
  const live = [...game.ecs.query('enemy')];
  assert.equal(live.length,180);
  assert.ok(live.includes(boss.ecsEntityId));
  assert.equal([...originalIds].filter(id=>!live.includes(id)).length,1);
  assert.equal(game.enemies.some(e=>e.type==='boss'),true);
});

test('enemy combat fields are ECS-owned without changing serialized enemy shape', () => {
  const game = new Engine('elf',{},42);
  const enemy = game.spawn('ranged');
  const combat = game.ecs.getComponent(enemy.ecsEntityId,'combat');
  const fields = ['damage','shootTimer','warning','aimAngle','aimAngles','hit'];
  const originalKeys = Object.keys(JSON.parse(JSON.stringify(enemy)));
  assert.deepEqual(Object.keys(combat),fields);
  for (const key of fields) assert.deepEqual(combat[key],enemy[key]);

  enemy.damage=18;
  enemy.shootTimer=.25;
  enemy.aimAngles=[.1,.2,.3];
  assert.equal(combat.damage,18);
  assert.equal(combat.shootTimer,.25);
  assert.strictEqual(combat.aimAngles,enemy.aimAngles);

  combat.warning=.4;
  combat.aimAngle=1.3;
  combat.hit=.12;
  assert.equal(enemy.warning,.4);
  assert.equal(enemy.aimAngle,1.3);
  assert.equal(enemy.hit,.12);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(enemy))),originalKeys);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(enemy)),'ecsEntityId'),false);
});

test('enemy telegraph and shot cadence write through combat component and freeze on pause', () => {
  const game=new Engine('knight',{},42);
  const enemy=game.spawn('ranged');
  const combat=game.ecs.getComponent(enemy.ecsEntityId,'combat');
  game.spawnTimer=100;
  game.attackTimer=100;
  enemy.shootTimer=0;
  game.update(.01);
  assert.equal(combat.warning,.6);
  assert.equal(combat.aimAngles.length,1);
  assert.equal(game.projectiles.length,0);
  game.togglePause();
  const paused=JSON.stringify(combat);
  game.update(1);
  assert.equal(JSON.stringify(combat),paused);
  game.togglePause();
  game.update(.25);
  game.update(.25);
  game.update(.1);
  assert.equal(combat.warning,0);
  assert.equal(combat.shootTimer,2.9);
  assert.equal(game.projectiles.filter(p=>p.hostile).length,1);
});

test('generic enemy ECS adapter does not introduce absent combat fields', () => {
  const world=new ComponentWorld();
  const initial={id:7,type:'melee',x:1,y:2,radius:3,hp:10,maxHp:10,speed:2};
  const {id,enemy}=createEnemyEntity(world,initial);
  assert.deepEqual(Object.keys(enemy),Object.keys(initial));
  assert.deepEqual(world.getComponent(id,'combat'),{});
  world.destroyEntity(id);
  assert.equal(world.getComponent(id,'combat'),undefined);
});
