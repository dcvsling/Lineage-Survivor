/** Versioned, bounded local-only progress. Storage exceptions never break gameplay. */
export const SAVE_KEY='lineage-survivor-v1';
export const SAVE_VERSION=1;
export function defaultSave(){return {version:SAVE_VERSION,equipment:{weapon:0,armor:0,boots:0},gold:0,best:0,wins:0};}
function number(value,max,integer=true){if(typeof value!=='number'||!Number.isFinite(value))return 0;const bounded=Math.min(max,Math.max(0,value));return integer?Math.floor(bounded):bounded;}
export function sanitizeSave(raw){
  const save=defaultSave();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return save;
  // Version-less saves are the original v1 prototype format and migrate in place.
  if(raw.version!==undefined&&raw.version!==SAVE_VERSION)return save;
  for(const slot of ['weapon','armor','boots'])save.equipment[slot]=number(raw.equipment?.[slot],5);
  save.gold=number(raw.gold,1e12);save.best=number(raw.best,86400,false);save.wins=number(raw.wins,1e9);
  return save;
}
export function readSave(storage){
  let text;
  try{const target=storage===undefined?globalThis.localStorage:storage;text=target.getItem(SAVE_KEY);}
  catch{return {save:defaultSave(),storageOK:false,recovered:false};}
  if(text===null||text===undefined)return {save:defaultSave(),storageOK:true,recovered:false};
  try{const raw=JSON.parse(text);return {save:sanitizeSave(raw),storageOK:true,recovered:!raw||typeof raw!=='object'||Array.isArray(raw)||(raw.version!==undefined&&raw.version!==SAVE_VERSION)};}
  catch{return {save:defaultSave(),storageOK:true,recovered:true};}
}
export function persistSave(raw,storage){
  const save=sanitizeSave(raw);
  try{const target=storage===undefined?globalThis.localStorage:storage;target.setItem(SAVE_KEY,JSON.stringify(save));return {save,storageOK:true};}
  catch{return {save,storageOK:false};}
}
