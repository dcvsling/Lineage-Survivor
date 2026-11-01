/** Reproducible gameplay soak: normal HP/equipment, no injected kills or invulnerability.
 * Bot performance is diagnostic, not a balance pass/fail criterion.
 * Run: node scripts/soak.mjs
 */
import assert from 'node:assert/strict';
import {Engine} from '../dist/engine.js';
const seeds=[7,42,2026];
const classes=['knight','elf','mage'];
const priority=['weapon','orb','lightning','haste','vitality','armor','magnet','speed'];
const limits={enemies:180,projectiles:350,pickups:600,effects:150};
const start=performance.now();let sampledHeap=process.memoryUsage().heapUsed;
const results=[];
function inputFor(g){
  let x=Math.cos(g.time*.12),y=Math.sin(g.time*.12),near=null,dist=Infinity;
  for(const gem of g.pickups){const d=Math.hypot(gem.x-g.player.x,gem.y-g.player.y);if(d<dist){near=gem;dist=d;}}
  if(near){x=(near.x-g.player.x)/80;y=(near.y-g.player.y)/80;}
  for(const e of g.enemies){const dx=g.player.x-e.x,dy=g.player.y-e.y,d=Math.hypot(dx,dy);if(d<95){x+=dx/(d||1)*(95-d)/12;y+=dy/(d||1)*(95-d)/12;}}
  return {x,y};
}
function verify(g,label){
  for(const field of ['x','y','hp','maxHp','speed'])assert.ok(Number.isFinite(g.player[field]),`${label}: player.${field} non-finite`);
  assert.ok(g.player.x>=20&&g.player.x<=2380&&g.player.y>=20&&g.player.y<=2380,`${label}: outside world`);
  assert.ok(g.player.hp>=0&&g.player.hp<=g.player.maxHp,`${label}: HP range`);
  assert.ok(g.potions>=0&&g.potions<=3,`${label}: potion range`);
  for(const [key,max]of Object.entries(limits))assert.ok(g[key].length<=max,`${label}: ${key} exceeds ${max}`);
  for(const amount of Object.values(g.damage))assert.ok(Number.isFinite(amount)&&amount>=0,`${label}: invalid damage`);
  assert.ok(g.abilityCooldown>=0&&g.abilityCooldown<=g.ability.cooldown,`${label}: ability cooldown`);
  if(g.rewards){
    assert.equal(g.rewards.gold,Math.floor(g.kills*.8+g.time/4+(g.status==='victory'?200:0)),`${label}: rewards disagree with final state`);
    for(const [slot,tier]of Object.entries(g.rewards.equipment)){assert.ok(Number.isInteger(tier)&&tier>=g.equipment[slot]&&tier<=5,`${label}: invalid/lost equipment`);}
    assert.equal(g.player.hp===0,g.status==='dead',`${label}: terminal HP/state mismatch`);
  }
}
try{
  for(const classId of classes)for(const seed of seeds){
    const g=new Engine(classId,{},seed),began=performance.now(),max=Object.fromEntries(Object.keys(limits).map(key=>[key,0]));
    for(let frame=0;frame<480*30+1&&!['dead','victory','retreat'].includes(g.status);frame++){
      if(g.status==='upgrade')g.chooseUpgrade([...g.choices].sort((a,b)=>priority.indexOf(a.id)-priority.indexOf(b.id))[0].id);
      if(g.player.hp<g.player.maxHp*.45)g.heal();
      const input=inputFor(g);if(g.abilityCooldown===0)g.useAbility(input);g.update(1/30,input);
      verify(g,`${classId}/${seed}/frame${frame}`);
      for(const key in max)max[key]=Math.max(max[key],g[key].length);
      if(frame%1000===0)sampledHeap=Math.max(sampledHeap,process.memoryUsage().heapUsed);
    }
    assert.ok(g.rewards,`${classId}/${seed}: did not reach an outcome by deadline`);
    if(g.rewards){const frozen=JSON.stringify(g);g.update(100,{x:1,y:1});assert.equal(JSON.stringify(g),frozen,'terminal state changed after update');}
    const result={class:classId,seed,status:g.status,timeSeconds:+g.time.toFixed(2),kills:g.kills,level:g.level,hp:+g.player.hp.toFixed(2),potions:g.potions,bossDefeated:g.bossDefeated,max,runtimeMs:Math.round(performance.now()-began)};
    results.push(result);console.log(JSON.stringify(result));
  }
  console.log(JSON.stringify({result:'PASS: invariants held',runs:results.length,wins:results.filter(r=>r.status==='victory').length,deaths:results.filter(r=>r.status==='dead').length,retreats:results.filter(r=>r.status==='retreat').length,observationWindowEnded:results.filter(r=>r.status==='playing').length,elapsedMs:Math.round(performance.now()-start),sampledHeapPeakMiB:+(sampledHeap/1048576).toFixed(2),limits,note:'480-second bounded run; bot death or retreat is not an invariant failure. Heap is sampled Node heap usage, not browser/device memory.'}));
}catch(error){console.error('SOAK INVARIANT FAILURE:',error);process.exitCode=1;}
