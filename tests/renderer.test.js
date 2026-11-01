import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../dist/renderer.js';
import {Engine} from '../dist/engine.js';
// Canvas-call smoke coverage, not a substitute for visual/device QA.
test('renderer supports narrow/wide screens and every enemy, warning and evolution without non-finite drawing',()=>{
 const prior={window:globalThis.window,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 try{globalThis.window={addEventListener(){}};for(const width of [390,1188]){
  globalThis.innerWidth=width;globalThis.innerHeight=750;let calls=0;
  const ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];return (...args)=>{calls++;for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),String(key));};},set(target,key,value){target[key]=value;return true;}});
  const canvas={getContext:()=>ctx};const renderer=new Renderer(canvas);
  for(const classId of ['knight','elf','mage']){const g=new Engine(classId);g.upgrades.weapon=5;g.upgrades.orb=5;g.abilityDuration=.2;g.hurtTimer=.2;
   for(const type of ['melee','fast','ranged','boss']){const e=g.spawn(type);e.x=g.player.x+40;e.y=g.player.y+50;e.hp/=2;e.hit=.1;e.slowTimer=1;if(['ranged','boss'].includes(type)){e.warning=.3;e.aimAngle=.5;e.aimAngles=type==='boss'?Array.from({length:9},(_,i)=>.5+(i-4)*.22):[.5];}}
   renderer.render(g,1);renderer.render(g,1.2);
  }
  renderer.render(null,1);assert.ok(calls>100);assert.equal(canvas.width,Math.ceil(width/2));
 }}finally{for(const[k,v]of Object.entries(prior)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
