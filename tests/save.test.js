import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,defaultSave,sanitizeSave,readSave,persistSave,validateSave,exportSave,importSave} from '../dist/save.js';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
test('missing save yields independent versioned defaults',()=>{const a=readSave(memory());assert.equal(a.storageOK,true);assert.equal(a.save.version,2);a.save.equipment.weapon=4;assert.equal(defaultSave().equipment.weapon,0);});
test('corrupt JSON is recoverable without incorrectly declaring storage blocked',()=>{const s=memory();s.setItem(SAVE_KEY,'{broken');const result=readSave(s);assert.deepEqual(result.save,defaultSave());assert.equal(result.storageOK,true);assert.equal(result.recovered,true);assert.equal(persistSave(result.save,s).storageOK,true);});
test('blocked storage and failed writes return in-memory progress safely',()=>{const blocked={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}};assert.equal(readSave(blocked).storageOK,false);const result=persistSave({...defaultSave(),gold:42},blocked);assert.equal(result.storageOK,false);assert.equal(result.save.gold,42);});
test('equipment and progress persist across reload roundtrip',()=>{const s=memory(),save={version:1,equipment:{weapon:3,armor:2,boots:1},gold:1234,best:480.1,wins:2};assert.equal(persistSave(save,s).storageOK,true);assert.deepEqual(readSave(s).save,{...save,version:2,relic:'none'});});
test('numeric fields reject Infinity, NaN, strings and negatives; tiers are integers',()=>{const save=sanitizeSave({equipment:{weapon:Infinity,armor:3.9,boots:-2},gold:NaN,best:Infinity,wins:'12'});assert.deepEqual(save,{version:2,equipment:{weapon:0,armor:3,boots:0},gold:0,best:0,wins:0,relic:'none'});assert.equal(sanitizeSave({equipment:{weapon:99},gold:1e20,best:1e30,wins:1e20}).equipment.weapon,5);assert.equal(sanitizeSave({gold:1e20}).gold,1e12);});
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
test('legacy relic field migrates to none and valid unlocked relic roundtrips',()=>{
 const legacy={version:1,equipment:{weapon:2,armor:1,boots:0},gold:450,best:65,wins:0};
 const storage=memory();storage.setItem(SAVE_KEY,JSON.stringify(legacy));
 assert.deepEqual(readSave(storage).save,{...legacy,version:2,relic:'none'});
 for(const relic of ['none','ward','compass','hourglass']){const save={...legacy,version:2,relic};assert.deepEqual(importSave(exportSave(save)).save,save);assert.equal(persistSave(save,storage).storageOK,true);assert.deepEqual(readSave(storage).save,save);}
});
test('relic eligibility uses single longest run and has exact 60-second boundary',()=>{
 const save={...defaultSave(),gold:999,wins:10,relic:'ward'};
 assert.equal(validateSave({...save,best:59.99}).ok,false);assert.equal(validateSave({...save,best:60}).ok,true);
 assert.equal(sanitizeSave({...save,best:59.99}).relic,'none');assert.equal(sanitizeSave({...save,best:60}).relic,'ward');
 assert.equal(validateSave({...save,best:1,wins:100}).ok,false);assert.equal(validateSave({...save,best:0,relic:'none'}).ok,true);
});
test('unknown future relic raw primary and backup are protected without downgrade',()=>{
 for(const key of [SAVE_KEY,SAVE_KEY+'-backup']){
  const storage=memory(),raw=JSON.stringify({...defaultSave(),best:80,relic:'future-relic'});storage.setItem(key,raw);
  const result=readSave(storage);assert.equal(result.writeBlocked,true);assert.equal(result.reason,'version');assert.equal(result.protectedRaw,raw);
  assert.equal(persistSave(defaultSave(),storage).writeBlocked,true);assert.equal(storage.getItem(key),raw);assert.equal(importSave(raw).ok,false);
 }
});
test('malformed or locked relic imports rejected while sanitizer stays safe',()=>{
 for(const relic of [null,42,{},[]]){const raw={...defaultSave(),best:60,relic};assert.equal(validateSave(raw).reason,'invalid');assert.equal(importSave(JSON.stringify(raw)).ok,false);assert.equal(sanitizeSave(raw).relic,'none');}
 assert.equal(validateSave({...defaultSave(),best:60,relic:'unknown'}).reason,'version');assert.equal(sanitizeSave({...defaultSave(),best:60,relic:'unknown'}).relic,'none');
 assert.equal(importSave(JSON.stringify({...defaultSave(),best:59.99,relic:'compass'})).ok,false);
});
test('v1 migration preserves all progress and is read-only until an explicit write',()=>{
 const storage=memory(),legacy={version:1,equipment:{weapon:4,armor:3,boots:2},gold:8765,best:481.25,wins:7};
 const raw=JSON.stringify(legacy);storage.setItem(SAVE_KEY,raw);
 const result=readSave(storage);assert.equal(result.storageOK,true);assert.equal(result.save.version,2);assert.equal(result.save.relic,'none');
 assert.deepEqual(result.save,{...legacy,version:2,relic:'none'});assert.equal(storage.getItem(SAVE_KEY),raw);assert.equal(storage.getItem(SAVE_KEY+'-backup'),null);
 const imported=importSave(raw);assert.equal(imported.ok,true);assert.deepEqual(imported.save,result.save);
 assert.equal(persistSave(result.save,storage).storageOK,true);assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version,2);assert.equal(storage.getItem(SAVE_KEY+'-backup'),raw);
 // Published v1 policy rejects any explicit version other than 1 before automatic writes.
 const oldPolicyAccepts=raw=>raw.version===undefined||raw.version===1;
 assert.equal(oldPolicyAccepts(JSON.parse(exportSave(result.save))),false);
});
test('versionless saves migrate to v2 and future v3 remains raw-protected',()=>{
 const legacy={equipment:{weapon:2,armor:2,boots:1},gold:500,best:60,wins:1};
 assert.deepEqual(importSave(JSON.stringify(legacy)).save,{...legacy,version:2,relic:'none'});
 for(const key of [SAVE_KEY,SAVE_KEY+'-backup']){const storage=memory(),future=JSON.stringify({...defaultSave(),version:3,gold:9876});storage.setItem(key,future);assert.equal(readSave(storage).writeBlocked,true);assert.equal(readSave(storage).protectedRaw,future);assert.equal(persistSave(defaultSave(),storage).writeBlocked,true);assert.equal(storage.getItem(key),future);}
});
test('migration backup preserves exact validated legacy raw and unsupported explicit zero stays protected',()=>{
 const storage=memory(),raw='{\n "version": 1, "equipment": {"weapon": 2, "armor": 1, "boots": 0}, "gold": 87, "best": 60, "wins": 1, "legacyNote": "keep me"\n}';
 storage.setItem(SAVE_KEY,raw);const migrated=readSave(storage).save;assert.equal(persistSave(migrated,storage).storageOK,true);assert.equal(storage.getItem(SAVE_KEY+'-backup'),raw);
 const zero=JSON.stringify({...defaultSave(),version:0});storage.setItem(SAVE_KEY,zero);assert.equal(readSave(storage).writeBlocked,true);assert.equal(readSave(storage).protectedRaw,zero);assert.equal(persistSave(defaultSave(),storage).writeBlocked,true);
});
