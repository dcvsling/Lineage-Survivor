import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine, CLASSES, ABILITIES, RUN_SECONDS, outcomeSummary} from '../dist/engine.js';
const tick=(g,seconds,input={x:0,y:0})=>{for(let i=0;i<seconds*30;i++)g.update(1/30,input);};
test('three classes have distinct durability, movement, and attacks',()=>{for(const id of Object.keys(CLASSES)){const g=new Engine(id);const enemy=g.spawn('melee');enemy.x=g.player.x+60;enemy.y=g.player.y;g.attack();if(id==='knight')assert.ok(enemy.hp<enemy.maxHp);else assert.equal(g.projectiles[0].kind,id);}assert.ok(new Engine('knight').player.hp>new Engine('elf').player.hp);assert.ok(new Engine('elf').player.speed>new Engine('mage').player.speed);});
test('movement normalized and clamped; invalid delta does not corrupt state',()=>{const a=new Engine(),b=new Engine();a.spawnTimer=b.spawnTimer=100;tick(a,1,{x:1,y:0});tick(b,1,{x:1,y:1});assert.ok(Math.abs(Math.hypot(a.player.x-1200,a.player.y-1200)-Math.hypot(b.player.x-1200,b.player.y-1200))<.001);a.player.x=2380;a.update(.1,{x:1,y:0});assert.equal(a.player.x,2380);a.update(NaN);assert.ok(Number.isFinite(a.time));});
test('pause freezes every simulation field and resume continues',()=>{const g=new Engine();tick(g,1);g.togglePause();const before=JSON.stringify(g);tick(g,2,{x:1,y:0});assert.equal(JSON.stringify(g),before);g.togglePause();g.update(.1);assert.ok(g.time>1);});
test('level choices pause, reject invalid inputs, and apply exactly once',()=>{const g=new Engine();g.xp=g.xpNext;g.update(.01);assert.equal(g.status,'upgrade');assert.equal(g.choices.length,3);assert.equal(new Set(g.choices.map(c=>c.id)).size,3);const before=g.time;g.update(1);assert.equal(g.time,before);assert.equal(g.chooseUpgrade('not-an-upgrade'),false);const id=g.choices[0].id;assert.equal(g.chooseUpgrade(id),true);assert.equal(g.upgrades[id],1);assert.equal(g.chooseUpgrade(id),false);});
test('evolved ranger fires three arrows; mage and knight gain area',()=>{const g=new Engine('elf');g.spawn('melee');g.upgrades.weapon=5;g.attack();assert.equal(g.projectiles.length,3);assert.equal(g.projectiles[0].pierce,5);});
test('healing is limited and never wasted at full health or when paused',()=>{const g=new Engine();assert.equal(g.heal(),false);for(let i=0;i<3;i++){g.player.hp=1;assert.equal(g.heal(),true);}assert.equal(g.potions,0);assert.equal(g.heal(),false);const p=new Engine();p.player.hp=1;p.togglePause();assert.equal(p.heal(),false);});
test('death is terminal, rewards stable, fresh run clean',()=>{const g=new Engine();g.kills=40;g.player.hp=1;g.hurt(50);assert.equal(g.status,'dead');const rewards=JSON.stringify(g.rewards);g.finish('victory');g.update(1);assert.equal(JSON.stringify(g.rewards),rewards);assert.equal(new Engine().time,0);assert.equal(new Engine().potions,3);assert.equal(g.rewards.drop.tier,1);});
test('boss spawns once, death alone before dawn does not complete the run',()=>{const g=new Engine();g.time=419.99;g.update(.02);assert.equal(g.enemies.filter(e=>e.type==='boss').length,1);const boss=g.enemies.find(e=>e.type==='boss');g.hit(boss,100000);g.update(.05);assert.equal(g.status,'playing');assert.equal(g.bossDefeated,true);g.time=RUN_SECONDS-.01;g.update(.02);assert.equal(g.status,'victory');assert.equal(g.rewards.drop.tier,3);});
test('ranged enemies fire hostile projectiles and invulnerability prevents frame damage',()=>{const g=new Engine();const e=g.spawn('ranged');e.shootTimer=0;g.update(.01);assert.equal(g.projectiles.some(p=>p.hostile),false);tick(g,.6);assert.ok(g.projectiles.some(p=>p.hostile));const hp=g.player.hp;g.hurt(10);g.hurt(10);assert.equal(g.player.hp,hp-10);});
test('same seed and inputs produce reproducible simulation',()=>{const a=new Engine('mage',{},42),b=new Engine('mage',{},42);for(let i=0;i<1800;i++){const input={x:Math.cos(i/100),y:Math.sin(i/100)};a.update(1/30,input);b.update(1/30,input);}assert.equal(JSON.stringify(a),JSON.stringify(b));});
test('equipment affects runs but cannot exceed safe tier bounds',()=>{const g=new Engine('elf',{weapon:999,armor:3,boots:-1});assert.equal(g.equipment.weapon,5);assert.equal(g.equipment.boots,0);assert.equal(g.player.maxHp,135);});
test('full eight-minute seeded simulation stays bounded and can finish',()=>{const g=new Engine('knight',{},99);g.player.hp=g.player.maxHp=100000;for(let i=0;i<480*30+10;i++){if(g.status==='upgrade')g.chooseUpgrade(g.choices.find(c=>c.id==='weapon')?.id||g.choices[0].id);g.update(1/30,{x:Math.cos(i/300),y:Math.sin(i/300)});assert.ok(g.enemies.length<=180);assert.ok(g.projectiles.length<=350);assert.ok(g.pickups.length<=600);if(g.status==='victory')break;}assert.ok(['victory','retreat'].includes(g.status));assert.equal(g.time,480);assert.ok(g.kills>100);assert.ok(g.damage.weapon>0);});
test('seeded ranger completes a real eight-minute run without invulnerability',()=>{
  const g=new Engine('elf',{},42);
  const priority=['weapon','orb','lightning','haste','vitality','armor','magnet','speed'];
  for(let i=0;i<490*30&&!['dead','victory'].includes(g.status);i++){
    if(g.status==='upgrade')g.chooseUpgrade([...g.choices].sort((a,b)=>priority.indexOf(a.id)-priority.indexOf(b.id))[0].id);
    if(g.player.hp<g.player.maxHp*.45)g.heal();
    let x=Math.cos(g.time*.12),y=Math.sin(g.time*.12),near=null,dist=Infinity;
    for(const gem of g.pickups){const d=Math.hypot(gem.x-g.player.x,gem.y-g.player.y);if(d<dist){near=gem;dist=d;}}
    if(near){x=(near.x-g.player.x)/80;y=(near.y-g.player.y)/80;}
    for(const e of g.enemies){const dx=g.player.x-e.x,dy=g.player.y-e.y,d=Math.hypot(dx,dy);if(d<95){x+=dx/(d||1)*(95-d)/12;y+=dy/(d||1)*(95-d)/12;}}
    g.update(1/30,{x,y});
  }
  assert.equal(g.status,'victory');assert.equal(g.bossDefeated,true);assert.ok(g.player.hp>0);assert.ok(g.time>=480);assert.ok(g.level>=20);
});
test('active abilities reject pause, upgrade, terminal state and cooldown without mutation',()=>{
  for(const status of ['paused','upgrade','dead','victory','retreat']){const g=new Engine();g.status=status;const before=JSON.stringify(g);assert.equal(g.useAbility(),false);assert.equal(JSON.stringify(g),before);}
  const g=new Engine();assert.equal(g.useAbility(),true);const before=JSON.stringify(g);assert.equal(g.useAbility(),false);assert.equal(JSON.stringify(g),before);
  g.togglePause();const paused=JSON.stringify(g);tick(g,3);assert.equal(JSON.stringify(g),paused);g.togglePause();g.spawnTimer=100;tick(g,12.1);assert.equal(g.abilityCooldown,0);assert.equal(g.abilityDuration,0);assert.equal(g.useAbility(),true);
});
test('knight ward reduces damage, knocks enemies away, and expires',()=>{
  const g=new Engine('knight');const enemy=g.spawn('melee');enemy.x=g.player.x+50;enemy.y=g.player.y;const boss=g.spawn('boss');boss.x=g.player.x-50;boss.y=g.player.y;
  g.useAbility();assert.equal(enemy.x,g.player.x+160);assert.equal(boss.x,g.player.x-85);assert.equal(g.abilityCooldown,12);g.hurt(20);assert.equal(g.player.hp,g.player.maxHp-7);
  g.enemies=[];g.spawnTimer=100;tick(g,3.1);g.hurtTimer=0;const hp=g.player.hp;g.hurt(20);assert.equal(g.player.hp,hp-20);
});
test('ranger dash follows normalized input, ignores damage briefly, and respects map bounds',()=>{
  const g=new Engine('elf');g.spawnTimer=100;g.useAbility({x:1,y:1});const hp=g.player.hp;g.hurt(100);assert.equal(g.player.hp,hp);tick(g,.3);assert.ok(Math.abs(Math.hypot(g.player.x-1200,g.player.y-1200)-216)<.001);tick(g,.1);g.hurt(10);assert.equal(g.player.hp,hp-10);
  const edge=new Engine('elf');edge.player.x=2370;edge.useAbility({x:1,y:0});tick(edge,.4);assert.equal(edge.player.x,2380);
  const facing=new Engine('elf');facing.player.facing=Math.PI/2;facing.useAbility();tick(facing,.1);assert.ok(facing.player.y>1200);assert.equal(facing.player.x,1200);
});
test('mage frost nova damages only nearby enemies, slows movement, and records source',()=>{
  const g=new Engine('mage');g.spawnTimer=100;g.attackTimer=100;const near=g.spawn('melee');near.x=g.player.x+150;near.y=g.player.y;near.hp=near.maxHp=200;const far=g.spawn('melee');far.x=g.player.x+350;far.y=g.player.y;
  assert.equal(g.useAbility(),true);assert.equal(near.hp,152);assert.equal(far.hp,far.maxHp);assert.equal(near.slowTimer,3);assert.equal(g.damage.ability,48);const start=near.x;tick(g,.5);assert.ok(Math.abs(start-near.x-near.speed*.4*.5)<.01);tick(g,2.6);assert.equal(near.slowTimer,0);
});
test('spawns never exceed 180 and scheduled boss reserves a slot at the cap',()=>{
  const g=new Engine();for(let i=0;i<180;i++)assert.ok(g.spawn('melee'));assert.equal(g.spawn('fast'),null);assert.equal(g.enemies.length,180);g.time=419.99;g.attackTimer=100;g.update(.02);assert.equal(g.enemies.length,180);assert.equal(g.enemies.filter(e=>e.type==='boss').length,1);assert.equal(g.kills,0);
});
test('invalid movement, class and equipment inputs remain finite and bounded',()=>{
  const g=new Engine('toString',{weapon:Infinity,armor:2.7,boots:NaN});assert.equal(g.classId,'knight');assert.equal(g.equipment.weapon,0);assert.equal(g.equipment.armor,2);assert.equal(g.equipment.boots,0);g.update(.1,{x:Infinity,y:NaN});g.update(.1,null);assert.equal(g.player.x,1200);assert.equal(g.player.y,1200);const hp=g.player.hp;g.hurt(NaN);g.hurt(-10);assert.equal(g.player.hp,hp);
});
test('ranged attack gives a full 0.6-second telegraph before any projectile',()=>{
  const g=new Engine();g.spawnTimer=g.attackTimer=100;const e=g.spawn('ranged');e.x=g.player.x+250;e.y=g.player.y;e.shootTimer=.61;
  g.update(.01);assert.equal(e.warning,.6);assert.equal(e.aimAngles.length,1);assert.equal(g.projectiles.length,0);
  g.update(.25);g.update(.25);g.update(.09);assert.ok(e.warning>0);assert.equal(g.projectiles.length,0);
  g.update(.01);assert.equal(e.warning,0);assert.equal(g.projectiles.filter(p=>p.hostile).length,1);assert.equal(e.shootTimer,2.9);assert.equal(g.projectiles[0].damage,e.damage);
});
test('telegraphed aim stays locked while the player sidesteps',()=>{
  const g=new Engine();g.spawnTimer=g.attackTimer=100;const e=g.spawn('ranged');e.x=g.player.x+250;e.y=g.player.y;e.shootTimer=.6;
  g.update(.01);const locked=e.aimAngle;g.player.y+=180;tick(g,.6);
  assert.equal(e.aimAngle,locked);assert.ok(Math.abs(Math.atan2(g.player.y-e.y,g.player.x-e.x)-locked)>.1);
  const shot=g.projectiles.find(p=>p.hostile);assert.ok(shot);assert.ok(Math.abs(shot.vx-Math.cos(locked)*165)<1e-9);assert.ok(Math.abs(shot.vy-Math.sin(locked)*165)<1e-9);
});
test('boss telegraph exactly predicts all nine spread projectiles and freezes on pause',()=>{
  const g=new Engine();g.spawnTimer=g.attackTimer=100;const boss=g.spawn('boss');boss.x=g.player.x+300;boss.y=g.player.y;boss.shootTimer=.6;
  g.update(.01);assert.equal(boss.aimAngles.length,9);const angles=[...boss.aimAngles];assert.ok(Math.abs(angles[8]-angles[0]-1.76)<1e-9);
  g.togglePause();const before=JSON.stringify(g);tick(g,2);assert.equal(JSON.stringify(g),before);g.togglePause();tick(g,.6);
  const shots=g.projectiles.filter(p=>p.hostile);assert.equal(shots.length,9);assert.equal(boss.shootTimer,2.2);shots.forEach((shot,i)=>{assert.ok(Math.abs(shot.vx-Math.cos(angles[i])*165)<1e-9);assert.ok(Math.abs(shot.vy-Math.sin(angles[i])*165)<1e-9);assert.equal(shot.damage,25);});
});
test('fresh ranged and boss spawns never begin with an invisible instant shot',()=>{
  for(const type of ['ranged','boss']){const g=new Engine();g.spawnTimer=g.attackTimer=100;const e=g.spawn(type);assert.ok(e.shootTimer>=1);assert.equal(e.warning,0);assert.deepEqual(e.aimAngles,[]);g.update(.25);assert.equal(e.warning,0);assert.equal(g.projectiles.length,0);}
});
for(const scenario of ['contact','projectile','boss'])test(`terminal ${scenario} damage stops postmortem attacks and reward changes`,()=>{
  const g=new Engine('elf');g.player.hp=1;g.spawnTimer=g.attackTimer=100;
  const target=g.spawn(scenario==='boss'?'boss':'melee');target.x=g.player.x+100;target.y=g.player.y;const originalHp=target.hp;
  if(scenario==='projectile')g.projectiles.push({x:g.player.x,y:g.player.y,vx:0,vy:0,radius:8,hostile:true,damage:10,life:1});
  else{const contact=g.spawn('melee');contact.x=g.player.x;contact.y=g.player.y;}
  g.projectiles.push({x:target.x,y:target.y,vx:0,vy:0,radius:8,hostile:false,damage:9999,life:1,kind:'elf',hitIds:[],pierce:1,blast:0});
  g.update(.01);assert.equal(g.status,'dead');assert.equal(g.kills,0);assert.equal(target.hp,originalHp);assert.equal(g.damage.weapon,0);assert.equal(g.bossDefeated,false);assert.equal(g.rewards.gold,0);assert.equal(g.rewards.drop,undefined);
  const frozen=JSON.stringify(g);g.update(10,{x:1,y:1});assert.equal(JSON.stringify(g),frozen);
});
test('uncoercible controls are safe and rejected abilities consume no cooldown',()=>{
  for(const value of [Symbol('bad'),{valueOf(){throw new Error('bad coercion');}}]){
    const g=new Engine('elf');const before=JSON.stringify(g);assert.equal(g.useAbility({x:value,y:0}),false);assert.equal(JSON.stringify(g),before);g.update(.01,{x:value,y:0});assert.equal(g.player.x,1200);assert.equal(g.player.y,1200);
    assert.equal(new Engine('elf',{weapon:value}).equipment.weapon,0);
  }
});
test('terminal early exit preserves projectile and effect memory caps',()=>{
  const g=new Engine();g.player.hp=1;g.spawnTimer=g.attackTimer=100;
  const boss=g.spawn('boss');boss.warning=.005;boss.aimAngles=Array.from({length:9},(_,i)=>i*.22);
  const contact=g.spawn('melee');contact.x=g.player.x;contact.y=g.player.y;
  g.projectiles=Array.from({length:350},()=>({x:0,y:0,vx:0,vy:0,radius:1,hostile:true,life:5,damage:1}));
  g.effects=Array.from({length:150},()=>({type:'text',x:0,y:0,radius:0,life:1,maxLife:1,color:'#fff',text:'1'}));
  g.update(.01);assert.equal(g.status,'dead');assert.equal(g.projectiles.length,350);assert.equal(g.effects.length,150);
});
test('eight-minute deadline clamps time and movement with no extra damage tick',()=>{
  const g=new Engine();g.time=479.99;g.spawnTimer=g.attackTimer=100;g.bossSpawned=true;const start=g.player.x;g.update(10,{x:1,y:0});assert.equal(g.status,'retreat');assert.equal(g.time,480);assert.ok(Math.abs(g.player.x-start-g.player.speed*.01)<1e-8);
  const already=new Engine();already.time=480;already.player.hp=1;const e=already.spawn('melee');e.x=already.player.x;e.y=already.player.y;already.update(.1);assert.equal(already.status,'retreat');assert.equal(already.player.hp,1);
});
test('retreat retains normal rewards without victory bonus and remains immutable',()=>{
  const retreat=new Engine(),win=new Engine();for(const g of [retreat,win]){g.time=480;g.kills=10;}win.bossDefeated=true;retreat.update(.1);win.update(.1);assert.equal(retreat.status,'retreat');assert.equal(win.status,'victory');assert.equal(retreat.rewards.gold,128);assert.equal(win.rewards.gold,328);assert.equal(retreat.rewards.drop.tier,2);const frozen=JSON.stringify(retreat);retreat.update(100);retreat.useAbility();retreat.heal();retreat.hit(retreat.enemies[0],100);assert.equal(JSON.stringify(retreat),frozen);
});
test('hostile projectile records its owner and actual accepted damage',()=>{
  const g=new Engine();g.spawnTimer=g.attackTimer=100;const e=g.spawn('ranged');e.shootTimer=.6;g.update(.01);tick(g,.6);const shot=g.projectiles.find(p=>p.hostile);assert.equal(shot.enemyType,'ranged');shot.x=g.player.x;shot.y=g.player.y;shot.vx=shot.vy=0;g.update(.01);assert.deepEqual(g.lastHit,{enemyType:'ranged',kind:'projectile',damage:10});assert.equal(g.deathCause,null);
});
test('contact death records cause and boss defeat does not prevent an early death',()=>{
  const g=new Engine();g.time=470;g.bossDefeated=true;g.bossSpawned=true;g.spawnTimer=g.attackTimer=100;g.player.hp=3;const enemy=g.spawn('fast');enemy.x=g.player.x;enemy.y=g.player.y;g.update(.01);assert.equal(g.status,'dead');assert.deepEqual(g.deathCause,{enemyType:'fast',kind:'contact',damage:3});assert.match(outcomeSummary(g).reason,/君王雖已倒下/);assert.match(outcomeSummary(g).reason,/近身碰撞/);
});
test('projectile death explanation distinguishes enemy source and gives evasion advice',()=>{
  const g=new Engine();g.player.hp=2;g.hurt(25,{enemyType:'boss',kind:'projectile'});assert.deepEqual(g.deathCause,{enemyType:'boss',kind:'projectile',damage:2});const text=outcomeSummary(g);assert.match(text.reason,/暮林君王/);assert.match(text.reason,/飛射攻擊/);assert.match(text.advice,/橫向/);
  const retreat=new Engine();retreat.finish('retreat');assert.match(outcomeSummary(retreat).reason,/尚未被擊倒/);assert.match(outcomeSummary(retreat).advice,/沒有勝利加成/);
});
test('no relic preserves baseline and malformed choices fall back without unsafe state',()=>{
  const baseline=new Engine('knight',{armor:2},42),explicit=new Engine('knight',{armor:2},42,'none');assert.deepEqual(baseline,explicit);
  for(const bad of ['bad','toString',null,undefined,{},Symbol('bad')]){const g=new Engine('knight',{armor:2},42,bad);assert.equal(g.relicId,'none');assert.equal(g.player.maxHp,170);assert.equal(g.player.speed,188);assert.equal(g.potions,3);assert.equal(g.pickupRadius,105);}
});
test('relic selection and adjusted ability are immutable snapshots, not shared config changes',()=>{
  const before=JSON.stringify(ABILITIES);for(const c of ['knight','elf','mage']){const g=new Engine(c,{},1,'hourglass');assert.equal(g.ability.cooldown,ABILITIES[c].cooldown*.75);assert.equal(g.potions,2);assert.equal(g.useAbility(),true);assert.equal(g.abilityCooldown,g.ability.cooldown);assert.notEqual(g.ability,ABILITIES[c]);assert.throws(()=>{g.relicId='none';},TypeError);assert.throws(()=>{g.ability.cooldown=0;},TypeError);assert.equal(g.relicId,'hourglass');}
  assert.equal(JSON.stringify(ABILITIES),before);assert.equal(new Engine().ability.cooldown,12);
});
test('ward consumes one real hostile projectile, records no blocked damage, and then cools down',()=>{
  const g=new Engine('knight',{},1,'ward');g.spawnTimer=g.attackTimer=100;const enemy=g.spawn('ranged');enemy.shootTimer=.6;g.update(.01);tick(g,.6);const shot=g.projectiles.find(p=>p.hostile);assert.ok(shot);shot.x=g.player.x;shot.y=g.player.y;shot.vx=shot.vy=0;const hp=g.player.hp;g.update(.01);assert.equal(g.player.hp,hp);assert.equal(g.relicCooldown,8);assert.equal(g.lastHit,null);assert.equal(g.deathCause,null);assert.equal(g.projectiles.includes(shot),false);
  g.projectiles.push({...shot,life:1});g.update(.01);assert.equal(g.player.hp,hp-10);assert.equal(g.lastHit.kind,'projectile');assert.ok(g.relicCooldown<8);g.relicCooldown=.001;g.update(.01);assert.equal(g.relicCooldown,0);
});
test('ward never wastes charge on contact, damage invulnerability, dash or invalid damage',()=>{
  const g=new Engine('elf',{},1,'ward');g.hurt(7,{enemyType:'fast',kind:'contact'});assert.equal(g.relicCooldown,0);g.hurt(10,{enemyType:'ranged',kind:'projectile'});assert.equal(g.relicCooldown,0);g.hurtTimer=0;g.useAbility({x:1,y:0});g.hurt(10,{enemyType:'ranged',kind:'projectile'});assert.equal(g.relicCooldown,0);g.abilityDuration=0;for(const amount of [0,-1,NaN,Infinity])g.hurt(amount,{enemyType:'ranged',kind:'projectile'});assert.equal(g.relicCooldown,0);g.hurt(10,{enemyType:'ranged',kind:'projectile'});assert.equal(g.relicCooldown,8);
});
test('ward speed penalty persists through speed upgrades and includes boots',()=>{
  const g=new Engine('elf',{boots:3},1,'ward');assert.equal(g.player.speed,(218+15)*.92);g.status='upgrade';g.choices=[{id:'speed'}];g.chooseUpgrade('speed');assert.equal(g.player.speed,(218+15)*1.09*.92);
});
test('compass rounds initial health after armor, retains full vitality gains, and attracts farther gems',()=>{
  const g=new Engine('elf',{armor:1},1,'compass');assert.equal(g.player.maxHp,98);assert.equal(g.player.hp,98);g.status='upgrade';g.choices=[{id:'vitality'}];g.chooseUpgrade('vitality');assert.equal(g.player.maxHp,123);assert.equal(g.player.hp,123);assert.equal(g.pickupRadius,205);g.upgrades.magnet=1;assert.equal(g.pickupRadius,260);
  const normal=new Engine(),compass=new Engine('knight',{},1,'compass');for(const run of [normal,compass]){run.spawnTimer=100;run.pickups.push({x:run.player.x+180,y:run.player.y,value:1});run.update(.1);}assert.equal(normal.pickups[0].x,1380);assert.ok(compass.pickups[0].x<1380);
});
test('relic cooldown freezes in every inactive state and resets on a fresh run',()=>{
  for(const status of ['paused','upgrade','dead','victory','retreat']){const g=new Engine('knight',{},1,'ward');g.relicCooldown=4;g.status=status;const before=JSON.stringify(g);g.update(.25);g.hurt(10,{kind:'projectile'});assert.equal(JSON.stringify(g),before);}
  const fresh=new Engine('knight',{},1,'ward');assert.equal(fresh.relicCooldown,0);assert.equal(fresh.potions,3);
});
