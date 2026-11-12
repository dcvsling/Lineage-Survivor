import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';

const nearly=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('knight guard knocks back nearby living enemies and exposes ECS cooldown',()=>{
  const game=new Engine('knight',{},12);
  const enemy=game.spawn('melee');
  enemy.x=game.player.x+50;enemy.y=game.player.y;
  const far=game.spawn('fast');
  far.x=game.player.x+300;far.y=game.player.y;
  const farX=far.x;
  const state=game.ecs.getComponent(game.playerEntityId,'ability');
  assert.equal(game.useAbility(),true);
  assert.equal(enemy.x,game.player.x+160);
  assert.equal(far.x,farX);
  assert.equal(state.cooldown,12);
  assert.equal(state.duration,3);
  assert.equal(game.abilityCooldown,state.cooldown);
  assert.equal(game.effects.at(-1).type,'ward');
  const count=game.effects.length;
  assert.equal(game.useAbility(),false);
  assert.equal(game.effects.length,count);
  game.togglePause();
  game.abilityCooldown=0;
  assert.equal(game.useAbility(),false);
});

test('elf dash normalizes input, falls back to facing and rejects uncoercible directions',()=>{
  const game=new Engine('elf',{},23);
  const state=game.ecs.getComponent(game.playerEntityId,'ability');
  assert.equal(game.useAbility({x:3,y:4}),true);
  nearly(state.dashDirection.x,.6);
  nearly(state.dashDirection.y,.8);
  assert.equal(state.duration,.35);
  assert.equal(state.cooldown,10);
  game.abilityCooldown=0;
  game.player.facing=Math.PI/2;
  assert.equal(game.useAbility({x:0,y:0}),true);
  nearly(state.dashDirection.x,0);
  nearly(state.dashDirection.y,1);
  game.abilityCooldown=0;
  assert.equal(game.useAbility({x:Symbol('invalid'),y:0}),false);
  assert.equal(state.cooldown,0);
});

test('mage frost updates enemy movement ECS slow and deals the same ability damage',()=>{
  const game=new Engine('mage',{},42);
  const close=game.spawn('melee');
  close.x=game.player.x+40;close.y=game.player.y;
  close.hp=close.maxHp=200;
  const distant=game.spawn('fast');
  distant.x=game.player.x+400;distant.y=game.player.y;
  const hp=distant.hp;
  assert.equal(game.useAbility(),true);
  const state=game.ecs.getComponent(game.playerEntityId,'ability');
  assert.equal(state.cooldown,14);
  assert.equal(state.duration,.5);
  assert.equal(close.hp,152);
  assert.equal(game.damage.ability,48);
  assert.equal(close.slowTimer,3);
  assert.equal(game.ecs.getComponent(close.ecsEntityId,'movement').slowTimer,3);
  assert.equal(distant.hp,hp);
  assert.equal(game.effects.at(-1).type,'frost');
});
