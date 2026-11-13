/** Presentation-only descriptions. No simulation state is changed here. */
import {RELICS,normalizeRelic} from './relics.js';
import {activeSpellCombos,lightningInterval} from './spell-combos.js';
import {CLASSES,UPGRADES,ABILITIES} from './engine.js';
const EVOLUTIONS={weapon:{knight:'破曉月鋼斬',elf:'疾風星雨',mage:'雙星焚界'},orb:'熾天聖焰環',lightning:'天罰雷霆'};
const BASE={knight:{damage:23,interval:.72},elf:{damage:26,interval:.65},mage:{damage:34,interval:1.05}};
const classKey=id=>typeof id==='string'&&Object.hasOwn(CLASSES,id)?id:'knight';
const validId=id=>typeof id==='string'&&Object.hasOwn(UPGRADES,id);
function rank(value,max=5){try{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,Math.floor(n))):0;}catch{return 0;}}
const fmt=value=>String(Math.round(value*1000)/1000);
export function skillName(classId,id,level=0){
  if(!validId(id))return '未知祝福';const c=classKey(classId),r=rank(level,UPGRADES[id].max);
  if(r>=5&&Object.hasOwn(EVOLUTIONS,id))return id==='weapon'?EVOLUTIONS.weapon[c]:EVOLUTIONS[id];
  return id==='weapon'?CLASSES[c].weapon:UPGRADES[id].name;
}
function statsFor(c,id,r){
  if(id==='weapon')return {active:true,damage:BASE[c].damage*(1+r*.28),damageMultiplier:1+r*.28,range:c==='knight'?(r>=5?172:126):null,projectiles:c==='knight'?0:c==='elf'?(r>=5?3:1):(r>=5?2:1),pierce:c==='elf'?(r>=5?5:2):null,blast:c==='mage'?(r>=5?110:76):null};
  if(id==='orb')return {active:r>0,damage:r?5+5*r:0,range:r>=5?122:85,interval:.5};
  if(id==='lightning')return {active:r>0,damage:r?22+12*r:0,targets:r?r+1:0,range:600,interval:r>=5?1.3:2};
  if(id==='haste')return {active:r>0,intervalMultiplier:Math.pow(.88,r),interval:BASE[c].interval*Math.pow(.88,r)};
  if(id==='vitality')return {active:r>0,hpBonus:25*r,healOnUpgrade:35};
  if(id==='speed')return {active:r>0,speedMultiplier:1+r*.09,bonusPercent:9*r};
  if(id==='magnet')return {active:r>0,range:105+55*r};
  return {active:r>0,damageReduction:2*r,minimumDamage:1};
}
function describe(c,id,r,s){
  if(id==='weapon'){
    const detail=c==='knight'?`周圍半徑 ${s.range}`:c==='elf'?`每次 ${s.projectiles} 箭；每箭最多命中 ${s.pierce} 名敵人`:`每次 ${s.projectiles} 火球；爆炸半徑 ${s.blast}`;
    return `每次命中傷害 ${fmt(s.damage)}（基礎傷害 × ${fmt(s.damageMultiplier)}，不含裝備）；${detail}`;
  }
  if((id==='orb'||id==='lightning')&&!s.active)return '尚未習得';
  if(id==='orb')return `每 ${s.interval} 秒造成 ${s.damage} 傷害；光環半徑 ${s.range}`;
  if(id==='lightning')return `每 ${s.interval} 秒雷擊最多 ${s.targets} 名敵人，各 ${s.damage} 傷害；搜尋半徑 ${s.range}`;
  if(id==='haste')return `攻擊間隔 × 0.88^${r}（約 ${fmt(s.interval)} 秒）；每階乘以 0.88，而非相加減免`;
  if(id==='vitality')return `生命上限 +${s.hpBonus}；每次選取此祝福回復 ${s.healOnUpgrade} 生命（不超過上限）`;
  if(id==='speed')return `移動速度 +${s.bonusPercent}%（含戰靴後的速度 × ${fmt(s.speedMultiplier)}）`;
  if(id==='magnet')return `靈魂吸取半徑 ${s.range}（每階 +55）`;
  return `每次傷害減少 ${s.damageReduction}（與鎧甲減傷相加，最低承受 1）`;
}
function changeDescription(c,id,a,b){
  if(id==='weapon')return `命中傷害 ${fmt(a.damage)} → ${fmt(b.damage)}（未含裝備）；`+(c==='knight'?`周圍半徑 ${a.range} → ${b.range}`:c==='elf'?`箭數 ${a.projectiles} → ${b.projectiles}；每箭命中上限 ${a.pierce} → ${b.pierce}`:`火球 ${a.projectiles} → ${b.projectiles}；爆炸半徑 ${a.blast} → ${b.blast}`);
  if(id==='orb')return `${a.active?`${a.damage} 傷害`:'未習得'} → ${b.damage} 傷害／${b.interval} 秒；半徑 ${a.active?a.range+' → ':''}${b.range}`;
  if(id==='lightning')return `${a.active?a.damage+' 傷害':'未習得'} → ${b.damage} 傷害；目標 ${a.targets} → ${b.targets}；間隔 ${a.interval} → ${b.interval} 秒`;
  if(id==='haste')return `攻擊間隔約 ${fmt(a.interval)} → ${fmt(b.interval)} 秒（每階 × 0.88）`;
  if(id==='vitality')return `生命上限加成 +${a.hpBonus} → +${b.hpBonus}；本次回復 35 生命（不超上限）`;
  if(id==='speed')return `移動速度加成 +${a.bonusPercent}% → +${b.bonusPercent}%（含戰靴後計算）`;
  if(id==='magnet')return `靈魂吸取半徑 ${a.range} → ${b.range}`;
  return `每次傷害減少 ${a.damageReduction} → ${b.damageReduction}（與鎧甲相加，最低傷害 1）`;
}
export function upgradeInfo(classId,id,currentLevel=0,context={}){
  if(!validId(id))return null;
  const c=classKey(classId),r=rank(currentLevel,UPGRADES[id].max),nextLevel=Math.min(r+1,UPGRADES[id].max),maxed=r>=UPGRADES[id].max;
  const evolves=!maxed&&nextLevel===5&&Object.hasOwn(EVOLUTIONS,id),current=statsFor(c,id,r),next=statsFor(c,id,nextLevel);
  if(id==='magnet'&&normalizeRelic(context?.relicId)==='compass'){current.range+=100;next.range+=100;}
  if(id==='lightning'){
    current.interval=lightningInterval({...context?.upgrades,lightning:r});
    next.interval=lightningInterval({...context?.upgrades,lightning:nextLevel});
  }
  const currentDescription=describe(c,id,r,current),nextDescription=describe(c,id,nextLevel,next);
  const before=activeSpellCombos({...context?.upgrades,[id]:r});
  const after=activeSpellCombos({...context?.upgrades,[id]:nextLevel});
  const unlocked=after.filter(combo=>!before.some(existing=>existing.id===combo.id));
  const description=maxed?`已滿階：${currentDescription}`:`${changeDescription(c,id,current,next)}${evolves?`。進化為「${skillName(c,id,5)}」`:''}`;
  return {id,name:skillName(c,id,nextLevel),currentLevel:r,nextLevel,maxed,evolves,evolutionName:Object.hasOwn(EVOLUTIONS,id)?skillName(c,id,5):null,currentDescription,nextDescription,current,next,description:description+(unlocked.length?`；解鎖${unlocked.map(combo=>combo.name).join('、')}`:'')};
}
export function buildSummary(game={}){
  const c=classKey(game?.classId),upgrades=game?.upgrades||{},equipment=game?.equipment||{},relic=normalizeRelic(game?.relicId);
  const entries=['weapon','orb','lightning','haste','vitality','speed','magnet','armor'].map(id=>{
    const level=rank(upgrades[id],UPGRADES[id].max),stats=statsFor(c,id,level);
    if(id==='magnet'&&relic==='compass')stats.range+=100;
    if(id==='lightning'&&level>0)stats.interval=lightningInterval(upgrades);
    let description=describe(c,id,level,stats);
    if(id==='weapon'){
      stats.equipmentMultiplier=1+rank(equipment.weapon)*.08;stats.effectiveDamage=stats.damage*stats.equipmentMultiplier;stats.interval=BASE[c].interval*Math.pow(.88,rank(upgrades.haste));
      description+=`；裝備倍率 × ${fmt(stats.equipmentMultiplier)}，實際命中傷害約 ${fmt(stats.effectiveDamage)}；攻擊間隔約 ${fmt(stats.interval)} 秒`;
    }
    if(id==='vitality'){stats.maxHp=(relic==='compass'?Math.round((CLASSES[c].hp+rank(equipment.armor)*10)*.85):CLASSES[c].hp+rank(equipment.armor)*10)+stats.hpBonus;description+=`；目前生命上限 ${stats.maxHp}`;}
    if(id==='speed'){stats.speed=(CLASSES[c].speed+rank(equipment.boots)*5)*stats.speedMultiplier*(relic==='ward'?.92:1);description+=`；目前速度 ${fmt(stats.speed)}`;}
    if(id==='armor'){stats.equipmentReduction=rank(equipment.armor);stats.totalReduction=stats.damageReduction+stats.equipmentReduction;description+=`；含鎧甲合計減少 ${stats.totalReduction}`;}
    return {id,name:skillName(c,id,level),level,active:stats.active,evolved:level>=5&&Object.hasOwn(EVOLUTIONS,id),description,stats};
  });
  const weapon=rank(equipment.weapon),armor=rank(equipment.armor),boots=rank(equipment.boots);
  for(const combo of activeSpellCombos(upgrades))entries.push({id:`combo:${combo.id}`,name:combo.name,active:true,description:combo.description,stats:{lightningIntervalMultiplier:combo.lightningIntervalMultiplier}});
  entries.push({id:'equipment',name:'傳承裝備',active:true,description:`武器傷害 × ${fmt(1+weapon*.08)}；鎧甲生命 +${armor*10}、減傷 ${armor}；戰靴基礎速度 +${boots*5}`});
  entries.push({id:'ability',name:ABILITIES[c].name,active:true,description:`冷卻 ${game?.ability?.cooldown??ABILITIES[c].cooldown*(relic==='hourglass'?.75:1)} 秒；${ABILITIES[c].description}`});
  entries.push({id:'relic',name:RELICS[relic].name,active:true,description:RELICS[relic].description+(relic==='ward'?` 目前${game?.relicCooldown>0?'充能剩餘 '+Math.ceil(game.relicCooldown)+' 秒':'可抵擋飛射攻擊'}。`:'')});
  return entries;
}
