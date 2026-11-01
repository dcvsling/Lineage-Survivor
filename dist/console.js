/** Read-only developer commands. No eval, DOM, or save mutations. */
const COMMANDS = Object.freeze(['help', 'status', 'player', 'skills']);
export function executeCommand(input, game) {
  if (typeof input !== 'string') return {ok:false, message:'指令必須是文字'};
  const parts=input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const command=parts[0];
  if (!command) return {ok:false, message:'輸入 help 查看指令'};
  if (!COMMANDS.includes(command) || parts.length!==1) return {ok:false, message:'未知指令；輸入 help 查看可用指令'};
  if (command==='help') return {ok:true, message:'help · status · player · skills'};
  if (!game) return {ok:false, message:'尚未開始遠征'};
  if (command==='status') return {ok:true, message:`狀態: ${game.status} | 時間: ${Math.floor(game.time)}s | 等級: ${game.level} | 擊倒: ${game.kills}`};
  if (command==='player') return {ok:true, message:`HP: ${Math.ceil(game.player.hp)}/${game.player.maxHp} | 速度: ${game.player.speed} | 座標: (${Math.round(game.player.x)}, ${Math.round(game.player.y)})`};
  return {ok:true, message:Object.entries(game.upgrades).filter(([,v])=>v>0).map(([k,v])=>`${k} +${v}`).join(' · ')||'尚未取得升級'};
}
