import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressQueue} from '../dist/progress-queue.js';
import {defaultSave,persistSave,readSave} from '../dist/save.js';
import {transactSave} from '../dist/save-transactions.js';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};

test('queued forge operations preserve both memory-only upgrades after delayed lock and quota failure',async()=>{
  const backing=memory();persistSave({...defaultSave(),gold:1000},backing);
  const storage={getItem:backing.getItem,setItem(){throw Error('quota');}};
  let release;const held=new Promise(resolve=>release=resolve);let lockTail=held,lockRequests=0;
  const locks={request(name,options,callback){lockRequests++;const next=lockTail.then(callback);lockTail=next.catch(()=>{});return next;}};
  let save=readSave(backing).save,memoryOnly=false;const started=[];
  const enqueue=createProgressQueue(async operation=>{
    started.push(operation.slot);
    // This is intentionally inside execution: second operation must see the first result.
    const result=await transactSave(operation,save,{storage,locks,memoryOnly});
    if(result.ok)save=result.save;
    memoryOnly=!!result.memoryOnly;
    return result;
  });
  const first=enqueue({type:'forge',slot:'weapon'}),second=enqueue({type:'forge',slot:'armor'});
  await Promise.resolve();assert.deepEqual(started,['weapon']);release();
  const results=await Promise.all([first,second]);
  assert.deepEqual(started,['weapon','armor']);assert.ok(results.every(r=>r.ok&&!r.storageOK&&r.memoryOnly));
  assert.equal(save.equipment.weapon,1);assert.equal(save.equipment.armor,1);assert.equal(save.gold,800);
  assert.equal(lockRequests,1);assert.equal(readSave(backing).save.gold,1000);
  assert.equal(readSave(backing).save.equipment.weapon,0);assert.equal(readSave(backing).save.equipment.armor,0);
});

test('queue preserves order and recovers after synchronous throw and asynchronous rejection',async()=>{
  const completed=[];
  const enqueue=createProgressQueue(operation=>{
    completed.push(operation.id);
    if(operation.id==='sync')throw Error('sync failure');
    if(operation.id==='async')return Promise.reject(Error('async failure'));
    return Promise.resolve(operation.id);
  });
  const results=await Promise.allSettled([enqueue({id:'sync'}),enqueue({id:'ok1'}),enqueue({id:'async'}),enqueue({id:'ok2'})]);
  assert.deepEqual(completed,['sync','ok1','async','ok2']);
  assert.deepEqual(results.map(result=>result.status),['rejected','fulfilled','rejected','fulfilled']);
  assert.equal(results[1].value,'ok1');assert.equal(results[3].value,'ok2');
  assert.equal(await enqueue({id:'still works'}),'still works');
});

test('queue never starts a later operation until preceding state update completes',async()=>{
  let release,active=0,maxActive=0,state=0;
  const gate=new Promise(resolve=>release=resolve);
  const enqueue=createProgressQueue(async increment=>{
    active++;maxActive=Math.max(maxActive,active);
    if(increment===1)await gate;
    state+=increment;active--;return state;
  });
  const first=enqueue(1),second=enqueue(2);await Promise.resolve();assert.equal(active,1);assert.equal(state,0);
  release();assert.equal(await first,1);assert.equal(await second,3);assert.equal(maxActive,1);
  assert.throws(()=>createProgressQueue(null),TypeError);
});
