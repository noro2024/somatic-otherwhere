import * as T from 'three';
import type { MotionFeatures } from './motion-features.ts';
export class GenerativeSpace{
  readonly group=new T.Group();enabled=true;
  private rings:T.Line[]=[];private cloud:T.Points;private ribbons:T.Line[]=[];
  private labelCanvas=document.createElement('canvas');private texture:T.CanvasTexture;private label:T.Sprite;
  private lastLabel=-1;private motionPhase=0;private lastTime=0;
  constructor(scene:T.Scene){
    scene.add(this.group);
    for(let i=0;i<10;i++){
      const pts=Array.from({length:193},(_,j)=>{const a=j/192*Math.PI*2,r=.22+i*.065;return new T.Vector3(Math.cos(a)*r,Math.sin(a)*r,0);});
      const ring=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0x637ae8,transparent:true,opacity:.23,blending:T.AdditiveBlending,depthWrite:false}));
      ring.position.z=-.12-i*.025;this.group.add(ring);this.rings.push(ring);
    }
    const data=new Float32Array(2200*3);for(let i=0;i<2200;i++){data[i*3]=Math.sin(i*12.9898)*1.5;data[i*3+1]=Math.sin(i*7.233)*1;data[i*3+2]=Math.sin(i*4.17)*1.1-.6;}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(data,3));
    this.cloud=new T.Points(geometry,new T.PointsMaterial({size:.002,color:0x8a9cff,transparent:true,opacity:.45,depthWrite:false,blending:T.AdditiveBlending}));this.group.add(this.cloud);
    for(let i=0;i<32;i++){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(220*3),3));
      const line=new T.Line(g,new T.LineBasicMaterial({color:new T.Color().setHSL(i/32,.85,.6),transparent:true,opacity:.25,depthWrite:false,blending:T.AdditiveBlending}));line.frustumCulled=false;this.ribbons.push(line);this.group.add(line);
    }
    this.labelCanvas.width=512;this.labelCanvas.height=256;this.texture=new T.CanvasTexture(this.labelCanvas);
    this.label=new T.Sprite(new T.SpriteMaterial({map:this.texture,transparent:true,opacity:.75,depthWrite:false}));this.label.scale.set(.2,.1,1);this.label.position.set(-.21,.24,-.04);this.group.add(this.label);
  }
  update(time:number,amount:number,f:MotionFeatures){
    this.group.visible=this.enabled;if(!this.enabled)return;
    const dt=Math.min(.1,Math.max(0,time-this.lastTime));this.lastTime=time;
    this.motionPhase+=dt*(.2+f.speed*3+f.memory);
    const drift=this.motionPhase,energy=f.speed;
    const follow=1-Math.exp(-dt*4);
    this.group.position.x+=((f.center.x-.5)*.22-this.group.position.x)*follow;
    this.group.position.y+=((.5-f.center.y)*.18-this.group.position.y)*follow;
    this.group.rotation.x+=((f.center.y-.5)*.55-this.group.rotation.x)*follow;
    this.group.rotation.y+=((f.center.x-.5)*.8-this.group.rotation.y)*follow;
    this.cloud.rotation.set(Math.sin(drift*.21)*.4,Math.cos(drift*.17)*.6,drift*.13);
    this.cloud.scale.setScalar(1+f.openness*.35+energy*.25);
    this.rings.forEach((r,i)=>{r.rotation.set(Math.sin(drift*.45+i)*(.3+amount+energy*.7),Math.cos(drift*.31+i)*(.3+amount)+Math.sin(f.rotation)*.4,drift*.18*(i%2?1:-1));r.scale.setScalar(1+Math.sin(drift*.7+i)*(.1+energy*.2)+f.openness*.2);(r.material as T.LineBasicMaterial).color.setHSL((.56+i*.045+time*.009)%1,.7,.45);});
    const influence=Math.min(1,amount*1.5+.2+f.speed*.5);
    this.ribbons.forEach((line,k)=>{
      const attr=line.geometry.getAttribute('position') as T.BufferAttribute;
      for(let j=0;j<220;j++){
        const u=j/219*Math.PI*2,phase=k/32*Math.PI*2+drift*.17;
        const radius=.15+f.openness*.07+influence*(.065*Math.sin(u*(3+f.memory*3)+drift*.7+phase)+.065*Math.cos(u*5-drift*.5))+k*.003;
        const x=radius*Math.cos(u+phase*.14),y=radius*Math.sin(u)*(.9+f.openness*.25),z=influence*((.16+energy*.16)*Math.sin(u*2+phase+drift*.6)+(.06+f.openness*.09)*Math.cos(u*7+drift*.4));
        attr.setXYZ(j,x+energy*.035*Math.sin(u*9+phase+drift),y+energy*.035*Math.cos(u*7-phase-drift),z);
      }
      attr.needsUpdate=true;line.rotation.z=drift*.13+k*.045;line.rotation.y=Math.sin(drift*.27+k*.18)*(.55+energy*.5);line.rotation.x=Math.cos(drift*.19+k*.11)*(.25+f.openness*.35);
      (line.material as T.LineBasicMaterial).opacity=.025+influence*.16;
      (line.material as T.LineBasicMaterial).color.setHSL((.52+k*.025+drift*.025+f.memory*.2+f.speed*.12)%1,.85,.58);
    });
    this.label.position.x=-.21+Math.sin(time*.2)*amount*.03;this.label.position.y=.24+Math.sin(time*.15)*.04;
    if(Math.floor(time*5)!==this.lastLabel){this.lastLabel=Math.floor(time*5);const c=this.labelCanvas.getContext('2d')!;c.clearRect(0,0,512,256);c.fillStyle='#81c8e5';c.font='18px monospace';
      ['SOMATIC / TELEMETRY',`HANDS     ${f.presence}`,`OPENNESS  ${f.openness.toFixed(3)}`,`VELOCITY  ${f.speed.toFixed(3)}`,`MEMORY    ${f.memory.toFixed(3)}`,`MUTATION  ${amount.toFixed(3)}`].forEach((v,i)=>c.fillText(v,12,28+i*30));
      c.strokeStyle='#906bf0';c.beginPath();for(let i=0;i<120;i++){const x=i*4,y=226+Math.sin(i*.17+time)*f.speed*18;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();this.texture.needsUpdate=true;}
  }
  dispose(){this.group.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)mesh.geometry.dispose();if(mesh.material)(mesh.material as T.Material).dispose();});this.texture.dispose();this.group.removeFromParent();}
}
