import {normalizeRelic,relicUnlocked} from './relics.js';
import {readSave,persistSave,sanitizeSave,validateSave} from './save.js';
import {forge} from './progression.js';
const LOCK_NAME='lineage-survivor-save';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
/** Async serialized transactions. Supplying locks:null explicitly tests the optimistic fallback. */
export async function transactSave(operation,currentMemory,options={}){
  let locks=options.locks;
  if(locks===undefined){try{locks=globalThis.navigator?.locks;}catch{locks=null;}}
  const concurrency=options.memoryOnly?'memory':typeof locks?.request==='function'?'locked':'optimistic';
  const perform=()=>{
    const latest=readSave(options.storage);
    if(latest.writeBlocked){const pending=operation?.type==='settle'?applyOperation(operation,sanitizeSave(currentMemory)):null;if(pending?.ok)return {...pending,storageOK:false,writeBlocked:true,reason:'version',protectedRaw:latest.protectedRaw,memoryOnly:true,concurrency:'memory',message:'較新版存檔受到保護；本次戰利品僅結算於記憶體，請另行備份本次進度。'};return {ok:false,save:sanitizeSave(currentMemory),storageOK:false,writeBlocked:true,reason:'version',protectedRaw:latest.protectedRaw,memoryOnly:!!options.memoryOnly,message:'較新版存檔受到保護，未變更傳承。',concurrency};}
    const memoryOnly=!!options.memoryOnly||!latest.storageOK;
    const base=memoryOnly?sanitizeSave(currentMemory):latest.save;
    const apply=applyOperation(operation,base);
    if(!apply.ok)return {...apply,storageOK:latest.storageOK&&!memoryOnly,writeBlocked:false,reason:'operation',concurrency,memoryOnly};
    if(memoryOnly)return {...apply,storageOK:false,writeBlocked:false,reason:'storage',memoryOnly:true,concurrency:'memory',message:apply.message+' 僅保留在本次頁面記憶體，請匯出備份；關閉頁面將失去未儲存進度。'};
    const stored=persistSave(apply.save,options.storage,{expectedRaw:latest.snapshot});
    if(stored.reason==='conflict'){if(operation.type==='settle')return {...apply,storageOK:false,writeBlocked:false,reason:'conflict',memoryOnly:true,concurrency:'memory',message:'另一個分頁剛更新傳承；本次戰利品僅保留於記憶體，請匯出備份，未覆蓋其他分頁。'};return {ok:false,save:base,storageOK:false,writeBlocked:false,reason:'conflict',memoryOnly:false,concurrency,message:'另一個分頁剛更新傳承，本次未寫入。請重試，避免覆蓋新進度。'};}
    if(stored.writeBlocked){if(operation.type==='settle')return {...apply,storageOK:false,writeBlocked:true,reason:stored.reason,protectedRaw:readSave(options.storage).protectedRaw,memoryOnly:true,concurrency:'memory',message:'存檔受到保護，本次戰利品僅保留於記憶體，請另行備份。'};return {ok:false,save:base,storageOK:false,writeBlocked:true,reason:stored.reason,memoryOnly:false,concurrency,message:'存檔受到保護，本次未變更傳承。'};}
    if(!stored.storageOK)return {...apply,storageOK:false,writeBlocked:false,reason:'storage',memoryOnly:true,concurrency,message:apply.message+' 儲存失敗，僅保留在本次頁面記憶體；請匯出備份。'};
    return {...apply,storageOK:true,writeBlocked:false,reason:null,memoryOnly:false,concurrency};
  };
  if(concurrency==='locked'){
    // The native signal removes a queued lock request. The explicit guard also protects
    // against non-native implementations that invoke the callback after timeout.
    let abandoned=false,timer;
    const controller=new AbortController();
    const timeoutMs=Number.isFinite(options.lockTimeoutMs)?Math.max(1,Math.min(30000,options.lockTimeoutMs)):3000;
    const failedLock=reason=>{
      const pending=operation?.type==='settle'?applyOperation(operation,sanitizeSave(currentMemory)):null;
      const label=reason==='lock-timeout'?'等待存檔鎖定逾時':'無法取得存檔鎖定';
      if(pending?.ok)return {...pending,storageOK:false,writeBlocked:false,reason,memoryOnly:true,concurrency:'memory',message:label+'；戰利品僅保留於記憶體，請匯出備份。'};
      return {ok:false,save:sanitizeSave(currentMemory),storageOK:false,writeBlocked:false,reason,memoryOnly:!!options.memoryOnly,concurrency,message:label+'，本次未變更傳承，請重試。'};
    };
    try{
      const timeout=new Promise(resolve=>{timer=setTimeout(()=>{abandoned=true;resolve(failedLock('lock-timeout'));controller.abort();},timeoutMs);});
      const request=locks.request(LOCK_NAME,{signal:controller.signal},()=>abandoned?failedLock('lock-timeout'):perform());
      return await Promise.race([request,timeout]);
    }catch{return failedLock(abandoned?'lock-timeout':'lock');}
    finally{clearTimeout(timer);abandoned=true;}
  }
  return perform();
}
function applyOperation(op,base){
  if(!object(op))return {ok:false,save:base,message:'無效的傳承操作。'};
  if(op.type==='forge')return forge(base,op.slot);
  if(op.type==='relic'){
    if(typeof op.id!=='string'||normalizeRelic(op.id)!==op.id)return {ok:false,save:base,message:'未知的傳承遺物，未變更裝備。'};
    if(op.id!=='none'&&!relicUnlocked(base))return {ok:false,save:base,message:'單次遠征存活滿 60 秒後才能裝備遺物。'};
    const save=sanitizeSave(base);save.relic=op.id;return {ok:true,save,message:op.id==='none'?'已卸下傳承遺物。':'傳承遺物已裝備，下次遠征生效。'};
  }
  if(op.type==='import'){
    const valid=validateSave(op.save);
    return valid.ok?{ok:true,save:valid.save,message:'傳承已匯入。'}:{ok:false,save:base,message:'匯入存檔無效或版本不相容，未變更傳承。'};
  }
  if(op.type==='settle'){
    if(!object(op.rewards)||!finite(op.rewards.gold)||!Number.isInteger(op.rewards.gold)||!finite(op.time)||typeof op.won!=='boolean')return {ok:false,save:base,message:'戰利品資料無效，未變更傳承。'};
    const save=sanitizeSave(base);save.gold=Math.min(1e12,save.gold+op.rewards.gold);save.best=Math.max(save.best,Math.min(86400,op.time));if(op.won)save.wins=Math.min(1e9,save.wins+1);
    for(const slot of ['weapon','armor','boots']){const tier=op.rewards.equipment?.[slot];if(tier!==undefined){if(!finite(tier)||!Number.isInteger(tier)||tier>5)return {ok:false,save:base,message:'裝備資料無效，未變更傳承。'};save.equipment[slot]=Math.max(save.equipment[slot],tier);}}
    const drop=op.rewards.drop;if(drop!==undefined){if(!object(drop)||!Object.hasOwn(save.equipment,drop.slot)||!finite(drop.tier)||!Number.isInteger(drop.tier)||drop.tier>5)return {ok:false,save:base,message:'掉落資料無效，未變更傳承。'};save.equipment[drop.slot]=Math.max(save.equipment[drop.slot],drop.tier);}
    return {ok:true,save,message:'戰利品已結算。'};
  }
  return {ok:false,save:base,message:'未知的傳承操作。'};
}
