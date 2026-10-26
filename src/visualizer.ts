import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BONES, displayPoints, opacityAfterLoss, type Hand, type Point } from './model.ts';
import { buildAnatomicalFrame, type Segment } from './anatomy.ts';
import { VisualStateController, deform } from './visual-state.ts';
import { MotionFeaturesAnalyzer } from './motion-features.ts';
import { GenerativeSpace } from './space.ts';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export const handColor = (id: number) => id%2 ? '#63e6d8' : '#e9b76c';
type Skeleton = { group: THREE.Group; joints: THREE.Mesh[]; line: THREE.LineSegments; tissue: THREE.LineSegments; tendons: THREE.LineSegments; time: number; baseline: Point[]; origin: Point; particles: THREE.Points; surface: THREE.Mesh; branch: THREE.LineSegments };
export class HandVisualizer {
  readonly motion = new MotionFeaturesAnalyzer();
  private space:GenerativeSpace;
  private composer:EffectComposer;
  private bloom:UnrealBloomPass;
  spaceEnabled=true;
  quality=true;
  readonly state = new VisualStateController();
  particlesEnabled = true;
  surfaceEnabled = true;
  private previousTime?: number;
  private animationTime = 0;
  private bases = new WeakMap<THREE.BufferGeometry, Float32Array>();
  private renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42,1,.005,20);
  private controls: OrbitControls;
  private skeletons = new Map<number,Skeleton>();
  private sphere = new THREE.SphereGeometry(.0018,10,8);
  private observer: ResizeObserver;
  constructor(container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); container.append(this.renderer.domElement);
    this.camera.position.set(0,.03,.95);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement); this.controls.enableDamping=true; this.controls.minDistance=.2; this.controls.maxDistance=3; this.controls.saveState();
    this.scene.background=new THREE.Color('#03030d');
    this.space=new GenerativeSpace(this.scene);
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(800,600),.32,.45,.55);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.observer=new ResizeObserver(()=>{ const {width,height}=container.getBoundingClientRect(); this.renderer.setSize(width,height);this.composer.setSize(width,height); this.camera.aspect=width/Math.max(1,height); this.camera.updateProjectionMatrix(); }); this.observer.observe(container);
  }
  update(hands: Hand[],time: number,mirror: boolean) {
    this.motion.update({t:time,hands});
    for(const hand of hands) {
      let s=this.skeletons.get(hand.id);
      if(!s) {
        const group=new THREE.Group(), color=handColor(hand.id), material=new THREE.MeshBasicMaterial({color,transparent:true});
        const joints=Array.from({length:21},()=>new THREE.Mesh(this.sphere,material)); joints.forEach(j=>group.add(j));
        const makeLines = (opacity: number, tint: string) => {
          const lines = new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:tint,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));
          group.add(lines);return lines;
        };
        const line=makeLines(.85,color), tissue=makeLines(.3,color), tendons=makeLines(.45,'#dce6ef');
        this.scene.add(group);
        const particles=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color,size:.0025,transparent:true,opacity:.6,depthWrite:false}));
        const surface=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false}));
        const branch=makeLines(0,color);group.add(particles,surface);
        s={group,joints,line,tissue,tendons,time,baseline:[],origin:{x:0,y:0,z:0},particles,surface,branch};this.skeletons.set(hand.id,s);
      }
      const points=displayPoints(hand,mirror); points.forEach((p,i)=>{
        s!.joints[i].position.set(p.x,p.y,p.z);
        s!.joints[i].scale.setScalar([4,8,12,16,20].includes(i)?.6:1);
      });
      const anatomy=buildAnatomicalFrame(points,hand.handedness,mirror);
      this.setSegments(s.line,anatomy.bones);
      this.setSegments(s.tissue,anatomy.tissue);
      this.setSegments(s.tendons,anatomy.tendons);
      this.setSegments(s.branch,anatomy.bones);
      s.baseline=points;s.origin=points[0];
      const cloud=anatomy.bones.filter((_,i)=>i%3===0).map(segment=>segment[0]);
      this.setVertices(s.particles.geometry,cloud);
      // Translucent palm fan and narrow articulated finger ribbons: a stylized membrane,
      // not an inferred skin surface. Thumb remains independent from the four finger chains.
      const triangles:Point[]=[];
      for(const [a,b] of [[1,5],[5,9],[9,13],[13,17]])triangles.push(points[0],points[a],points[b]);
      for(const start of [1,5,9,13,17])for(let j=0;j<3;j++){
        const a=points[start+j],b=points[start+j+1],r=.003;
        const direction=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z).normalize();
        const side=new THREE.Vector3(points[5].x-points[17].x,points[5].y-points[17].y,points[5].z-points[17].z);
        side.addScaledVector(direction,-side.dot(direction)).normalize().multiplyScalar(r);
        const left=(p:Point)=>({x:p.x-side.x,y:p.y-side.y,z:p.z-side.z}),right=(p:Point)=>({x:p.x+side.x,y:p.y+side.y,z:p.z+side.z});
        triangles.push(left(a),right(a),left(b),right(a),right(b),left(b));
      }
      this.setVertices(s.surface.geometry,triangles);
      s.time=time;
    }
  }
  private setSegments(line: THREE.LineSegments, segments: Segment[]) {
    let positions=line.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if(!positions || positions.count!==segments.length*2){
      positions=new THREE.BufferAttribute(new Float32Array(segments.length*6),3);
      positions.setUsage(THREE.DynamicDrawUsage);line.geometry.setAttribute('position',positions);
    }
    segments.forEach(([a,b],i)=>{positions!.setXYZ(i*2,a.x,a.y,a.z);positions!.setXYZ(i*2+1,b.x,b.y,b.z);});
    positions.needsUpdate=true;line.geometry.computeBoundingSphere();this.bases.set(line.geometry,new Float32Array(positions.array));
  }
  private setVertices(geometry:THREE.BufferGeometry,points:Point[]){
    let attr=geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if(!attr || attr.count!==points.length){attr=new THREE.BufferAttribute(new Float32Array(points.length*3),3);attr.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',attr);}
    points.forEach((p,i)=>attr!.setXYZ(i,p.x,p.y,p.z));attr.needsUpdate=true;
    this.bases.set(geometry,new Float32Array(attr.array));geometry.computeBoundingSphere();
  }
  private transform(geometry:THREE.BufferGeometry,origin:Point,variant=0){
    const base=this.bases.get(geometry);if(!base)return;
    const attr=geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<base.length;i+=3){const p=deform({x:base[i],y:base[i+1],z:base[i+2]},origin,Math.min(1,this.state.amount*(.5+this.state.chaos*.7)),this.animationTime,variant);if(variant===3){const spread=this.state.amount*this.state.amount*.07;p.x+=spread*Math.sin(i*12.3+this.animationTime);p.y+=spread*Math.cos(i*4.7+this.animationTime*.7);p.z+=spread*Math.sin(i*7.1-this.animationTime);}
      attr.setXYZ(i/3,p.x,p.y,p.z);}
    attr.needsUpdate=true;geometry.computeBoundingSphere();
  }
  render(time: number) {
    const dt=this.previousTime===undefined?0:Math.min(.1,Math.max(0,(time-this.previousTime)/1000));this.previousTime=time;
    this.animationTime+=dt;this.state.memory=this.motion.value.memory;this.state.step(dt);
    if(!this.skeletons.size){this.motion.value.presence=0;this.motion.value.speed*=Math.exp(-dt*2);this.motion.value.memory*=Math.exp(-dt*.1);}
    this.space.enabled=this.spaceEnabled;this.space.update(this.animationTime,this.state.amount,this.motion.value);
    for(const [id,s] of this.skeletons) {
      const opacity=opacityAfterLoss(time-s.time);
      const hue=(.5+id*.12+this.animationTime*.018+this.state.amount*.28)%1;
      for(const item of [s.line,s.tissue,s.particles,s.branch,s.surface]){const material=item.material as THREE.LineBasicMaterial;material.color.setHSL(hue,.75,.66);}
      (s.branch.material as THREE.LineBasicMaterial).color.setHSL((hue+.28)%1,.9,.6);
      for(const obj of [s.line,s.tissue,s.tendons,s.surface])this.transform(obj.geometry,s.origin);
      this.transform(s.particles.geometry,s.origin,3);
      this.transform(s.branch.geometry,s.origin,2);
      s.baseline.forEach((p,i)=>{const q=deform(p,s.origin,this.state.amount,this.animationTime);s.joints[i].position.set(q.x,q.y,q.z);});
      (s.branch.material as THREE.LineBasicMaterial).opacity=opacity*this.state.amount*.12;
      s.particles.visible=this.particlesEnabled;s.surface.visible=this.surfaceEnabled;
      (s.particles.material as THREE.PointsMaterial).opacity=opacity*(.35+this.state.amount*.5);
      (s.surface.material as THREE.MeshBasicMaterial).opacity=opacity*.06*(1-this.state.amount*.8);
      (s.joints[0].material as THREE.MeshBasicMaterial).opacity=opacity;
      (s.line.material as THREE.LineBasicMaterial).opacity=opacity*(.75-this.state.amount*.45);
      (s.tissue.material as THREE.LineBasicMaterial).opacity=opacity*(.3-this.state.amount*.2);
      (s.tendons.material as THREE.LineBasicMaterial).opacity=opacity*.45;
      if(opacity===0){this.remove(s);this.skeletons.delete(id);}
    }
    this.controls.update();if(this.quality)this.composer.render();else this.renderer.render(this.scene,this.camera);
  }
  private remove(s: Skeleton) {this.scene.remove(s.group);for(const line of [s.line,s.tissue,s.tendons,s.branch,s.surface,s.particles]){line.geometry.dispose();(line.material as THREE.Material).dispose();}(s.joints[0].material as THREE.Material).dispose();}
  clear(){this.previousTime=undefined;this.animationTime=0;this.state.reset();this.motion.reset();for(const s of this.skeletons.values())this.remove(s);this.skeletons.clear();}
  resetView(){this.controls.reset();}
  dispose(){this.clear();this.observer.disconnect();this.sphere.dispose();this.controls.dispose();this.space.dispose();this.composer.passes.forEach(p=>p.dispose());this.composer.dispose();this.renderer.dispose();}
}
export function drawOverlay(canvas: HTMLCanvasElement,hands: Hand[],mirror: boolean,opacity: number) {
  const ctx=canvas.getContext('2d')!; const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.globalAlpha=opacity;
  for(const hand of hands) {
    const points=hand.image.map(p=>({x:(mirror?1-p.x:p.x)*w,y:p.y*h}));ctx.strokeStyle=handColor(hand.id);ctx.fillStyle=handColor(hand.id);ctx.lineWidth=2;
    ctx.beginPath(); for(const [a,b] of BONES){ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);}ctx.stroke();
    for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
    ctx.font='14px monospace';ctx.fillText(`#${hand.id} ${hand.handedness} ${Math.round(hand.score*100)}%`,points[0].x+10,points[0].y+18);
  }
  ctx.globalAlpha=1;
}
