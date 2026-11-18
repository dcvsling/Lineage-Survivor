import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCommand} from '../dist/console.js';
import {Engine} from '../dist/engine.js';
test('console help and unknown commands are safe',()=>{
 assert.equal(executeCommand(' HELP ').ok,true);
 assert.equal(executeCommand('eval alert(1)',new Engine()).ok,false);
 assert.equal(executeCommand('',null).ok,false);
});
test('console reports game state without mutating simulation',()=>{
 const g=new Engine('mage',{},42);
 const before=JSON.stringify(g);
 for(const command of ['status','player','skills']) {
  const result=executeCommand(command,g);
  assert.equal(result.ok,true);
  assert.ok(result.message.length>0);
 }
 assert.equal(JSON.stringify(g),before);
 assert.equal(executeCommand('player',null).ok,false);
});


test('console combos derives both spell combinations and ranges without mutating the run', () => {
 const g=new Engine('mage',{},42,'compass');
 const start=JSON.stringify(g);
 const inactive=executeCommand(' CoMbOs ',g);
 assert.equal(inactive.ok,true);
 assert.match(inactive.message,/尚未啟用/);
 assert.match(inactive.message,/未習得/);
 assert.equal(JSON.stringify(g),start);
 g.upgrades.orb=3;
 g.upgrades.lightning=3;
 const before=JSON.stringify(g);
 const result=executeCommand('combos',g);
 assert.equal(result.ok,true);
 assert.match(result.message,/雷焰共鳴/);
 assert.match(result.message,/魂焰牽引/);
 assert.match(result.message,/雷霆間隔: 1\.8s/);
 assert.match(result.message,/聖焰環半徑: 105px/);
 assert.equal(JSON.stringify(g),before);
 const plain=new Engine('mage',{},42);
 plain.upgrades.orb=3;
 plain.upgrades.lightning=3;
 assert.doesNotMatch(executeCommand('combos',plain).message,/魂焰牽引/);
 assert.equal(executeCommand('combos',null).ok,false);
});

test('console cooldowns read authoritative ECS timers and reject writes', () => {
 const g=new Engine('elf',{},7);
 const ability=g.ecs.getComponent(g.playerEntityId,'ability');
 const spells=g.ecs.getComponent(g.playerEntityId,'spells');
 ability.cooldown=7.216;
 ability.duration=.3;
 spells.attackTimer=.5;
 spells.orbTimer=1.25;
 spells.lightningTimer=.75;
 const before=JSON.stringify(g);
 const locked=executeCommand('cooldowns',g);
 assert.equal(locked.ok,true);
 assert.match(locked.message,/職業技: 7\.22s/);
 assert.match(locked.message,/持續: 0\.30s/);
 assert.match(locked.message,/自動攻擊: 0\.50s/);
 assert.match(locked.message,/聖焰環: 未習得/);
 assert.match(locked.message,/雷霆誓約: 未習得/);
 g.upgrades.orb=1;
 g.upgrades.lightning=1;
 const active=executeCommand('cooldowns',g);
 assert.match(active.message,/聖焰環: 1\.25s/);
 assert.match(active.message,/雷霆誓約: 0\.75s/);
 assert.equal(JSON.stringify(g),JSON.stringify({...JSON.parse(before),upgrades:{...g.upgrades}}));
 assert.equal(executeCommand('cooldowns extra',g).ok,false);
 assert.equal(executeCommand('combos;alert(1)',g).ok,false);
 assert.equal(executeCommand('cooldowns',{ecs:{getComponent:()=>undefined},playerEntityId:1}).ok,false);
});
