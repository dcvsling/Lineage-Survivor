/** One optional camp loadout slot; effects are snapshotted at run start. */
export const RELICS=Object.freeze({
 none:{name:'不裝備遺物',description:'維持原本能力，沒有額外效果或代價。'},
 ward:{name:'守望護符',description:'抵擋一次敵方飛射攻擊，之後需 8 秒充能；不能抵擋近身碰撞。代價：移動速度降低 8%。'},
 compass:{name:'獵魂羅盤',description:'靈魂吸取半徑增加 100。代價：出發時生命上限降低 15%（四捨五入）；後續生命祝福仍增加 25。'},
 hourglass:{name:'回響沙漏',description:'職業技能冷卻縮短 25%。代價：每局治療藥水由 3 瓶減為 2 瓶。'}
});
export const normalizeRelic=id=>typeof id==='string'&&Object.hasOwn(RELICS,id)?id:'none';
export const relicUnlocked=save=>typeof save?.best==='number'&&Number.isFinite(save.best)&&save.best>=60;
