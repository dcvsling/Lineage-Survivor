/** Local-only progress. v1 remains compatible; backups never replace a valid save with corrupt data. */
export const SAVE_KEY='lineage-survivor-v1';
export const BACKUP_KEY=SAVE_KEY+'-backup';
export const SAVE_VERSION=1;
export function defaultSave(){return {version:SAVE_VERSION,equipment:{weapon:0,armor:0,boots:0},gold:0,best:0,wins:0};}
function number(value,max,integer=true){if(typeof value!=='number'||!Number.isFinite(value))return 0;const bounded=Math.min(max,Math.max(0,value));return integer?Math.floor(bounded):bounded;}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function sanitizeSave(raw){
  const save=defaultSave();
  if(!object(raw)||(raw.version!==undefined&&raw.version!==SAVE_VERSION))return save;
  for(const slot of ['weapon','armor','boots'])save.equipment[slot]=number(raw.equipment?.[slot],5);
  save.gold=number(raw.gold,1e12);save.best=number(raw.best,86400,false);save.wins=number(raw.wins,1e9);
  return save;
}
/** Strict at file/import boundaries: never silently turn malformed data into a replacement save. */
export function validateSave(raw){
  if(!object(raw))return {ok:false,reason:'invalid'};
  if(raw.version!==undefined&&raw.version!==SAVE_VERSION)return {ok:false,reason:'version'};
  if(!object(raw.equipment))return {ok:false,reason:'invalid'};
  const limits={weapon:5,armor:5,boots:5,gold:1e12,best:86400,wins:1e9};
  for(const [key,max] of Object.entries(limits)){
    const value=['weapon','armor','boots'].includes(key)?raw.equipment[key]:raw[key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||(key!=='best'&&!Number.isInteger(value)))return {ok:false,reason:'invalid'};
  }
  return {ok:true,save:sanitizeSave(raw)};
}
function decode(text){if(text===null||text===undefined)return {ok:false,reason:'missing'};try{return validateSave(JSON.parse(text));}catch{return {ok:false,reason:'invalid'};}}
export function readSave(storage){
  try{
    const target=storage===undefined?globalThis.localStorage:storage;
    const snapshot=target.getItem(SAVE_KEY),primary=decode(snapshot);
    if(primary.ok)return {save:primary.save,storageOK:true,recovered:false,writeBlocked:false,snapshot};
    // A future application's save is not corruption. Never silently downgrade it.
    if(primary.reason==='version')return {save:defaultSave(),storageOK:false,recovered:false,writeBlocked:true,reason:'version',protectedRaw:snapshot,snapshot};
    const backupRaw=target.getItem(BACKUP_KEY),backup=decode(backupRaw);
    if(backup.ok)return {save:backup.save,storageOK:true,recovered:true,writeBlocked:false,reason:'backup',snapshot};
    if(backup.reason==='version')return {save:defaultSave(),storageOK:false,recovered:false,writeBlocked:true,reason:'version',protectedRaw:backupRaw,snapshot};
    return {save:defaultSave(),storageOK:true,recovered:primary.reason!=='missing',writeBlocked:false,reason:primary.reason,snapshot};
  }catch{return {save:defaultSave(),storageOK:false,recovered:false,writeBlocked:false,reason:'storage'};}
}
export function persistSave(raw,storage,options={}){
  const valid=validateSave(raw),save=sanitizeSave(raw);
  if(!valid.ok)return {save,storageOK:false,writeBlocked:true,reason:valid.reason};
  try{
    const target=storage===undefined?globalThis.localStorage:storage;
    const snapshot=target.getItem(SAVE_KEY);
    if(Object.hasOwn(options,'expectedRaw')&&snapshot!==options.expectedRaw)return {save,storageOK:false,writeBlocked:true,reason:'conflict'};
    const primary=decode(snapshot);
    if(primary.reason==='version')return {save,storageOK:false,writeBlocked:true,reason:'version'};
    // Preserve last known-good primary. Corrupt primary may not poison a recoverable backup.
    if(primary.ok)target.setItem(BACKUP_KEY,JSON.stringify(primary.save));
    else {const backup=decode(target.getItem(BACKUP_KEY));if(backup.reason==='version')return {save,storageOK:false,writeBlocked:true,reason:'version'};if(!backup.ok)target.setItem(BACKUP_KEY,JSON.stringify(save));}
    if(Object.hasOwn(options,'expectedRaw')&&target.getItem(SAVE_KEY)!==options.expectedRaw)return {save,storageOK:false,writeBlocked:true,reason:'conflict'};
    target.setItem(SAVE_KEY,JSON.stringify(save));
    return {save,storageOK:true,writeBlocked:false};
  }catch{return {save,storageOK:false,writeBlocked:false,reason:'storage'};}
}
export function exportSave(raw){const result=validateSave(raw);if(!result.ok)throw new Error('無法匯出無效的傳承紀錄');return JSON.stringify(result.save,null,2);}
export function importSave(text){
  if(typeof text!=='string'||text.length>32768)return {ok:false,message:'存檔必須是小於 32 KB 的 JSON 文字。'};
  const result=decode(text);
  if(!result.ok)return {ok:false,message:result.reason==='version'?'此存檔版本較新或不相容，尚未更動現有紀錄。':'存檔格式或數值無效，尚未更動現有紀錄。'};
  return {ok:true,save:result.save,message:'存檔驗證成功。確認後將取代此瀏覽器的傳承紀錄。'};
}
