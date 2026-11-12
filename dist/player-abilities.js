/** Deterministic player ability casting with ECS-owned cooldown and duration.
 * Invoked by Engine.useAbility; retain legacy status gates and effect order.
 * No browser, rendering, or external dependencies.
 */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const axis=value=>{try{const n=Number(value);return Number.isFinite(n)?clamp(n,-1e6,1e6):0;}catch{return 0;}};

export function castPlayerAbility(game,input={x:0,y:0}){
    const state=game.ecs.getComponent(game.playerEntityId,'ability');
    if(game.status!=='playing'||state.cooldown>0)return false;
    let inputX,inputY;try{inputX=Number(input?.x??0);inputY=Number(input?.y??0);}catch{return false;}
    const p=game.player;
    state.cooldown=game.ability.cooldown;state.duration=game.ability.duration;
    if(game.classId==='knight'){
      for(const e of game.enemies){if(e.hp<=0)continue;const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);if(d<165+e.radius){const angle=d?Math.atan2(dy,dx):p.facing;const push=e.type==='boss'?35:110;e.x=clamp(e.x+Math.cos(angle)*push,15,2385);e.y=clamp(e.y+Math.sin(angle)*push,15,2385);}}
      game.effect('ward',p.x,p.y,165,game.ability.color);
    }else if(game.classId==='elf'){
      const x=axis(inputX),y=axis(inputY),length=Math.hypot(x,y);
      state.dashDirection=length?{x:x/length,y:y/length}:{x:Math.cos(p.facing),y:Math.sin(p.facing)};
      game.effect('dash',p.x,p.y,48,game.ability.color);
    }else{
      for(const e of game.enemies){if(e.hp>0&&distance(p,e)<190+e.radius){e.slowTimer=3;game.hit(e,45+game.level*3,'ability');}}
      game.effect('frost',p.x,p.y,190,game.ability.color);
    }
    return true;
  }
