import { createRecording } from './recording.ts';
import type { Point } from './model.ts';
// Synthetic fixture for transport/rendering checks; never presented as camera measurement.
export function demoRecording() {
  const r=createRecording();
  const base: Point[]=[{x:0,y:.08,z:0}];
  for(let finger=0;finger<5;finger++) for(let joint=0;joint<4;joint++) base.push({x:(finger-2)*.025+(finger===0?-.012*joint:0),y:.025-joint*(finger===0?.016:.027)+(finger===4?.015:0),z:0});
  for(let i=0;i<=240;i++) {
    const t=i/30;
    r.frames.push({t:i*1000/30,hands: t>5.5 && t<6.2 ? [] : [0,1].map(side=>({id:side+1,handedness:side===0?'Left':'Right',score:1,world:base.map((p,j)=>({x:p.x*(side===0?1:-1),y:p.y,z:Math.sin(t*2+j*.15)*.02})),image:base.map(p=>({x:.3+side*.4+p.x+(Math.sin(t)*.05),y:.52+p.y*2,z:p.z}))}))});
  }
  r.duration=8000;return r;
}
