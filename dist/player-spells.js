/** Deterministic ECS player spell cadence; no DOM or rendering dependencies.
 * Called once per Engine.step after spawning and before enemy movement.
 * Attack / orb / lightning order intentionally matches the legacy engine.
 */
import {lightningInterval,orbRange,lightningTargets} from './spell-combos.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function stepPlayerSpells(game,dt){
  const p=game.player;
  const spells=game.ecs.getComponent(game.playerEntityId,'spells');
    spells.attackTimer-=dt;if(spells.attackTimer<=0){spells.attackTimer=(game.classId==='knight'?.72:game.classId==='elf'?.65:1.05)*Math.pow(.88,game.upgrades.haste);game.attack();}
    spells.orbTimer-=dt;if(game.upgrades.orb&&spells.orbTimer<=0){spells.orbTimer=.5;const range=orbRange(game.upgrades,game.relicId);game.effect('orb',p.x,p.y,range,'#83d8d0');for(const e of game.enemies)if(distance(p,e)<range+e.radius)game.hit(e,5+game.upgrades.orb*5,'orb');}
    spells.lightningTimer-=dt;
    if(game.upgrades.lightning&&spells.lightningTimer<=0){
      spells.lightningTimer=lightningInterval(game.upgrades);
      const baseCap=lightningTargets(game.upgrades),cap=lightningTargets(game.upgrades,game.relicId);
      const targets=game.enemies.filter(e=>e.hp>0&&distance(p,e)<600).sort((a,b)=>distance(p,a)-distance(p,b)).slice(0,cap);
      const metrics=game.spellMetrics;
      metrics.lightningCasts++;
      if(cap>baseCap)metrics.thunderEchoEligibleCasts++;
      let triggered=false;
      for(const [index,e] of targets.entries()){
        const before=game.damage.lightning;
        game.hit(e,22+game.upgrades.lightning*12,'lightning');
        const actual=game.damage.lightning-before;
        const bonusHit=index>=baseCap&&actual>0;
        // Reuse the existing effect slot/lifetime; only an actual bonus hit is highlighted.
        game.effect(bonusHit?'lightningEcho':'lightning',e.x,e.y,30,bonusHit?'#ffd45c':'#9cbbff');
        if(bonusHit){triggered=true;metrics.thunderEchoExtraHits++;metrics.thunderEchoExtraDamage+=actual;}
      }
      if(triggered)metrics.thunderEchoTriggeredCasts++;
    }
}

/** Duration is consumed after damage, projectiles and collisions for the step.
 * The elf dash / knight shield therefore remain active through the final step.
 */
export function stepPlayerAbilityTimers(game,dt){
  const ability=game.ecs.getComponent(game.playerEntityId,'ability');
  ability.cooldown=Math.max(0,ability.cooldown-dt);
  ability.duration=Math.max(0,ability.duration-dt);
}
