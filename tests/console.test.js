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

