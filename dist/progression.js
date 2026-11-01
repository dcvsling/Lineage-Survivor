import {sanitizeSave,validateSave} from './save.js';
export const EQUIPMENT_SLOTS=Object.freeze({weapon:'武器',armor:'鎧甲',boots:'戰靴'});
export const MAX_TIER=5;
export function forgeCost(save,slot){
  if(!Object.hasOwn(EQUIPMENT_SLOTS,slot)||!validateSave(save).ok)return null;
  const tier=save.equipment[slot];
  return tier>=MAX_TIER?null:100*(tier+1)**2;
}
/** Pure transaction: callers persist result.save only after ok. Failed purchases never mutate input. */
export function forge(raw,slot){
  const valid=validateSave(raw),save=sanitizeSave(raw);
  if(!valid.ok)return {ok:false,save,message:'傳承紀錄無效；未進行鍛造。'};
  if(!Object.hasOwn(EQUIPMENT_SLOTS,slot))return {ok:false,save,message:'未知裝備欄位。'};
  const cost=forgeCost(save,slot);
  if(cost===null)return {ok:false,save,message:'此裝備已達最高階 ＋5。'};
  if(save.gold<cost)return {ok:false,save,message:`金幣不足；需要 ${cost} 金幣。`};
  save.gold-=cost;save.equipment[slot]++;
  return {ok:true,save,message:`${EQUIPMENT_SLOTS[slot]}已鍛造至 ＋${save.equipment[slot]}，消耗 ${cost} 金幣。`};
}
