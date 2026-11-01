// All art is generated from original geometric pixel primitives. No third-party assets.
export class Renderer {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.resize();window.addEventListener('resize',()=>this.resize());this.trees=Array.from({length:220},(_,i)=>({x:(Math.sin(i*731+3)*.5+.5)*2400,y:(Math.cos(i*337+1)*.5+.5)*2400,s:0.7+(i%5)*.16}));}
 resize(){this.w=innerWidth;this.h=innerHeight;this.canvas.width=Math.ceil(this.w/2);this.canvas.height=Math.ceil(this.h/2);this.ctx.imageSmoothingEnabled=false;}
 render(game,t){const c=this.ctx,w=this.canvas.width,h=this.canvas.height;const p=game?.player||{x:1070+Math.sin(t*.03)*100,y:1100};const scale=innerWidth<700?.6:.72;const cx=p.x,cy=p.y;c.setTransform(1,0,0,1,0,0);c.fillStyle='#14251c';c.fillRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(scale,scale);c.translate(-cx,-cy);
 const rx=w/scale/2+100,ry=h/scale/2+100;for(let x=Math.floor((cx-rx)/40)*40;x<cx+rx;x+=40)for(let y=Math.floor((cy-ry)/40)*40;y<cy+ry;y+=40){const n=Math.abs(Math.sin(x*12.98+y*78.23));c.fillStyle=n>.7?'#1b3022':'#182b20';c.fillRect(x,y,39,39);if(n>.8){c.fillStyle='#345039';c.fillRect(x+7,y+15,2,5);c.fillRect(x+10,y+12,2,7);}if(n<.09){c.fillStyle='#344438';c.fillRect(x+13,y+20,9,5);c.fillStyle='#435043';c.fillRect(x+15,y+18,5,2);}}
 // Ancient road and ruined ritual stones.
 c.fillStyle='#554f361e';c.fillRect(1120,0,90,2400);c.fillRect(0,1160,2400,70);for(let i=0;i<14;i++){let a=i*Math.PI/7;const x=1200+Math.cos(a)*180,y=1200+Math.sin(a)*180;c.fillStyle='#3c493f';c.fillRect(x-6,y-12,12,22);c.fillStyle='#64705a';c.fillRect(x-5,y-12,10,3);c.fillStyle='#a0b68655';c.fillRect(x-1,y-7,2,8);}
 c.strokeStyle='#9d795544';c.lineWidth=5;c.strokeRect(5,5,2390,2390);
 for(const tree of this.trees)if(Math.abs(tree.x-cx)<rx&&Math.abs(tree.y-cy)<ry)this.tree(tree.x,tree.y,tree.s);
 for(const enemy of game?.enemies||[])if(enemy.warning>0&&Math.abs(enemy.x-cx)<rx&&Math.abs(enemy.y-cy)<ry)this.telegraph(enemy);
 for(const item of game?.pickups||[]){c.fillStyle='#75deb2';c.beginPath();c.moveTo(item.x,item.y-4);c.lineTo(item.x+3,item.y);c.lineTo(item.x,item.y+5);c.lineTo(item.x-3,item.y);c.fill();}
 const chars=[...(game?.enemies||[]).map(e=>({...e,enemy:true})),{...p,type:game?.classId||'knight',hero:true,hit:game?.hurtTimer||0,evolved:game?.upgrades?.weapon>=5}].sort((a,b)=>a.y-b.y);for(const q of chars){if(Math.abs(q.x-cx)>rx||Math.abs(q.y-cy)>ry)continue;this.character(q,t);}
 if(game?.abilityDuration>0){c.strokeStyle=game.ability.color;c.lineWidth=3;c.globalAlpha=.65;c.beginPath();c.arc(p.x,p.y,game.classId==='knight'?32:22,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
 for(const b of game?.projectiles||[]){c.fillStyle=b.color||(b.hostile?'#f79872':'#dce0a3');c.beginPath();c.arc(b.x,b.y,b.radius||3,0,Math.PI*2);c.fill();}
 for(const e of game?.effects||[]){c.globalAlpha=Math.min(1,e.life*3);c.strokeStyle=e.color||'#d2bb78';c.fillStyle=e.color||'#d2bb78';if(e.text){c.font='bold 10px Arial';c.textAlign='center';c.fillText(e.text,e.x,e.y);}else{c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,e.radius||25,0,Math.PI*2);c.stroke();if(e.type==='lightning'){c.beginPath();c.moveTo(e.x-10,e.y-80);c.lineTo(e.x+5,e.y-40);c.lineTo(e.x-4,e.y-33);c.lineTo(e.x,e.y);c.stroke();}}c.globalAlpha=1;}
 if(game?.upgrades?.orb){const evolved=game.upgrades.orb>=5,count=evolved?4:2;for(let i=0;i<count;i++){const a=t*2+i*Math.PI*2/count,x=p.x+Math.cos(a)*(evolved?100:65),y=p.y+Math.sin(a)*(evolved?100:65);c.fillStyle='#b7d9ab';c.fillRect(x-4,y-4,8,8);c.strokeStyle='#b7d9ab44';c.strokeRect(x-7,y-7,14,14);}}
 c.restore();for(let i=0;i<22;i++){let x=(i*137+Math.sin(t*.35+i)*27)%w,y=(i*83+t*3)%h;c.fillStyle=i%2?'#d7bf713e':'#bce6c235';c.fillRect(x,y,1,1);}if(game&&p.hp/p.maxHp<.3){c.fillStyle='#9a21151a';c.fillRect(0,0,w,h);}}
 tree(x,y,s){const c=this.ctx;c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='#09170c55';c.beginPath();c.ellipse(7,10,28,10,0,0,7);c.fill();c.fillStyle='#554232';c.fillRect(-4,-23,8,33);c.fillStyle='#112117';c.fillRect(-24,-49,48,22);c.fillRect(-18,-63,36,18);c.fillRect(-12,-75,24,15);c.fillStyle='#213a27';c.fillRect(-23,-48,20,6);c.fillRect(-17,-61,18,5);c.fillRect(-10,-73,14,5);c.fillStyle='#30472c';c.fillRect(-17,-47,10,2);c.fillRect(-7,-72,8,2);c.restore();}
 telegraph(enemy){
  // These rays use the simulation's locked shot angles, not a guessed target.
  const c=this.ctx,charge=1-Math.min(1,enemy.warning/.6),boss=enemy.type==='boss';
  c.save();c.translate(enemy.x,enemy.y);c.strokeStyle=boss?'#efaf74':'#e8a672';
  c.globalAlpha=.22+charge*.3;c.lineWidth=1.5;c.setLineDash([7,7]);
  for(const angle of enemy.aimAngles||[enemy.aimAngle||0]){c.beginPath();c.moveTo(Math.cos(angle)*18,Math.sin(angle)*18);c.lineTo(Math.cos(angle)*(boss?370:280),Math.sin(angle)*(boss?370:280));c.stroke();}
  c.setLineDash([]);c.lineWidth=2;c.globalAlpha=.65;c.beginPath();c.arc(0,0,(enemy.radius||13)+7,-Math.PI/2,-Math.PI/2+charge*Math.PI*2);c.stroke();c.restore();
 }
 character(q,t){
  const c=this.ctx,boss=q.type==='boss',flash=q.hit>0&&(!q.hero||Math.floor(t*16)%2===0);
  c.save();c.translate(Math.round(q.x),Math.round(q.y));if(boss)c.scale(2,2);
  c.fillStyle='#02080577';c.beginPath();c.ellipse(0,5,q.type==='fast'?15:12,5,0,0,7);c.fill();
  c.translate(0,Math.sin(t*(q.type==='fast'?15:8)+q.x));
  const color=flash?'#eee4c7':q.slowTimer>0?'#8ec6da':q.hero?(q.type==='mage'?'#9b85c0':q.type==='elf'?'#91b673':'#a3b7be'):(boss?'#9b6b48':q.type==='ranged'?'#94739f':q.type==='fast'?'#b69368':'#6d8a57');
  if(q.type==='fast'&&!q.hero){
   // Low, long-bodied dusk hound: recognizably unlike upright infantry.
   c.fillStyle='#42392b';const stride=Math.sin(t*15+q.x)>0?2:-2;
   c.fillRect(-12,-1,3,8+stride);c.fillRect(6,-1,3,8-stride);c.fillRect(-3,0,3,6-stride);c.fillRect(12,-1,3,7+stride);
   c.fillStyle=color;c.fillRect(-11,-10,22,10);c.fillRect(7,-15,12,11);c.fillRect(16,-8,6,5);c.fillRect(-16,-14,7,4);
   c.fillStyle='#554332';c.fillRect(8,-20,4,7);c.fillRect(15,-19,3,6);c.fillStyle='#f0c16b';c.fillRect(15,-12,3,2);c.fillStyle='#ead9af';c.fillRect(19,-3,2,3);
  }else if(q.type==='ranged'&&!q.hero){
   // Hooded caster, tapering robe and visibly charged staff.
   c.fillStyle='#352b40';c.fillRect(-9,-9,18,13);c.fillRect(-12,2,24,4);
   c.fillStyle=color;c.fillRect(-7,-17,14,20);c.fillRect(-5,-25,10,9);c.fillRect(-8,-22,16,8);
   c.fillStyle='#141c22';c.fillRect(-4,-19,8,7);c.fillStyle='#e5a37b';c.fillRect(-3,-17,2,2);c.fillRect(2,-17,2,2);
   c.fillStyle='#887057';c.fillRect(14,-22,2,29);c.fillStyle=q.warning>0?'#ffd08d':'#c59fd3';c.fillRect(11,-26,8,7);c.fillStyle='#baa58b';c.fillRect(10,-8,5,3);
  }else{
   c.fillStyle='#293126';c.fillRect(-6,0,4,7);c.fillRect(2,0,4,7);
   c.fillStyle=color;c.fillRect(-7,-12,14,14);c.fillRect(-10,-10,4,10);c.fillRect(6,-10,4,10);
   c.fillStyle=q.hero?'#d1b99a':boss?'#a39479':'#93ab6d';c.fillRect(-5,-21,10,9);
   c.fillStyle=color;c.fillRect(-6,-22,12,5);c.fillStyle='#151b14';c.fillRect(-3,-16,2,2);c.fillRect(2,-16,2,2);
   if(q.hero){
    c.fillStyle=q.evolved?'#fff0ac':'#d8c57c';
    if(q.type==='knight'){c.fillRect(11,-22,3,22);c.fillRect(8,-5,9,3);c.fillStyle=q.evolved?'#e2c479':'#647f88';c.fillRect(-14,-11,6,13);}
    else if(q.type==='elf'){c.strokeStyle=q.evolved?'#fff0ac':'#dfbc7d';c.beginPath();c.arc(11,-10,11,-1.5,1.5);c.stroke();}
    else{c.fillRect(12,-22,2,29);c.fillStyle=q.evolved?'#f3d2ff':'#c5a8e7';c.fillRect(9,-25,8,7);}
   }else if(boss){
    // Broad shoulder plates, amber mantle and branching antlers.
    c.fillStyle='#45302d';c.fillRect(-11,-10,22,17);c.fillStyle=color;c.fillRect(-8,-13,16,16);
    c.fillStyle='#c0a873';c.fillRect(-14,-15,8,6);c.fillRect(6,-15,8,6);c.fillRect(-2,-13,4,14);
    c.fillStyle='#d3ba77';c.fillRect(-10,-33,3,14);c.fillRect(7,-33,3,14);c.fillRect(-15,-31,5,3);c.fillRect(10,-31,5,3);c.fillRect(-15,-36,2,6);c.fillRect(13,-36,2,6);c.fillRect(-11,-26,6,3);c.fillRect(5,-26,6,3);
    c.fillStyle='#f1b873';c.fillRect(-4,-17,2,2);c.fillRect(2,-17,2,2);c.fillStyle='#a48a67';c.fillRect(16,-20,3,27);c.fillRect(11,-21,11,5);
   }else{
    // Long ears, leather vest and club distinguish the melee goblin.
    c.fillStyle=color;c.fillRect(-10,-20,5,4);c.fillRect(5,-20,5,4);c.fillStyle='#544e36';c.fillRect(-5,-10,10,9);c.fillStyle='#8b7150';c.fillRect(12,-12,3,14);c.fillRect(10,-17,7,7);c.fillStyle='#d0c18e';c.fillRect(-3,-13,2,2);c.fillRect(2,-13,2,2);
   }
  }
  if(q.hero){c.strokeStyle=q.evolved?'#f0d58c':'#b9d2b288';c.lineWidth=1;c.beginPath();c.ellipse(0,8,13,4,0,0,Math.PI*2);c.stroke();}
  if(!q.hero&&q.hp<q.maxHp){const y=boss?-43:q.type==='ranged'?-33:q.type==='fast'?-26:-30;c.fillStyle='#261916';c.fillRect(-10,y,20,2);c.fillStyle='#b87359';c.fillRect(-10,y,20*Math.max(0,q.hp/q.maxHp),2);}
  c.restore();
 }
}
