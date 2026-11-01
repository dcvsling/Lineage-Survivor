import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine, CLASSES, RUN_SECONDS} from '../dist/engine.js';
const tick=(g,seconds,input={x:0,y:0})=>{for(let i=0;i<seconds*30;i++)g.update(1/30,input);};
test('three classes have distinct durability, movement, and attacks',()=>{for(const id of Object.keys(CLASSES)){const g=new Engine(id);const enemy=g.spawn('melee');enemy.x=g.player.x+60;enemy.y=g.player.y;g.attack();if(id==='knight')assert.ok(enemy.hp<enemy.maxHp);else assert.equal(g.projectiles[0].kind,id);}assert.ok(new Engine('knight').player.hp>new Engine('elf').player.hp);assert.ok(new Engine('elf').player.speed>new Engine('mage').player.speed);});
test('movement normalized and clamped; invalid delta does not corrupt state',()=>{const a=new Engine(),b=new Engine();a.spawnTimer=b.spawnTimer=100;tick(a,1,{x:1,y:0});tick(b,1,{x:1,y:1});assert.ok(Math.abs(Math.hypot(a.player.x-1200,a.player.y-1200)-Math.hypot(b.player.x-1200,b.player.y-1200))<.001);a.player.x=2380;a.update(.1,{x:1,y:0});assert.equal(a.player.x,2380);a.update(NaN);assert.ok(Number.isFinite(a.time));});
test('pause freezes every simulation field and resume continues',()=>{const g=new Engine();tick(g,1);g.togglePause();const before=JSON.stringify(g);tick(g,2,{x:1,y:0});assert.equal(JSON.stringify(g),before);g.togglePause();g.update(.1);assert.ok(g.time>1);});
test('level choices pause, reject invalid inputs, and apply exactly once',()=>{const g=new Engine();g.xp=g.xpNext;g.update(.01);assert.equal(g.status,'upgrade');assert.equal(g.choices.length,3);assert.equal(new Set(g.choices.map(c=>c.id)).size,3);const before=g.time;g.update(1);assert.equal(g.time,before);assert.equal(g.chooseUpgrade('not-an-upgrade'),false);const id=g.choices[0].id;assert.equal(g.chooseUpgrade(id),true);assert.equal(g.upgrades[id],1);assert.equal(g.chooseUpgrade(id),false);});
test('evolved ranger fires three arrows; mage and knight gain area',()=>{const g=new Engine('elf');g.spawn('melee');g.upgrades.weapon=5;g.attack();assert.equal(g.projectiles.length,3);assert.equal(g.projectiles[0].pierce,5);});
test('healing is limited and never wasted at full health or when paused',()=>{const g=new Engine();assert.equal(g.heal(),false);for(let i=0;i<3;i++){g.player.hp=1;assert.equal(g.heal(),true);}assert.equal(g.potions,0);assert.equal(g.heal(),false);const p=new Engine();p.player.hp=1;p.togglePause();assert.equal(p.heal(),false);});
test('death is terminal, rewards stable, fresh run clean',()=>{const g=new Engine();g.kills=40;g.player.hp=1;g.hurt(50);assert.equal(g.status,'dead');const rewards=JSON.stringify(g.rewards);g.finish('victory');g.update(1);assert.equal(JSON.stringify(g.rewards),rewards);assert.equal(new Engine().time,0);assert.equal(new Engine().potions,3);assert.equal(g.rewards.drop.tier,1);});
test('boss spawns once, death alone before dawn does not complete the run',()=>{const g=new Engine();g.time=419.99;g.update(.02);assert.equal(g.enemies.filter(e=>e.type==='boss').length,1);const boss=g.enemies.find(e=>e.type==='boss');g.hit(boss,100000);g.update(.05);assert.equal(g.status,'playing');assert.equal(g.bossDefeated,true);g.time=RUN_SECONDS-.01;g.update(.02);assert.equal(g.status,'victory');assert.equal(g.rewards.drop.tier,3);});
test('ranged enemies fire hostile projectiles and invulnerability prevents frame damage',()=>{const g=new Engine();const e=g.spawn('ranged');e.shootTimer=0;g.update(.01);assert.ok(g.projectiles.some(p=>p.hostile));const hp=g.player.hp;g.hurt(10);g.hurt(10);assert.equal(g.player.hp,hp-10);});
test('same seed and inputs produce reproducible simulation',()=>{const a=new Engine('mage',{},42),b=new Engine('mage',{},42);for(let i=0;i<1800;i++){const input={x:Math.cos(i/100),y:Math.sin(i/100)};a.update(1/30,input);b.update(1/30,input);}assert.equal(JSON.stringify(a),JSON.stringify(b));});
test('equipment affects runs but cannot exceed safe tier bounds',()=>{const g=new Engine('elf',{weapon:999,armor:3,boots:-1});assert.equal(g.equipment.weapon,5);assert.equal(g.equipment.boots,0);assert.equal(g.player.maxHp,135);});
test('full eight-minute seeded simulation stays bounded and can finish',()=>{const g=new Engine('knight',{},99);g.player.hp=g.player.maxHp=100000;for(let i=0;i<480*30+10;i++){if(g.status==='upgrade')g.chooseUpgrade(g.choices.find(c=>c.id==='weapon')?.id||g.choices[0].id);g.update(1/30,{x:Math.cos(i/300),y:Math.sin(i/300)});assert.ok(g.enemies.length<=180);assert.ok(g.projectiles.length<=350);assert.ok(g.pickups.length<=600);if(g.status==='victory')break;}if(!g.bossDefeated){for(const b of g.enemies.filter(e=>e.type==='boss'))g.hit(b,100000);g.update(.1);}assert.equal(g.status,'victory');assert.ok(g.kills>100);assert.ok(g.damage.weapon>0);});
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
  for(const status of ['paused','upgrade','dead','victory']){const g=new Engine();g.status=status;const before=JSON.stringify(g);assert.equal(g.useAbility(),false);assert.equal(JSON.stringify(g),before);}
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
