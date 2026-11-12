import {normalizeRelic} from './relics.js';
import {ComponentWorld,createPlayerEntity,createEnemyEntity,createPlayerCombatState,exposeComponentField} from './ecs.js';
import {stepEnemyMovement} from './enemy-movement.js';
import {stepPlayerSpells,stepPlayerAbilityTimers} from './player-spells.js';
import {castPlayerAbility} from './player-abilities.js';
/** Deterministic, DOM-free simulation. All distances are world pixels, all times seconds. */
export const WORLD_SIZE = 2400;
export const RUN_SECONDS = 480;
export const ENEMY_WARNING_SECONDS = .6;
export const CLASSES = {
  knight: {name:'騎士',weapon:'月鋼斬',description:'厚甲近戰・扇形斬擊・高生命',color:'#e8c27b',hp:150,speed:188},
  elf: {name:'遊俠',weapon:'風靈箭',description:'迅捷遠射・貫穿箭矢・高機動',color:'#8de0af',hp:105,speed:218},
  mage: {name:'法師',weapon:'焚星術',description:'追蹤火球・爆炸範圍・群體傷害',color:'#b6a0ff',hp:110,speed:194}
};
export const ABILITIES = {
  knight: {name:'王者守護',description:'震退周圍敵人，3 秒內受到的傷害降低 65%。',cooldown:12,duration:3,color:'#f6d891'},
  elf: {name:'疾風閃步',description:'沿移動方向衝刺，0.35 秒內無敵；靜止時朝面向衝刺。',cooldown:10,duration:.35,color:'#8de0af'},
  mage: {name:'霜星新星',description:'冰霜震擊周圍敵人，並降低其移動速度 60%，持續 3 秒。',cooldown:14,duration:.5,color:'#a8e4ff'}
};
export const UPGRADES = {
  weapon:{name:'武器精煉',description:'主武器傷害 +28%；第五階進化並增加攻擊範圍／彈數。',max:5},
  haste:{name:'戰鬥專注',description:'自動攻擊間隔縮短 12%。',max:5},
  orb:{name:'聖焰環',description:'環繞聖焰傷敵；每階增加傷害，第五階進化雙重光環。',max:5},
  lightning:{name:'雷霆誓約',description:'定時雷擊最近敵人；每階增加目標，第五階進化天罰。',max:5},
  vitality:{name:'生命祝福',description:'生命上限 +25，並立即恢復 35 點生命。',max:5},
  speed:{name:'疾風步',description:'移動速度 +9%。',max:4},
  magnet:{name:'靈魂引力',description:'經驗吸取距離 +55。',max:4},
  armor:{name:'守護刻印',description:'每次受到的傷害減少 2（最低 1）。',max:5}
};
const ENEMY_NAMES={melee:'腐木步卒',fast:'疾影獵犬',ranged:'荒林咒師',boss:'暮林君王',unknown:'未知敵人'};
export function outcomeSummary(game){
  if(game.status==='victory')return {title:'曙光凱旋',reason:'你擊倒暮林君王，並存活至 8 分鐘的黎明。',advice:'勝利額外獲得 200 金幣。帶著傳承裝備迎接下一場遠征。'};
  if(game.status==='retreat')return {title:'黎明撤離',reason:'已存活 8 分鐘，但暮林君王尚未被擊倒。你安全撤回營地。',advice:'一般戰利品已保留，沒有勝利加成。下次可在 7 分鐘君王登場後主動靠近交戰。'};
  if(game.status==='dead'){
    const hit=game.deathCause;
    const cause=hit?`${ENEMY_NAMES[hit.enemyType]||ENEMY_NAMES.unknown}的${hit.kind==='projectile'?'飛射攻擊':'近身碰撞'}造成最後 ${Math.round(hit.damage*10)/10} 點傷害。`:'生命耗盡，遠征提前結束。';
    const reason=(game.bossDefeated?'君王雖已倒下，但你未能存活至黎明。':'')+cause;
    const advice=hit?.kind==='projectile'?'留意橘紅預警，橫向移動避開鎖定方向；危急時使用職業技能或治療。':'保持退路，避免被敵群包圍；危急時使用職業技能或治療。';
    return {title:'傳承不滅',reason,advice};
  }
  return {title:'遠征進行中',reason:'存活至 8 分鐘；擊倒 7 分鐘登場的暮林君王即可凱旋。',advice:'收集靈魂升級，善用職業技能與有限治療。'};
}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const axis=value=>{try{const n=Number(value);return Number.isFinite(n)?clamp(n,-1e6,1e6):0;}catch{return 0;}};
export class Engine {
  constructor(classId='knight',equipment={},seed=123456,relicId='none') {
    Object.defineProperty(this,'relicId',{value:normalizeRelic(relicId),enumerable:true});this.relicCooldown=0;
    this.classId=Object.hasOwn(CLASSES,classId)?classId:'knight'; this.class=CLASSES[this.classId];
    this.seed=seed>>>0; this.equipment={weapon:0,armor:0,boots:0,...equipment};
    for(const key of Object.keys(this.equipment)) this.equipment[key]=Math.floor(clamp(axis(this.equipment[key]),0,5));
    // ECS components own player data while existing combat and renderer APIs
    // continue to use game.player (a live, serializable compatibility view).
    const ecs=new ComponentWorld();
    const {id,player}=createPlayerEntity(ecs,{
      x:1200,y:1200,radius:13,
      hp:this.class.hp+this.equipment.armor*10,
      maxHp:this.class.hp+this.equipment.armor*10,
      speed:this.class.speed+this.equipment.boots*5,facing:0
    });
    Object.defineProperty(this,'ecs',{value:ecs});
    Object.defineProperty(this,'playerEntityId',{value:id});
    this.player=player;
    if(this.relicId==='compass'){this.player.maxHp=Math.round(this.player.maxHp*.85);this.player.hp=this.player.maxHp;}
    if(this.relicId==='ward')this.player.speed*=.92;
    this.status='playing'; this.time=0; this.level=1; this.xp=0; this.xpNext=12; this.kills=0; this.potions=this.relicId==='hourglass'?2:3;
    this.enemies=[];this.projectiles=[];this.pickups=[];this.effects=[];this.choices=[];
    this.upgrades=Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])); this.damage={weapon:0,orb:0,lightning:0,ability:0};
    this.ability=Object.freeze({...ABILITIES[this.classId],cooldown:ABILITIES[this.classId].cooldown*(this.relicId==='hourglass'?.75:1)});
    // Cooldowns and active casting state belong to player ECS components.
    // Preserve legacy enumerable Engine fields, including their JSON order.
    const combatState=createPlayerCombatState(ecs,id);
    exposeComponentField(this,'abilityCooldown',combatState.ability,'cooldown');
    exposeComponentField(this,'abilityDuration',combatState.ability,'duration');
    exposeComponentField(this,'dashDirection',combatState.ability);
    exposeComponentField(this,'attackTimer',combatState.spells);
    this.spawnTimer=0.4;
    exposeComponentField(this,'orbTimer',combatState.spells);
    exposeComponentField(this,'lightningTimer',combatState.spells);
    this.hurtTimer=0;this.nextId=1;
    this.bossSpawned=false;this.bossDefeated=false;this.rewards=null;this.lastHit=null;this.deathCause=null;
  }
  get pickupRadius(){return 105+this.upgrades.magnet*55+(this.relicId==='compass'?100:0);}
  random(){let a=this.seed+=0x6D2B79F5; a=Math.imul(a^a>>>15,a|1);a^=a+Math.imul(a^a>>>7,a|61);return ((a^a>>>14)>>>0)/4294967296;}
  togglePause(){if(this.status==='playing')this.status='paused';else if(this.status==='paused')this.status='playing';return this.status;}
  heal(){if(this.status!=='playing'||this.potions<=0||this.player.hp>=this.player.maxHp)return false;this.potions--;this.player.hp=Math.min(this.player.maxHp,this.player.hp+this.player.maxHp*.45);this.effect('heal',this.player.x,this.player.y,45,'#8fffc1','治癒');return true;}
  useAbility(input={x:0,y:0}){return castPlayerAbility(this,input);}
  effect(type,x,y,radius,color,text=''){this.effects.push({type,x,y,radius,color,text,life:type==='text'?0.65:0.3,maxLife:type==='text'?0.65:0.3});}
  rollChoices(){const pool=Object.keys(UPGRADES).filter(id=>this.upgrades[id]<UPGRADES[id].max);for(let i=pool.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,3).map(id=>({id,...UPGRADES[id],level:this.upgrades[id]+1}));}
  checkLevel(){if(this.xp>=this.xpNext){this.xp-=this.xpNext;this.level++;this.xpNext=Math.round(12+this.level*5+this.level*this.level*.22);this.choices=this.rollChoices();if(this.choices.length)this.status='upgrade';else {this.player.hp=Math.min(this.player.maxHp,this.player.hp+15);this.checkLevel();}}}
  chooseUpgrade(id){if(this.status!=='upgrade'||!this.choices.some(c=>c.id===id))return false;this.upgrades[id]++;if(id==='vitality'){this.player.maxHp+=25;this.player.hp=Math.min(this.player.maxHp,this.player.hp+35);}if(id==='speed')this.player.speed=(this.class.speed+this.equipment.boots*5)*(1+this.upgrades.speed*.09)*(this.relicId==='ward'?.92:1);this.status='playing';this.choices=[];this.checkLevel();return true;}
  spawn(type){
    if(!['melee','fast','ranged','boss'].includes(type))return null;
    if(this.enemies.length>=180){
      if(type!=='boss')return null;
      // The scheduled boss must appear even at the cap. Retire the most distant
      // regular enemy without granting an unearned kill or experience reward.
      let index=-1,far=-1;for(let i=0;i<this.enemies.length;i++){const e=this.enemies[i],d=distance(this.player,e);if(e.type!=='boss'&&d>far){index=i;far=d;}}
      if(index<0)return null;const [retired]=this.enemies.splice(index,1);this.ecs.destroyEntity(retired.ecsEntityId);
    }
    const angle=this.random()*Math.PI*2;const r=460+this.random()*100;const scale=1+this.time/240;const data={melee:[24*scale,45+this.time/30,14,9],fast:[15*scale,93+this.time/35,10,7],ranged:[30*scale,36,13,10],boss:[2400,60,38,25]}[type];const e={id:this.nextId++,type,x:clamp(this.player.x+Math.cos(angle)*r,25,2375),y:clamp(this.player.y+Math.sin(angle)*r,25,2375),hp:data[0],maxHp:data[0],speed:data[1],radius:data[2],damage:data[3],shootTimer:1+this.random(),warning:0,aimAngle:0,aimAngles:[],hit:0};const {enemy}=createEnemyEntity(this.ecs,e);this.enemies.push(enemy);return enemy;}
  hit(enemy,amount,source='weapon'){if(['dead','victory','retreat'].includes(this.status))return;if(!enemy||enemy.hp<=0||!Number.isFinite(amount)||amount<=0)return;if(!Object.hasOwn(this.damage,source))source='weapon';const actual=Math.min(enemy.hp,amount);enemy.hp-=amount;enemy.hit=.12;this.damage[source]+=actual;this.effect('text',enemy.x,enemy.y-18,0,source==='weapon'?'#f7dfaa':'#bcb1ff',String(Math.round(amount)));if(enemy.hp<=0){this.kills++;this.pickups.push({x:enemy.x,y:enemy.y,value:enemy.type==='boss'?100:enemy.type==='ranged'?4:enemy.type==='fast'?2:3});if(enemy.type==='boss'){this.bossDefeated=true;this.effect('burst',enemy.x,enemy.y,130,'#f4ce79');}this.effect('death',enemy.x,enemy.y,enemy.radius+8,'#738e75');}}
  nearest(max=Infinity){let target=null,dist=max;for(const e of this.enemies){if(e.hp<=0)continue;const d=distance(this.player,e);if(d<dist){target=e;dist=d;}}return target;}
  attack(){const p=this.player;const target=this.nearest(680);if(!target)return;const power=(1+this.upgrades.weapon*.28)*(1+this.equipment.weapon*.08);const evolved=this.upgrades.weapon>=5;const angle=Math.atan2(target.y-p.y,target.x-p.x);p.facing=angle;
    if(this.classId==='knight'){const range=evolved?172:126;this.effect('slash',p.x,p.y,range,'#f6d891');for(const e of this.enemies){if(distance(p,e)<range+e.radius)this.hit(e,23*power);}}
    else {const count=this.classId==='elf'?(evolved?3:1):(evolved?2:1);for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*.17;this.projectiles.push({x:p.x,y:p.y,vx:Math.cos(a)*(this.classId==='elf'?540:360),vy:Math.sin(a)*(this.classId==='elf'?540:360),radius:this.classId==='elf'?4:8,hostile:false,color:this.classId==='elf'?'#b9f1a2':'#d5a2ff',damage:(this.classId==='elf'?26:34)*power,life:2,kind:this.classId,targetId:target.id,hitIds:[],pierce:this.classId==='elf'?(evolved?5:2):1,blast:this.classId==='mage'?(evolved?110:76):0});}}
  }
  hurt(amount,source={enemyType:'unknown',kind:'contact'}){if(this.status!=='playing'||this.hurtTimer>0||!Number.isFinite(amount)||amount<=0||(this.classId==='elf'&&this.abilityDuration>0))return;if(this.relicId==='ward'&&source?.kind==='projectile'&&this.relicCooldown<=0){this.relicCooldown=8;this.effect('ward',this.player.x,this.player.y,48,'#9de7ff','護符格擋');return;}const reduction=this.classId==='knight'&&this.abilityDuration>0?.35:1;const n=Math.max(1,(amount-this.upgrades.armor*2-this.equipment.armor)*reduction);const actual=Math.min(this.player.hp,n);this.player.hp=Math.max(0,this.player.hp-n);this.lastHit={enemyType:Object.hasOwn(ENEMY_NAMES,source?.enemyType)?source.enemyType:'unknown',kind:source?.kind==='projectile'?'projectile':'contact',damage:actual};this.hurtTimer=.65;this.effect('hurt',this.player.x,this.player.y,26,'#ff7474');if(this.player.hp<=0){this.deathCause={...this.lastHit};this.finish('dead');}}
  finish(status){if(this.rewards)return;this.status=status;this.projectiles=this.projectiles.slice(-350);this.effects=this.effects.slice(-150);const tier=this.bossDefeated?3:this.time>=240?2:this.kills>=35?1:0;this.rewards={gold:Math.floor(this.kills*.8+this.time/4+(status==='victory'?200:0)),equipment:{...this.equipment}};if(tier){const slot=['weapon','armor','boots'][Math.floor(this.random()*3)];this.rewards.equipment[slot]=Math.max(tier,this.equipment[slot]);this.rewards.drop={slot,tier};}}
  update(dt,input={x:0,y:0}){if(this.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;if(this.time>=RUN_SECONDS){this.time=RUN_SECONDS;this.finish(this.bossDefeated?'victory':'retreat');return;}let remaining=Math.min(dt,.25,RUN_SECONDS-this.time);while(remaining>0&&this.status==='playing'){const step=Math.min(remaining,1/30);this.step(step,input);remaining-=step;}}
  step(dt,input){this.relicCooldown=Math.max(0,this.relicCooldown-dt);this.time=Math.min(RUN_SECONDS,this.time+dt);const p=this.player;let ix=axis(input?.x),iy=axis(input?.y);const norm=Math.max(1,Math.hypot(ix,iy));const dashTime=this.classId==='elf'?Math.min(dt,this.abilityDuration):0;const walkTime=dt-dashTime;p.x=clamp(p.x+ix/norm*p.speed*walkTime+this.dashDirection.x*720*dashTime,20,2380);p.y=clamp(p.y+iy/norm*p.speed*walkTime+this.dashDirection.y*720*dashTime,20,2380);if(ix||iy)p.facing=Math.atan2(iy,ix);this.hurtTimer=Math.max(0,this.hurtTimer-dt);
    this.spawnTimer-=dt;if(this.spawnTimer<=0&&this.enemies.length<180){this.spawnTimer=Math.max(.12,.85-this.time/.72e3);const n=1+Math.floor(this.time/160);for(let i=0;i<n;i++){const r=this.random();this.spawn(this.time>60&&r<.2?'ranged':this.time>25&&r<.48?'fast':'melee');}}
    if(!this.bossSpawned&&this.time>=420){this.bossSpawned=true;this.spawn('boss');this.effect('text',p.x,p.y-80,0,'#ffb48c','古森君王降臨');}
    stepPlayerSpells(this,dt);
    for(const e of this.enemies){if(e.hp<=0)continue;e.hit=Math.max(0,e.hit-dt);const d=stepEnemyMovement(e,p,dt);if(d<e.radius+p.radius){this.hurt(e.damage,{enemyType:e.type,kind:'contact'});if(this.status==='dead')return;}if(e.type==='ranged'||e.type==='boss'){
      if(e.warning>0){
        e.warning=Math.max(0,e.warning-dt);e.shootTimer=e.warning;
        if(e.warning<=1e-9){
          e.warning=0;e.shootTimer=e.type==='boss'?2.2:2.9;
          for(const angle of e.aimAngles)this.projectiles.push({x:e.x,y:e.y,vx:Math.cos(angle)*165,vy:Math.sin(angle)*165,radius:6,hostile:true,enemyType:e.type,color:'#f7946b',damage:e.damage,life:5});
        }
      }else{
        e.shootTimer-=dt;
        if(e.shootTimer<=ENEMY_WARNING_SECONDS){
          // Start a full visible warning even if the timer was externally advanced.
          // Lock the spread now: moving sideways during the warning evades the shot.
          e.warning=ENEMY_WARNING_SECONDS;e.shootTimer=e.warning;
          e.aimAngle=Math.atan2(p.y-e.y,p.x-e.x);
          const count=e.type==='boss'?9:1;
          e.aimAngles=Array.from({length:count},(_,i)=>e.aimAngle+(i-(count-1)/2)*.22);
        }
      }
    }}
    for(const b of this.projectiles){if(b.kind==='mage'&&b.life>1.15){const target=this.enemies.find(e=>e.id===b.targetId&&e.hp>0);if(target){const angle=Math.atan2(target.y-b.y,target.x-b.x);b.vx+=(Math.cos(angle)*360-b.vx)*Math.min(1,dt*7);b.vy+=(Math.sin(angle)*360-b.vy)*Math.min(1,dt*7);}}b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.hostile){if(distance(b,p)<b.radius+p.radius){this.hurt(b.damage,{enemyType:b.enemyType,kind:'projectile'});b.life=0;if(this.status==='dead')return;}}else{for(const e of this.enemies){if(e.hp<=0||b.hitIds.includes(e.id)||distance(b,e)>=b.radius+e.radius)continue;b.hitIds.push(e.id);if(b.blast){this.effect('burst',b.x,b.y,b.blast,'#ca9bfa');for(const target of this.enemies)if(distance(b,target)<b.blast+target.radius)this.hit(target,b.damage);}else this.hit(e,b.damage);b.pierce--;if(b.pierce<=0){b.life=0;break;}}}}
    const magnet=this.pickupRadius;for(const gem of this.pickups){const d=distance(gem,p);if(d<magnet){const speed=300+Math.max(0,magnet-d)*3;gem.x+=(p.x-gem.x)/(d||1)*Math.min(d,speed*dt);gem.y+=(p.y-gem.y)/(d||1)*Math.min(d,speed*dt);}if(distance(gem,p)<20){this.xp+=gem.value;gem.collected=true;}}
    this.enemies=this.enemies.filter(e=>{if(e.hp>0)return true;this.ecs.destroyEntity(e.ecsEntityId);return false;});this.projectiles=this.projectiles.filter(b=>b.life>0).slice(-350);this.pickups=this.pickups.filter(g=>!g.collected);if(this.pickups.length>600){const old=this.pickups.splice(0,this.pickups.length-500);const value=old.reduce((n,g)=>n+g.value,0);this.pickups.push({x:old[0].x,y:old[0].y,value});}
    for(const fx of this.effects)fx.life-=dt;this.effects=this.effects.filter(fx=>fx.life>0).slice(-150);
    stepPlayerAbilityTimers(this,dt);
    if(this.status!=='playing')return;if(this.time>=RUN_SECONDS-1e-9){this.time=RUN_SECONDS;this.finish(this.bossDefeated?'victory':'retreat');}else this.checkLevel();
  }
}
