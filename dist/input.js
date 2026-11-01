/** Single-owner pointer state. Secondary touches cannot steal or cancel movement. */
export class JoystickState {
 constructor(){this.reset();}
 reset(){this.pointerId=null;this.x=0;this.y=0;this.dx=0;this.dy=0;}
 begin(id,clientX,clientY,rect,knobWidth=42){if(this.pointerId!==null)return false;this.pointerId=id;return this.move(id,clientX,clientY,rect,knobWidth);}
 move(id,clientX,clientY,rect,knobWidth=42){
  if(this.pointerId!==id)return false;
  const radius=Math.max(10,(rect.width-knobWidth)/2);let dx=clientX-rect.left-rect.width/2,dy=clientY-rect.top-rect.height/2;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)){this.reset();return false;}
  const scale=Math.max(1,Math.hypot(dx,dy)/radius);this.dx=dx/scale;this.dy=dy/scale;this.x=this.dx/radius;this.y=this.dy/radius;return true;
 }
 end(id){if(this.pointerId!==id)return false;this.reset();return true;}
}
export function acceptsGameplayKey({status,modalOpen,targetTag,key}){
 return status==='playing'&&!modalOpen&&!['INPUT','TEXTAREA','SELECT'].includes(targetTag)&&!(targetTag==='BUTTON'&&key===' ');
}
