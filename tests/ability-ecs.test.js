import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';
import {ComponentWorld,createPlayerCombatState,exposeComponentField} from '../dist/ecs.js';

test('player combat components require a live entity and bind both directions', () => {
  const world=new ComponentWorld();
  assert.throws(()=>createPlayerCombatState(world,999),RangeError);
  const id=world.createEntity();
  const {ability,spells}=createPlayerCombatState(world,id);
  assert.deepEqual(ability,{cooldown:0,duration:0,dashDirection:{x:1,y:0}});
  assert.deepEqual(spells,{attackTimer:0,orbTimer:0,lightningTimer:2});
  const legacy={};
  exposeComponentField(legacy,'abilityCooldown',ability,'cooldown');
  legacy.abilityCooldown=3;
  assert.equal(ability.cooldown,3);
  ability.cooldown=1;
  assert.equal(legacy.abilityCooldown,1);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)),{abilityCooldown:1});
  assert.equal(world.destroyEntity(id),true);
  assert.equal(world.getComponent(id,'ability'),undefined);
  assert.equal(world.getComponent(id,'spells'),undefined);
});

test('class abilities and spell timers are ECS-owned without changing public snapshot shape', () => {
  for(const classId of ['knight','elf','mage']){
    const game=new Engine(classId,{},42);
    const id=game.playerEntityId;
    const ability=game.ecs.getComponent(id,'ability');
    const spells=game.ecs.getComponent(id,'spells');
    assert.deepEqual([...game.ecs.query('ability','spells')],[id]);
    assert.deepEqual(ability,{cooldown:0,duration:0,dashDirection:{x:1,y:0}});
    assert.deepEqual(spells,{attackTimer:0,orbTimer:0,lightningTimer:2});
    const fields=['abilityCooldown','abilityDuration','dashDirection','attackTimer','orbTimer','lightningTimer'];
    for(const key of fields)assert.ok(Object.keys(game).includes(key),key);
    const snapshot=JSON.parse(JSON.stringify(game));
    assert.equal(snapshot.ecs,undefined);
    assert.equal(snapshot.abilityCooldown,0);
    assert.equal(snapshot.abilityDuration,0);
    assert.deepEqual(snapshot.dashDirection,{x:1,y:0});
    assert.equal(snapshot.attackTimer,0);
    assert.equal(snapshot.orbTimer,0);
    assert.equal(snapshot.lightningTimer,2);
    game.abilityCooldown=4;
    ability.duration=.2;
    game.dashDirection={x:0,y:-1};
    spells.attackTimer=8;
    game.orbTimer=9;
    spells.lightningTimer=10;
    assert.equal(ability.cooldown,4);
    assert.equal(game.abilityDuration,.2);
    assert.deepEqual(ability.dashDirection,{x:0,y:-1});
    assert.equal(game.attackTimer,8);
    assert.equal(spells.orbTimer,9);
    assert.equal(game.lightningTimer,10);
  }
});

test('casts and cooldown ticks use ECS state, pause freezes it and runs remain isolated', () => {
  for(const classId of ['knight','elf','mage']){
    const game=new Engine(classId,{},2026);
    const other=new Engine(classId,{},2026);
    const ability=game.ecs.getComponent(game.playerEntityId,'ability');
    const spells=game.ecs.getComponent(game.playerEntityId,'spells');
    game.spawnTimer=100;
    game.attackTimer=100;
    game.orbTimer=100;
    game.lightningTimer=100;
    assert.equal(game.useAbility({x:0,y:1}),true);
    assert.equal(ability.cooldown,game.ability.cooldown);
    assert.equal(ability.duration,game.ability.duration);
    if(classId==='elf')assert.deepEqual(ability.dashDirection,{x:0,y:1});
    const frozen=JSON.stringify({ability,spells});
    game.togglePause();
    game.update(.2,{x:1,y:0});
    assert.equal(JSON.stringify({ability,spells}),frozen);
    game.togglePause();
    game.update(.1,{x:1,y:0});
    assert.ok(ability.cooldown<game.ability.cooldown);
    assert.ok(ability.duration<game.ability.duration);
    assert.ok(spells.attackTimer<100);
    assert.ok(spells.orbTimer<100);
    assert.ok(spells.lightningTimer<100);
    assert.equal(game.useAbility({x:1,y:0}),false);
    ability.cooldown=0;
    assert.equal(game.useAbility({x:1,y:0}),true);
    assert.equal(other.abilityCooldown,0);
    assert.equal(other.attackTimer,0);
  }
});
