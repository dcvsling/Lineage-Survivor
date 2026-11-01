import test from 'node:test';
import assert from 'node:assert/strict';
import {forge,forgeCost} from '../dist/progression.js';
import {defaultSave,exportSave,importSave} from '../dist/save.js';
test('forge consumes exact quadratic cost and never mutates original',()=>{
 const save={...defaultSave(),gold:500};const before=JSON.stringify(save);
 const first=forge(save,'weapon');assert.equal(first.ok,true);assert.equal(first.save.gold,400);assert.equal(first.save.equipment.weapon,1);assert.equal(JSON.stringify(save),before);
 const second=forge(first.save,'weapon');assert.equal(second.ok,true);assert.equal(second.save.gold,0);assert.equal(second.save.equipment.weapon,2);
 const third=forge(second.save,'weapon');assert.equal(third.ok,false);assert.deepEqual(third.save,second.save);
});
test('forge rejects unknown slots, unsafe records, and maximum-tier spending',()=>{
 const save={...defaultSave(),gold:9999,equipment:{weapon:5,armor:0,boots:0}};
 assert.equal(forgeCost(save,'weapon'),null);assert.equal(forge(save,'weapon').ok,false);
 for(const slot of ['invalid','__proto__','toString'])assert.equal(forge(save,slot).ok,false);
 assert.equal(forge({...save,gold:Infinity},'boots').ok,false);assert.equal(forgeCost(save,'armor'),100);
});
test('export and import roundtrip old v1 progress and reject invalid versions',()=>{
 const save={...defaultSave(),gold:1234,best:480.3,wins:2,equipment:{weapon:3,armor:2,boots:1}};
 assert.deepEqual(importSave(exportSave(save)).save,save);
 const legacy={...save};delete legacy.version;assert.deepEqual(importSave(JSON.stringify(legacy)).save,save);
 for(const input of ['{}','null','[]','{bad',JSON.stringify({...save,version:9}),JSON.stringify({...save,gold:-1}),JSON.stringify({...save,equipment:{weapon:6,armor:0,boots:0}}),' '.repeat(32769)])assert.equal(importSave(input).ok,false);
 assert.throws(()=>exportSave({...save,gold:Infinity}));
});
