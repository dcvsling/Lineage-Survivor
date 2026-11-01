import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,BACKUP_KEY,defaultSave,persistSave,readSave} from '../dist/save.js';
import {transactSave} from '../dist/save-transactions.js';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
const fakeLocks=()=>{let queue=Promise.resolve();return {request(name,options,fn){assert.equal(name,'lineage-survivor-save');assert.ok(options.signal instanceof AbortSignal);const next=queue.then(fn);queue=next.catch(()=>{});return next;}};};
test('stale tab settlement preserves another tab forge and adds rewards to latest gold',async()=>{
 const storage=memory(),locks=fakeLocks();persistSave({...defaultSave(),gold:1000},storage);const a=readSave(storage).save,b=readSave(storage).save;
 const bought=await transactSave({type:'forge',slot:'weapon'},a,{storage,locks});assert.equal(bought.save.gold,900);
 const settled=await transactSave({type:'settle',rewards:{gold:50,equipment:b.equipment},time:90,won:false},b,{storage,locks});
 assert.equal(settled.save.gold,950);assert.equal(settled.save.equipment.weapon,1);assert.deepEqual(readSave(storage).save,settled.save);
});
test('simultaneous locked forge requests cannot double-spend stale balance',async()=>{
 const storage=memory(),locks=fakeLocks(),save={...defaultSave(),gold:100};persistSave(save,storage);
 const results=await Promise.all(['weapon','armor'].map(slot=>transactSave({type:'forge',slot},save,{storage,locks})));
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(readSave(storage).save.gold,0);assert.equal(results[0].concurrency,'locked');
});
test('snapshot guard rejects stale writes and optimistic fallback labels its limitation',async()=>{
 const storage=memory();persistSave({...defaultSave(),gold:100},storage);const first=readSave(storage);persistSave({...first.save,gold:500},storage);
 const failed=persistSave(first.save,storage,{expectedRaw:first.snapshot});assert.equal(failed.reason,'conflict');assert.equal(readSave(storage).save.gold,500);
 const result=await transactSave({type:'forge',slot:'boots'},first.save,{storage,locks:null});assert.equal(result.ok,true);assert.equal(result.concurrency,'optimistic');assert.equal(result.save.gold,400);
});
test('protected future primary and backup expose original raw and refuse imports',async()=>{
 for(const key of [SAVE_KEY,BACKUP_KEY]){const storage=memory(),raw='{"version":2,"gold":9000}';storage.setItem(key,raw);
 assert.equal(readSave(storage).protectedRaw,raw);const result=await transactSave({type:'import',save:defaultSave()},defaultSave(),{storage,locks:null});assert.equal(result.ok,false);assert.equal(result.writeBlocked,true);assert.equal(storage.getItem(key),raw);}
});
test('quota errors are explicit memory-only and subsequent memory operations preserve progress',async()=>{
 const storage=memory(),save={...defaultSave(),gold:1000};persistSave(save,storage);const quota={getItem:storage.getItem,setItem(){throw Error('quota');}};
 const first=await transactSave({type:'forge',slot:'weapon'},save,{storage:quota,locks:null});assert.equal(first.ok,true);assert.equal(first.storageOK,false);assert.equal(first.memoryOnly,true);assert.match(first.message,/記憶體/);assert.equal(readSave(storage).save.gold,1000);
 const second=await transactSave({type:'settle',rewards:{gold:50,equipment:save.equipment},time:60,won:false},first.save,{storage:quota,locks:null,memoryOnly:true});assert.equal(second.save.gold,950);assert.equal(second.save.equipment.weapon,1);
});
test('invalid operations and unavailable lock never mutate input or disk',async()=>{
 const storage=memory(),save={...defaultSave(),gold:200};persistSave(save,storage);const before=JSON.stringify(save),disk=storage.getItem(SAVE_KEY);
 for(const op of [{type:'forge',slot:'invalid'},{type:'import',save:{version:9}},{type:'settle',rewards:{gold:-1},time:40,won:false}])assert.equal((await transactSave(op,save,{storage,locks:null})).ok,false);
 const fail=await transactSave({type:'forge',slot:'weapon'},save,{storage,locks:{request(){throw Error('locked');}}});assert.equal(fail.reason,'lock');assert.equal(JSON.stringify(save),before);assert.equal(storage.getItem(SAVE_KEY),disk);
});
test('future-version disk never loses earned in-memory settlement',async()=>{
 const storage=memory(),raw='{"version":7,"gold":5000}';storage.setItem(SAVE_KEY,raw);
 const result=await transactSave({type:'settle',rewards:{gold:50,equipment:{weapon:1,armor:0,boots:0}},time:70,won:false},{...defaultSave(),gold:100},{storage,locks:null});
 assert.equal(result.ok,true);assert.equal(result.writeBlocked,true);assert.equal(result.memoryOnly,true);assert.equal(result.save.gold,150);assert.equal(result.save.equipment.weapon,1);assert.equal(result.protectedRaw,raw);assert.equal(storage.getItem(SAVE_KEY),raw);
});
test('optimistic conflict during settlement keeps reward in memory but never overwrites other tab',async()=>{
 const backing=memory(),initial={...defaultSave(),gold:100};persistSave(initial,backing);let reads=0;
 const newer={...defaultSave(),gold:999,equipment:{weapon:3,armor:0,boots:0}};
 const storage={setItem:backing.setItem,getItem(key){if(key===SAVE_KEY&&++reads===3)backing.setItem(SAVE_KEY,JSON.stringify(newer));return backing.getItem(key);}};
 const result=await transactSave({type:'settle',rewards:{gold:50},time:80,won:false},initial,{storage,locks:null});
 assert.equal(result.ok,true);assert.equal(result.reason,'conflict');assert.equal(result.memoryOnly,true);assert.equal(result.save.gold,150);assert.deepEqual(readSave(backing).save,newer);
});
test('lock rejection retains a completed run reward without claiming durable success',async()=>{
 const initial={...defaultSave(),gold:10};const result=await transactSave({type:'settle',rewards:{gold:50},time:100,won:true},initial,{storage:memory(),locks:{request(){throw Error('denied');}}});
 assert.equal(result.ok,true);assert.equal(result.storageOK,false);assert.equal(result.memoryOnly,true);assert.equal(result.save.gold,60);assert.equal(result.save.wins,1);assert.equal(result.reason,'lock');
});
test('bounded lock wait aborts and a late callback cannot write or spend',async()=>{
 for(const operation of [{type:'forge',slot:'weapon'},{type:'import',save:{...defaultSave(),gold:900}}]){
  const storage=memory(),save={...defaultSave(),gold:100};persistSave(save,storage);let callback,signal;
  const locks={request(name,options,fn){callback=fn;signal=options.signal;return new Promise(()=>{});}};
  const result=await transactSave(operation,save,{storage,locks,lockTimeoutMs:5});
  assert.equal(result.ok,false);assert.equal(result.reason,'lock-timeout');assert.match(result.message,/重試/);assert.equal(signal.aborted,true);
  assert.deepEqual(readSave(storage).save,save);assert.equal(callback().ok,false);assert.deepEqual(readSave(storage).save,save);
 }
});
test('timed-out settlement keeps reward only in memory and late acquisition stays inert',async()=>{
 const storage=memory(),save={...defaultSave(),gold:100};persistSave(save,storage);let callback;
 const locks={request(name,options,fn){callback=fn;return new Promise(()=>{});}};
 const result=await transactSave({type:'settle',rewards:{gold:50},time:80,won:false},save,{storage,locks,lockTimeoutMs:5});
 assert.equal(result.ok,true);assert.equal(result.memoryOnly,true);assert.equal(result.storageOK,false);assert.equal(result.reason,'lock-timeout');assert.equal(result.save.gold,150);
 callback();assert.equal(readSave(storage).save.gold,100);
});
test('successful lock request clears timeout and cannot run its callback a second time',async()=>{
 const storage=memory(),save={...defaultSave(),gold:500};persistSave(save,storage);let callback,signal;
 const locks={request(name,options,fn){callback=fn;signal=options.signal;return Promise.resolve(fn());}};
 const result=await transactSave({type:'forge',slot:'weapon'},save,{storage,locks,lockTimeoutMs:5});assert.equal(result.ok,true);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(signal.aborted,false);callback();assert.equal(readSave(storage).save.gold,400);assert.equal(readSave(storage).save.equipment.weapon,1);
});
