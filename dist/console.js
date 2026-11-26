/** Read-only developer commands. No eval, DOM, or save mutations. */
import {activeSpellCombos, spellComboProgress, lightningInterval, orbRange, lightningTargets} from './spell-combos.js';

const COMMANDS = Object.freeze(['help', 'status', 'player', 'skills', 'combos', 'cooldowns']);
const seconds = value => `${Math.max(0, Number.isFinite(value) ? value : 0).toFixed(2)}s`;

export function executeCommand(input, game) {
  if (typeof input !== 'string') return {ok:false, message:'指令必須是文字'};
  const parts=input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const command=parts[0];
  if (!command) return {ok:false, message:'輸入 help 查看指令'};
  if (!COMMANDS.includes(command) || parts.length!==1) return {ok:false, message:'未知指令；輸入 help 查看可用指令'};
  if (command==='help') return {ok:true, message:COMMANDS.join(' · ')};
  if (!game) return {ok:false, message:'尚未開始遠征'};
  if (command==='status') return {ok:true, message:`狀態: ${game.status} | 時間: ${Math.floor(game.time)}s | 等級: ${game.level} | 擊倒: ${game.kills}`};
  if (command==='player') return {ok:true, message:`HP: ${Math.ceil(game.player.hp)}/${game.player.maxHp} | 速度: ${game.player.speed} | 座標: (${Math.round(game.player.x)}, ${Math.round(game.player.y)})`};
  if (command==='skills') return {ok:true, message:Object.entries(game.upgrades).filter(([,v])=>v>0).map(([k,v])=>`${k} +${v}`).join(' · ')||'尚未取得升級'};
  if (command==='combos') {
    const active=activeSpellCombos(game.upgrades, game.relicId);
    const pending=spellComboProgress(game.upgrades, game.relicId)
      .filter(combo=>!combo.active)
      .map(combo=>`${combo.name}：${combo.missing.join('、')}`).join('；')||'全部解鎖';
    const lightning=game.upgrades.lightning>0 ? `${lightningInterval(game.upgrades)}s` : '未習得';
    const orb=game.upgrades.orb>0 ? `${orbRange(game.upgrades, game.relicId)}px` : '未習得';
    return {ok:true, message:`組合: ${active.map(combo=>combo.name).join(' · ')||'尚未啟用'} | 待解鎖: ${pending} | 雷霆間隔: ${lightning} | 聖焰環半徑: ${orb} | 雷霆目標上限: ${game.upgrades.lightning>0?lightningTargets(game.upgrades,game.relicId):'未習得'}`};
  }
  // Read ECS components, not copies of legacy Engine fields.
  const ability=game.ecs?.getComponent(game.playerEntityId, 'ability');
  const spells=game.ecs?.getComponent(game.playerEntityId, 'spells');
  if (!ability || !spells) return {ok:false, message:'無法讀取技能狀態'};
  return {ok:true, message:`職業技: ${seconds(ability.cooldown)} | 持續: ${seconds(ability.duration)} | 自動攻擊: ${seconds(spells.attackTimer)} | 聖焰環: ${game.upgrades.orb>0?seconds(spells.orbTimer):'未習得'} | 雷霆誓約: ${game.upgrades.lightning>0?seconds(spells.lightningTimer):'未習得'}`};
}
