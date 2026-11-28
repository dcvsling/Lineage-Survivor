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

test('lightning diagnostics distinguish eligible casts from actual bonus hits and damage',()=>{
  const cases=[
    ['none',3,6,0,0,0],
    ['ward',3,6,0,0,0],
    ['compass',3,6,0,0,0],
    ['hourglass',2,6,0,0,0],
    ['hourglass',3,0,1,0,0],
    ['hourglass',3,4,1,0,0],
    ['hourglass',3,5,1,1,10],
    ['hourglass',3,6,1,1,10],
    ['hourglass',5,7,1,1,10]
  ];
  for(const [relic,rank,count,eligible,triggered,damage] of cases){
    const g=new Engine('mage',{},42,relic);
    g.spawnTimer=g.attackTimer=g.orbTimer=100;
    g.lightningTimer=0;g.upgrades.lightning=rank;
    for(let i=0;i<count;i++){
      const e=g.spawn('melee');e.x=g.player.x+200+i*20;e.y=g.player.y;
      e.hp=e.maxHp=i===rank+1?10:1000;
    }
    const dead=g.spawn('melee');dead.x=g.player.x+100;dead.y=g.player.y;dead.hp=0;
    const far=g.spawn('melee');far.x=g.player.x+650;far.y=g.player.y;far.hp=far.maxHp=1000;
    g.update(1/30);
    assert.deepEqual(g.spellMetrics,{lightningCasts:1,thunderEchoEligibleCasts:eligible,thunderEchoTriggeredCasts:triggered,thunderEchoExtraHits:triggered,thunderEchoExtraDamage:damage},`${relic}/${rank}/${count}`);
    assert.equal(far.hp,1000);
    const echoEffects=g.effects.filter(e=>e.type==='lightningEcho');
    const ordinaryEffects=g.effects.filter(e=>e.type==='lightning');
    assert.equal(echoEffects.length,triggered);
    assert.equal(ordinaryEffects.length,Math.min(count,rank+1));
    assert.ok(ordinaryEffects.every(e=>e.color==='#9cbbff'&&e.radius===30&&e.maxLife===.3));
    assert.ok(echoEffects.every(e=>e.color==='#ffd45c'&&e.radius===30&&e.maxLife===.3));
    if(triggered)assert.ok(Math.abs(echoEffects[0].x-(g.player.x+200+(rank+1)*20))<1e-8);
    assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(g)),'spellMetrics'),false);
  }
});

test('spell diagnostics are per-run, deterministic, and frozen while paused or terminal',()=>{
  function replay(){
    const g=new Engine('mage',{},2026,'hourglass');
    g.spawnTimer=g.attackTimer=g.orbTimer=100;g.lightningTimer=0;g.upgrades.lightning=3;
    for(let i=0;i<5;i++){const e=g.spawn('melee');e.x=g.player.x+250+i*20;e.y=g.player.y;e.hp=e.maxHp=1000;e.speed=0;}
    const zero={...g.spellMetrics};
    g.togglePause();g.update(1/30);assert.deepEqual(g.spellMetrics,zero);
    g.togglePause();g.update(1/30);
    assert.equal(g.spellMetrics.thunderEchoExtraHits,1);
    g.lightningTimer=0;g.update(1/30);
    assert.equal(g.spellMetrics.thunderEchoExtraHits,2);
    assert.equal(g.spellMetrics.thunderEchoExtraDamage,116);
    g.finish('retreat');const frozen={...g.spellMetrics};g.update(1/30);
    assert.deepEqual(g.spellMetrics,frozen);
    return {metrics:frozen,world:JSON.stringify(g)};
  }
  assert.deepEqual(replay(),replay());
  assert.deepEqual(new Engine().spellMetrics,{lightningCasts:0,thunderEchoEligibleCasts:0,thunderEchoTriggeredCasts:0,thunderEchoExtraHits:0,thunderEchoExtraDamage:0});
});
