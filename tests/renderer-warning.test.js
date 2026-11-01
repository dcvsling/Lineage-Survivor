import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../dist/renderer.js';
import {Engine} from '../dist/engine.js';

test('portrait viewport retains active warning rays from offscreen shooters',()=>{
 const prior={window:globalThis.window,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 try{
  globalThis.window={addEventListener(){}};globalThis.innerWidth=390;globalThis.innerHeight=844;
  const ctx=new Proxy({}, {get:(target,key)=>key in target?target[key]:(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  const renderer=new Renderer({getContext:()=>ctx}),game=new Engine('elf');
  const boss=game.spawn('boss');
  // Portrait half-width is 162.5 world units. The old center-only cull threshold
  // was 262.5: this shooter's 370-unit leftward warning crosses the entire player.
  boss.x=game.player.x+300;boss.y=game.player.y;boss.warning=.3;
  boss.aimAngle=Math.PI;boss.aimAngles=[Math.PI];
  const near=game.spawn('ranged');near.x=game.player.x+80;near.y=game.player.y;
  near.warning=.3;near.aimAngle=Math.PI;near.aimAngles=[Math.PI];
  const idle=game.spawn('ranged');idle.x=game.player.x+40;idle.y=game.player.y;idle.warning=0;
  const drawn=[];renderer.telegraph=enemy=>drawn.push(enemy.id);
  renderer.render(game,1);
  assert.deepEqual(drawn,[boss.id,near.id],'active offscreen and onscreen warnings render, idle shooters do not');
 }finally{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
