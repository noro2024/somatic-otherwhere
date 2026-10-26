import type { Point } from './model.ts';
export class VisualStateController {
  enabled = true;
  strength = 1;
  amount = 0;
  speed = .5;
  recovery = .5;
  memory = 0;
  chaos = .8;
  setSeed(value:number){this.seed=value>>>0;}
  private remaining = 0;
  private target = 0;
  private recovering = true;
  private seed = 37;
  private random() { this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296; }
  reset(){this.amount=0;this.target=0;this.remaining=0;this.recovering=true;this.seed=37;}
  recover(instant=false){this.target=0;this.remaining=2.5;this.recovering=true;if(instant)this.amount=0;}
  step(dt:number){
    if(!this.enabled){this.amount=0;this.remaining=0;return;}
    this.remaining-=Math.max(0,dt);
    if(this.remaining<=0){
      this.recovering=!this.recovering;
      this.target=this.recovering?0:.75+this.random()*.25;
      this.remaining=this.recovering?2+this.random()*3:(7+this.random()*9)*(1.5-this.recovery);
    }
    const target=Math.min(1,this.target*this.strength*(1+this.memory*.2));
    this.amount+=(target-this.amount)*(1-Math.exp(-Math.max(0,dt)*(this.recovering?3:(.4+this.speed*1.6))));
    if(target===0&&this.amount<.001)this.amount=0;
  }
}
// A continuous display-only deformation. amount=0 is exactly the latest baseline.
export function deform(p:Point,origin:Point,amount:number,time:number,variant=0):Point{
  if(amount===0)return {...p};
  const x=p.x-origin.x,y=p.y-origin.y,z=p.z-origin.z;
  const angle=amount*(y*30+Math.sin(time*.37)*2+variant*1.3);
  const c=Math.cos(angle),s=Math.sin(angle),blend=amount*amount;
  const u=x*32+y*25+z*18, v=y*31-x*14+variant*.3;
  const radius=.12+.09*Math.sin(v*1.7+time*.31)+.045*Math.cos(u*2-time*.2);
  const alien={x:radius*Math.cos(u+time*.23)+.07*Math.sin(v*2.3-time*.3),y:radius*Math.sin(u*1.4-time*.19)+.07*Math.cos(v+time*.27),z:.19*Math.sin(v+time*.21)*Math.cos(u*.7)+.05*Math.sin(u*3-time*.4)};
  return {x:origin.x+(x*c-z*s)*(1-blend)+alien.x*blend,y:origin.y+y*(1-blend)+alien.y*blend,z:origin.z+(x*s+z*c)*(1-blend)+alien.z*blend};
}
