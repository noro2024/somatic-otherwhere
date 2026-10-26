import { distance, type Frame, type Point } from './model.ts';
export type MotionFeatures={presence:number; fingerBends:number[]; fingerSpeeds:number[]; jointMotion:number; speed:number; openness:number; rotation:number; memory:number; center:Point};
export const emptyFeatures=():MotionFeatures=>({presence:0,fingerBends:[0,0,0,0,0],fingerSpeeds:[0,0,0,0,0],jointMotion:0,speed:0,openness:0,rotation:0,memory:0,center:{x:.5,y:.5,z:0}});
export class MotionFeaturesAnalyzer{
  value=emptyFeatures();
  private fingerHistory=new Map<number,number[]>();
  private previous=new Map<number,Point>();private time=0;
  reset(){this.value=emptyFeatures();this.previous.clear();this.fingerHistory.clear();this.time=0;}
  update(frame:Frame){
    const dt=Math.max(.016,Math.min(.25,(frame.t-this.time)/1000));this.time=frame.t;
    const bends=[0,0,0,0,0],rates=[0,0,0,0,0];
    let speed=0,openness=0,rotation=0;const center={x:0,y:0,z:0};
    for(const h of frame.hands){
      // Relative segment angles isolate finger articulation from whole-hand translation.
      const angle=(a:Point,b:Point,c:Point)=>{
        const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-b.x,y:c.y-b.y,z:c.z-b.z};
        const length=Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z);
        return length<1e-10?0:Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y+u.z*v.z)/length)))/Math.PI;
      };
      const finger=[1,5,9,13,17].map(i=>(angle(h.world[i],h.world[i+1],h.world[i+2])+angle(h.world[i+1],h.world[i+2],h.world[i+3]))/2);
      const previousFinger=this.fingerHistory.get(h.id);
      finger.forEach((v,i)=>{bends[i]+=v;if(previousFinger)rates[i]+=Math.min(1,Math.abs(v-previousFinger[i])/dt*2);});
      this.fingerHistory.set(h.id,finger);
      const w=h.image[0],old=this.previous.get(h.id);if(old)speed+=Math.min(1,distance(w,old)/dt/2);
      this.previous.set(h.id,{...w});center.x+=w.x;center.y+=w.y;center.z+=w.z;
      const palm=Math.max(.01,distance(h.world[0],h.world[9]));
      openness+=[8,12,16,20].reduce((sum,i)=>sum+Math.min(1,Math.max(0,(distance(h.world[0],h.world[i])/palm-.8)/1.5)),0)/4;
      rotation+=Math.atan2(h.world[5].y-h.world[17].y,h.world[5].x-h.world[17].x);
    }
    const ids=new Set(frame.hands.map(h=>h.id));for(const id of this.previous.keys())if(!ids.has(id))this.previous.delete(id);
    for(const id of this.fingerHistory.keys())if(!ids.has(id))this.fingerHistory.delete(id);
    const n=frame.hands.length,alpha=1-Math.exp(-dt*5);
    for(let i=0;i<5;i++){
      this.value.fingerBends[i]+=(bends[i]/Math.max(1,n)-this.value.fingerBends[i])*alpha;
      this.value.fingerSpeeds[i]+=(rates[i]/Math.max(1,n)-this.value.fingerSpeeds[i])*alpha;
    }
    this.value.jointMotion=this.value.fingerSpeeds.reduce((a,b)=>a+b,0)/5;
    this.value.speed+=(speed/Math.max(1,n)-this.value.speed)*alpha;
    this.value.openness+=(openness/Math.max(1,n)-this.value.openness)*alpha;
    this.value.rotation=rotation/Math.max(1,n);this.value.presence=n;
    this.value.memory+=(this.value.speed-this.value.memory)*(1-Math.exp(-dt*.25));
    if(n)this.value.center={x:center.x/n,y:center.y/n,z:center.z/n};
    return this.value;
  }
}
