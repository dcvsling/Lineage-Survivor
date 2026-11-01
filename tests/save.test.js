import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,defaultSave,sanitizeSave,readSave,persistSave} from '../dist/save.js';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
test('missing save yields independent versioned defaults',()=>{const a=readSave(memory());assert.equal(a.storageOK,true);assert.equal(a.save.version,1);a.save.equipment.weapon=4;assert.equal(defaultSave().equipment.weapon,0);});
test('corrupt JSON is recoverable without incorrectly declaring storage blocked',()=>{const s=memory();s.setItem(SAVE_KEY,'{broken');const result=readSave(s);assert.deepEqual(result.save,defaultSave());assert.equal(result.storageOK,true);assert.equal(result.recovered,true);assert.equal(persistSave(result.save,s).storageOK,true);});
test('blocked storage and failed writes return in-memory progress safely',()=>{const blocked={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}};assert.equal(readSave(blocked).storageOK,false);const result=persistSave({...defaultSave(),gold:42},blocked);assert.equal(result.storageOK,false);assert.equal(result.save.gold,42);});
test('equipment and progress persist across reload roundtrip',()=>{const s=memory(),save={version:1,equipment:{weapon:3,armor:2,boots:1},gold:1234,best:480.1,wins:2};assert.equal(persistSave(save,s).storageOK,true);assert.deepEqual(readSave(s).save,save);});
test('numeric fields reject Infinity, NaN, strings and negatives; tiers are integers',()=>{const save=sanitizeSave({equipment:{weapon:Infinity,armor:3.9,boots:-2},gold:NaN,best:Infinity,wins:'12'});assert.deepEqual(save,{version:1,equipment:{weapon:0,armor:3,boots:0},gold:0,best:0,wins:0});assert.equal(sanitizeSave({equipment:{weapon:99},gold:1e20,best:1e30,wins:1e20}).equipment.weapon,5);assert.equal(sanitizeSave({gold:1e20}).gold,1e12);});
test('legacy schema migrates, unknown versions and nonobjects fall back',()=>{assert.equal(sanitizeSave({equipment:{weapon:2},gold:5}).gold,5);assert.deepEqual(sanitizeSave({version:99,gold:5}),defaultSave());for(const raw of [null,[],42,'text'])assert.deepEqual(sanitizeSave(raw),defaultSave());});
test('serialized overflow cannot introduce non-finite values',()=>{const s=memory();s.setItem(SAVE_KEY,'{"gold":1e999,"best":1e999,"equipment":{"weapon":1e999}}');assert.deepEqual(readSave(s).save,defaultSave());});

test('backup restores last valid progress after primary corruption',()=>{
 const s=memory(),first={...defaultSave(),gold:100},second={...defaultSave(),gold:200};
 persistSave(first,s);persistSave(second,s);s.setItem(SAVE_KEY,'{broken');
 const recovered=readSave(s);assert.equal(recovered.recovered,true);assert.equal(recovered.save.gold,100);
 persistSave({...recovered.save,gold:130},s);s.setItem(SAVE_KEY,'broken again');
 assert.equal(readSave(s).save.gold,100);
});
test('future version is not downgraded by automatic writes',()=>{
 const s=memory();const future='{"version":99,"gold":999}';s.setItem(SAVE_KEY,future);
 assert.equal(readSave(s).writeBlocked,true);
 assert.equal(persistSave(defaultSave(),s).writeBlocked,true);assert.equal(s.getItem(SAVE_KEY),future);
});
test('invalid write does not replace existing good primary',()=>{
 const s=memory();persistSave({...defaultSave(),gold:100},s);
 const previous=s.getItem(SAVE_KEY);assert.equal(persistSave({version:1,gold:-3},s).storageOK,false);
 assert.equal(s.getItem(SAVE_KEY),previous);
});
test('future backup is preserved when primary is absent',()=>{
 const s=memory(),key=SAVE_KEY+'-backup',future='{"version":9}';s.setItem(key,future);
 assert.equal(readSave(s).writeBlocked,true);assert.equal(persistSave(defaultSave(),s).writeBlocked,true);
 assert.equal(s.getItem(key),future);assert.equal(s.getItem(SAVE_KEY),null);
});
test('primary write failure preserves a recoverable previous backup',()=>{
 const s=memory();persistSave({...defaultSave(),gold:77},s);
 const quota={getItem:s.getItem,setItem(key,value){if(key===SAVE_KEY)throw Error('quota');s.setItem(key,value);}};
 assert.equal(persistSave({...defaultSave(),gold:99},quota).storageOK,false);
 s.setItem(SAVE_KEY,'corrupt');assert.equal(readSave(s).save.gold,77);
});
