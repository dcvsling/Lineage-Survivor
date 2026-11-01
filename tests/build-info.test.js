import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,UPGRADES,ABILITIES} from '../dist/engine.js';
import {upgradeInfo,buildSummary,skillName} from '../dist/build-info.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('only three combat skills evolve at rank five; titles show the next form',()=>{
  for(const c of ['knight','elf','mage'])for(const id of Object.keys(UPGRADES)){
    const info=upgradeInfo(c,id,4),evolves=['weapon','orb','lightning'].includes(id);assert.equal(info.evolves,evolves);assert.equal(info.name,skillName(c,id,info.nextLevel));assert.equal(info.evolutionName!==null,evolves);if(evolves){assert.notEqual(info.name,skillName(c,id,0));assert.match(info.description,/進化/);}else assert.doesNotMatch(info.description,/進化/);
  }
});
test('weapon descriptions agree with every class/rank actual attack and separate equipment multiplier',()=>{
  for(const c of ['knight','elf','mage'])for(let r=0;r<=5;r++){
    const g=new Engine(c,{weapon:2});g.upgrades.weapon=r;const e=g.spawn('melee');e.x=g.player.x+60;e.y=g.player.y;e.hp=e.maxHp=10000;g.attack();const summary=buildSummary(g).find(x=>x.id==='weapon');const info=upgradeInfo(c,'weapon',r);close(summary.stats.equipmentMultiplier,1.16);close(summary.stats.effectiveDamage,c==='knight'?g.damage.weapon:g.projectiles[0].damage);close(info.current.damage*1.16,summary.stats.effectiveDamage);
    if(c==='knight'){assert.equal(info.current.range,r===5?172:126);assert.match(summary.description,/周圍半徑/);assert.doesNotMatch(summary.description,/扇形/);}else{assert.equal(info.current.projectiles,g.projectiles.length);if(c==='elf')assert.equal(info.current.pierce,g.projectiles[0].pierce);else assert.equal(info.current.blast,g.projectiles[0].blast);}
  }
});
test('orb and lightning displayed rank effects agree with simulation damage and cadence',()=>{
  for(let r=1;r<=5;r++)for(const id of ['orb','lightning']){
    const g=new Engine();g.spawnTimer=g.attackTimer=100;g.upgrades[id]=r;g.orbTimer=g.lightningTimer=0;const info=upgradeInfo('knight',id,r).current;const count=id==='orb'?1:r+1;for(let n=0;n<count;n++){const e=g.spawn('melee');e.x=g.player.x+(id==='orb'?50:300);e.y=g.player.y+n;e.hp=e.maxHp=10000;}g.update(.001);close(g.damage[id],info.damage*count);assert.equal(id==='orb'?g.orbTimer:g.lightningTimer,info.interval);if(id==='orb')assert.equal(info.range,r===5?122:85);else assert.equal(info.targets,count);
  }
  assert.equal(upgradeInfo('mage','orb',0).current.active,false);assert.equal(upgradeInfo('mage','lightning',0).current.damage,0);
});
test('passive summaries match applied engine stats and keep multiplicative haste accurate',()=>{
  const g=new Engine('mage',{weapon:2,armor:3,boots:2});for(const id of Object.keys(UPGRADES))for(let r=0;r<UPGRADES[id].max;r++){g.status='upgrade';g.choices=[{id}];assert.equal(g.chooseUpgrade(id),true);}
  const before=JSON.stringify(g),entries=buildSummary(g),by=id=>entries.find(e=>e.id===id);assert.equal(JSON.stringify(g),before);assert.equal(by('vitality').stats.maxHp,g.player.maxHp);close(by('speed').stats.speed,g.player.speed);close(by('haste').stats.intervalMultiplier,.88**5);close(by('weapon').stats.interval,1.05*.88**5);assert.equal(by('magnet').stats.range,325);assert.equal(by('armor').stats.totalReduction,13);assert.match(by('equipment').description,/生命 \+30/);assert.match(by('ability').description,new RegExp(`冷卻 ${ABILITIES.mage.cooldown} 秒`));
});
test('safe ranks, unknown identifiers, and maxed descriptions are stable',()=>{
  assert.equal(upgradeInfo('knight','toString',4),null);assert.equal(upgradeInfo('knight',Symbol(),0),null);assert.equal(skillName('mage','bad',4),'未知祝福');for(const bad of [NaN,Infinity,Symbol(),{},-4])assert.equal(upgradeInfo('bad','weapon',bad).currentLevel,0);assert.equal(upgradeInfo('knight','weapon',2.8).currentLevel,2);const max=upgradeInfo('knight','weapon',999);assert.equal(max.currentLevel,5);assert.equal(max.nextLevel,5);assert.equal(max.maxed,true);assert.equal(max.evolves,false);assert.match(max.description,/已滿階/);assert.equal(buildSummary(null).find(e=>e.id==='weapon').name,'月鋼斬');
});

test('relic-aware summary and pickup previews match real run state',()=>{
 for(const classId of ['knight','elf','mage'])for(const relicId of ['none','ward','compass','hourglass']){
  const g=new Engine(classId,{weapon:2,armor:2,boots:2},7,relicId);
  g.upgrades.vitality=2;g.player.maxHp+=50;g.upgrades.speed=2;g.player.speed=(g.class.speed+10)*1.18*(relicId==='ward'?.92:1);g.upgrades.magnet=2;
  const entries=buildSummary(g),by=id=>entries.find(e=>e.id===id);
  assert.equal(by('vitality').stats.maxHp,g.player.maxHp);
  assert.equal(by('speed').stats.speed,g.player.speed);
  assert.equal(by('magnet').stats.range,g.pickupRadius);
  assert.equal(upgradeInfo(classId,'magnet',2,g).current.range,g.pickupRadius);
  assert.equal(upgradeInfo(classId,'magnet',2,g).next.range,g.pickupRadius+55);
  assert.match(by('ability').description,new RegExp(String(g.ability.cooldown)));
  assert.ok(by('relic').description.length>10);
 }
});
