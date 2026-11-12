import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('ECS spell system preserves class auto-attack cadence and legacy getters',()=>{
  const cadence={knight:.72,elf:.65,mage:1.05};
  for(const classId of Object.keys(cadence)){
    const game=new Engine(classId,{},31);
    const spells=game.ecs.getComponent(game.playerEntityId,'spells');
    game.spawnTimer=100;
    spells.attackTimer=0;
    spells.orbTimer=10;
    spells.lightningTimer=10;
    game.update(1/30);
    close(spells.attackTimer,cadence[classId]);
    close(game.attackTimer,spells.attackTimer);
    close(game.orbTimer,10-1/30);
    close(game.lightningTimer,10-1/30);
    game.upgrades.haste=1;
    game.attackTimer=0;
    game.update(1/30);
    close(spells.attackTimer,cadence[classId]*.88);
  }
});

test('orb then lightning execute once in order with ECS-owned cooldowns',()=>{
  const game=new Engine('mage',{},42);
  game.spawnTimer=100;
  game.attackTimer=100;
  game.upgrades.orb=2;
  game.upgrades.lightning=1;
  const enemy=game.spawn('melee');
  enemy.x=game.player.x+30;
  enemy.y=game.player.y;
  enemy.maxHp=enemy.hp=500;
  const spells=game.ecs.getComponent(game.playerEntityId,'spells');
  spells.orbTimer=spells.lightningTimer=0;
  game.update(1/30);
  assert.equal(game.damage.orb,15);
  assert.equal(game.damage.lightning,34);
  assert.equal(enemy.hp,451);
  assert.equal(game.orbTimer,.5);
  assert.equal(game.lightningTimer,2);
  game.update(1/30);
  assert.equal(game.damage.orb,15);
  assert.equal(game.damage.lightning,34);
});

test('ability cooldown ticks only in play, after contact resolves in the same step',()=>{
  const game=new Engine('knight',{},100);
  game.spawnTimer=100;
  game.attackTimer=100;
  game.abilityCooldown=1;
  game.abilityDuration=.001;
  const enemy=game.spawn('melee');
  enemy.x=game.player.x+1;
  enemy.y=game.player.y;
  enemy.damage=20;
  const ability=game.ecs.getComponent(game.playerEntityId,'ability');
  const before=JSON.stringify({ability,spells:game.ecs.getComponent(game.playerEntityId,'spells')});
  const hp=game.player.hp;
  game.togglePause();
  game.update(1/30);
  assert.equal(JSON.stringify({ability,spells:game.ecs.getComponent(game.playerEntityId,'spells')}),before);
  assert.equal(game.player.hp,hp);
  game.togglePause();
  game.update(1/30);
  assert.equal(game.player.hp,hp-7); // knight 65% damage reduction on the final active step
  assert.equal(ability.duration,0);
  close(ability.cooldown,1-1/30);
  close(game.abilityCooldown,ability.cooldown);
});
