/** Deterministic, DOM-free simulation. All distances are world pixels, all times seconds. */
export const WORLD_SIZE = 2400;
export const RUN_SECONDS = 480;
export const CLASSES = {
  knight: {name:'騎士',weapon:'月鋼斬',description:'厚甲近戰・扇形斬擊・高生命',color:'#e8c27b',hp:150,speed:188},
  elf: {name:'遊俠',weapon:'風靈箭',description:'迅捷遠射・貫穿箭矢・高機動',color:'#8de0af',hp:105,speed:218},
  mage: {name:'法師',weapon:'焚星術',description:'追蹤火球・爆炸範圍・群體傷害',color:'#b6a0ff',hp:110,speed:194}
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
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class Engine {
  constructor(classId='knight',equipment={},seed=123456) {
    this.classId=CLASSES[classId]?classId:'knight'; this.class=CLASSES[this.classId];
    this.seed=seed>>>0; this.equipment={weapon:0,armor:0,boots:0,...equipment};
    for(const key of Object.keys(this.equipment)) this.equipment[key]=clamp(Number(this.equipment[key])||0,0,5);
    this.player={x:1200,y:1200,radius:13,hp:this.class.hp+this.equipment.armor*10,maxHp:this.class.hp+this.equipment.armor*10,speed:this.class.speed+this.equipment.boots*5,facing:0};
    this.status='playing'; this.time=0; this.level=1; this.xp=0; this.xpNext=12; this.kills=0; this.potions=3;
    this.enemies=[];this.projectiles=[];this.pickups=[];this.effects=[];this.choices=[];
    this.upgrades=Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])); this.damage={weapon:0,orb:0,lightning:0};
    this.attackTimer=0;this.spawnTimer=0.4;this.orbTimer=0;this.lightningTimer=2;this.hurtTimer=0;this.nextId=1;
    this.bossSpawned=false;this.bossDefeated=false;this.rewards=null;
  }
  random(){let a=this.seed+=0x6D2B79F5; a=Math.imul(a^a>>>15,a|1);a^=a+Math.imul(a^a>>>7,a|61);return ((a^a>>>14)>>>0)/4294967296;}
  togglePause(){if(this.status==='playing')this.status='paused';else if(this.status==='paused')this.status='playing';return this.status;}
  heal(){if(this.status!=='playing'||this.potions<=0||this.player.hp>=this.player.maxHp)return false;this.potions--;this.player.hp=Math.min(this.player.maxHp,this.player.hp+this.player.maxHp*.45);this.effect('heal',this.player.x,this.player.y,45,'#8fffc1','治癒');return true;}
  effect(type,x,y,radius,color,text=''){this.effects.push({type,x,y,radius,color,text,life:type==='text'?0.65:0.3,maxLife:type==='text'?0.65:0.3});}
  rollChoices(){const pool=Object.keys(UPGRADES).filter(id=>this.upgrades[id]<UPGRADES[id].max);for(let i=pool.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,3).map(id=>({id,...UPGRADES[id],level:this.upgrades[id]+1}));}
  checkLevel(){if(this.xp>=this.xpNext){this.xp-=this.xpNext;this.level++;this.xpNext=Math.round(12+this.level*5+this.level*this.level*.22);this.choices=this.rollChoices();if(this.choices.length)this.status='upgrade';else {this.player.hp=Math.min(this.player.maxHp,this.player.hp+15);this.checkLevel();}}}
  chooseUpgrade(id){if(this.status!=='upgrade'||!this.choices.some(c=>c.id===id))return false;this.upgrades[id]++;if(id==='vitality'){this.player.maxHp+=25;this.player.hp=Math.min(this.player.maxHp,this.player.hp+35);}if(id==='speed')this.player.speed=(this.class.speed+this.equipment.boots*5)*(1+this.upgrades.speed*.09);this.status='playing';this.choices=[];this.checkLevel();return true;}
  spawn(type){const angle=this.random()*Math.PI*2;const r=460+this.random()*100;const scale=1+this.time/240;const data={melee:[24*scale,45+this.time/30,14,9],fast:[15*scale,93+this.time/35,10,7],ranged:[30*scale,36,13,10],boss:[2400,60,38,25]}[type];const e={id:this.nextId++,type,x:clamp(this.player.x+Math.cos(angle)*r,25,2375),y:clamp(this.player.y+Math.sin(angle)*r,25,2375),hp:data[0],maxHp:data[0],speed:data[1],radius:data[2],damage:data[3],shootTimer:1+this.random(),hit:0};this.enemies.push(e);return e;}
  hit(enemy,amount,source='weapon'){if(enemy.hp<=0)return;const actual=Math.min(enemy.hp,amount);enemy.hp-=amount;enemy.hit=.12;this.damage[source]+=actual;this.effect('text',enemy.x,enemy.y-18,0,source==='weapon'?'#f7dfaa':'#bcb1ff',String(Math.round(amount)));if(enemy.hp<=0){this.kills++;this.pickups.push({x:enemy.x,y:enemy.y,value:enemy.type==='boss'?100:enemy.type==='ranged'?4:enemy.type==='fast'?2:3});if(enemy.type==='boss'){this.bossDefeated=true;this.effect('burst',enemy.x,enemy.y,130,'#f4ce79');}this.effect('death',enemy.x,enemy.y,enemy.radius+8,'#738e75');}}
  nearest(max=Infinity){let target=null,dist=max;for(const e of this.enemies){if(e.hp<=0)continue;const d=distance(this.player,e);if(d<dist){target=e;dist=d;}}return target;}
  attack(){const p=this.player;const target=this.nearest(680);if(!target)return;const power=(1+this.upgrades.weapon*.28)*(1+this.equipment.weapon*.08);const evolved=this.upgrades.weapon>=5;const angle=Math.atan2(target.y-p.y,target.x-p.x);p.facing=angle;
    if(this.classId==='knight'){const range=evolved?172:126;this.effect('slash',p.x,p.y,range,'#f6d891');for(const e of this.enemies){if(distance(p,e)<range+e.radius)this.hit(e,23*power);}}
    else {const count=this.classId==='elf'?(evolved?3:1):(evolved?2:1);for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*.17;this.projectiles.push({x:p.x,y:p.y,vx:Math.cos(a)*(this.classId==='elf'?540:360),vy:Math.sin(a)*(this.classId==='elf'?540:360),radius:this.classId==='elf'?4:8,hostile:false,color:this.classId==='elf'?'#b9f1a2':'#d5a2ff',damage:(this.classId==='elf'?26:34)*power,life:2,kind:this.classId,targetId:target.id,hitIds:[],pierce:this.classId==='elf'?(evolved?5:2):1,blast:this.classId==='mage'?(evolved?110:76):0});}}
  }
  hurt(amount){if(this.hurtTimer>0)return;const n=Math.max(1,amount-this.upgrades.armor*2-this.equipment.armor);this.player.hp=Math.max(0,this.player.hp-n);this.hurtTimer=.65;this.effect('hurt',this.player.x,this.player.y,26,'#ff7474');if(this.player.hp<=0)this.finish('dead');}
  finish(status){if(this.rewards)return;this.status=status;const tier=this.bossDefeated?3:this.time>=240?2:this.kills>=35?1:0;this.rewards={gold:Math.floor(this.kills*.8+this.time/4+(status==='victory'?200:0)),equipment:{...this.equipment}};if(tier){const slot=['weapon','armor','boots'][Math.floor(this.random()*3)];this.rewards.equipment[slot]=Math.max(tier,this.equipment[slot]);this.rewards.drop={slot,tier};}}
  update(dt,input={x:0,y:0}){if(this.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;let remaining=Math.min(dt,.25);while(remaining>0&&this.status==='playing'){const step=Math.min(remaining,1/30);this.step(step,input);remaining-=step;}}
  step(dt,input){this.time+=dt;const p=this.player;let ix=Number(input.x)||0,iy=Number(input.y)||0;const norm=Math.max(1,Math.hypot(ix,iy));p.x=clamp(p.x+ix/norm*p.speed*dt,20,2380);p.y=clamp(p.y+iy/norm*p.speed*dt,20,2380);if(ix||iy)p.facing=Math.atan2(iy,ix);this.hurtTimer=Math.max(0,this.hurtTimer-dt);
    this.spawnTimer-=dt;if(this.spawnTimer<=0&&this.enemies.length<180){this.spawnTimer=Math.max(.12,.85-this.time/.72e3);const n=1+Math.floor(this.time/160);for(let i=0;i<n;i++){const r=this.random();this.spawn(this.time>60&&r<.2?'ranged':this.time>25&&r<.48?'fast':'melee');}}
    if(!this.bossSpawned&&this.time>=420){this.bossSpawned=true;this.spawn('boss');this.effect('text',p.x,p.y-80,0,'#ffb48c','古森君王降臨');}
    this.attackTimer-=dt;if(this.attackTimer<=0){this.attackTimer=(this.classId==='knight'?.72:this.classId==='elf'?.65:1.05)*Math.pow(.88,this.upgrades.haste);this.attack();}
    this.orbTimer-=dt;if(this.upgrades.orb&&this.orbTimer<=0){this.orbTimer=.5;const range=this.upgrades.orb>=5?122:85;this.effect('orb',p.x,p.y,range,'#83d8d0');for(const e of this.enemies)if(distance(p,e)<range+e.radius)this.hit(e,5+this.upgrades.orb*5,'orb');}
    this.lightningTimer-=dt;if(this.upgrades.lightning&&this.lightningTimer<=0){this.lightningTimer=this.upgrades.lightning>=5?1.3:2;const targets=this.enemies.filter(e=>e.hp>0&&distance(p,e)<600).sort((a,b)=>distance(p,a)-distance(p,b)).slice(0,this.upgrades.lightning+1);for(const e of targets){this.hit(e,22+this.upgrades.lightning*12,'lightning');this.effect('lightning',e.x,e.y,30,'#9cbbff');}}
    for(const e of this.enemies){if(e.hp<=0)continue;e.hit=Math.max(0,e.hit-dt);const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;const approach=e.type==='ranged'?(d>260?1:d<170?-0.6:0):1;e.x=clamp(e.x+dx/d*e.speed*approach*dt,15,2385);e.y=clamp(e.y+dy/d*e.speed*approach*dt,15,2385);if(d<e.radius+p.radius)this.hurt(e.damage);if(e.type==='ranged'||e.type==='boss'){e.shootTimer-=dt;if(e.shootTimer<=0){e.shootTimer=e.type==='boss'?2.2:2.9;const count=e.type==='boss'?9:1;for(let i=0;i<count;i++){const angle=Math.atan2(dy,dx)+(i-(count-1)/2)*.22;this.projectiles.push({x:e.x,y:e.y,vx:Math.cos(angle)*165,vy:Math.sin(angle)*165,radius:6,hostile:true,color:'#f7946b',damage:e.damage,life:5});}}}}
    for(const b of this.projectiles){if(b.kind==='mage'&&b.life>1.15){const target=this.enemies.find(e=>e.id===b.targetId&&e.hp>0);if(target){const angle=Math.atan2(target.y-b.y,target.x-b.x);b.vx+=(Math.cos(angle)*360-b.vx)*Math.min(1,dt*7);b.vy+=(Math.sin(angle)*360-b.vy)*Math.min(1,dt*7);}}b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.hostile){if(distance(b,p)<b.radius+p.radius){this.hurt(b.damage);b.life=0;}}else{for(const e of this.enemies){if(e.hp<=0||b.hitIds.includes(e.id)||distance(b,e)>=b.radius+e.radius)continue;b.hitIds.push(e.id);if(b.blast){this.effect('burst',b.x,b.y,b.blast,'#ca9bfa');for(const target of this.enemies)if(distance(b,target)<b.blast+target.radius)this.hit(target,b.damage);}else this.hit(e,b.damage);b.pierce--;if(b.pierce<=0){b.life=0;break;}}}}
    const magnet=105+this.upgrades.magnet*55;for(const gem of this.pickups){const d=distance(gem,p);if(d<magnet){const speed=300+Math.max(0,magnet-d)*3;gem.x+=(p.x-gem.x)/(d||1)*Math.min(d,speed*dt);gem.y+=(p.y-gem.y)/(d||1)*Math.min(d,speed*dt);}if(distance(gem,p)<20){this.xp+=gem.value;gem.collected=true;}}
    this.enemies=this.enemies.filter(e=>e.hp>0);this.projectiles=this.projectiles.filter(b=>b.life>0).slice(-350);this.pickups=this.pickups.filter(g=>!g.collected);if(this.pickups.length>600){const old=this.pickups.splice(0,this.pickups.length-500);const value=old.reduce((n,g)=>n+g.value,0);this.pickups.push({x:old[0].x,y:old[0].y,value});}
    for(const fx of this.effects)fx.life-=dt;this.effects=this.effects.filter(fx=>fx.life>0).slice(-150);
    if(this.status!=='playing')return;if(this.time>=RUN_SECONDS&&this.bossDefeated)this.finish('victory');else this.checkLevel();
  }
}
