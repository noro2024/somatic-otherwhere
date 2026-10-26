import type { Point } from './model.ts';

export type Segment = [Point, Point];
export type AnatomicalFrame = { bones: Segment[]; tissue: Segment[]; tendons: Segment[] };
const add = (a: Point, b: Point): Point => ({ x:a.x+b.x, y:a.y+b.y, z:a.z+b.z });
const sub = (a: Point, b: Point): Point => ({ x:a.x-b.x, y:a.y-b.y, z:a.z-b.z });
const scale = (p: Point, n: number): Point => ({ x:p.x*n, y:p.y*n, z:p.z*n });
const mix = (a: Point,b: Point,t: number) => add(a,scale(sub(b,a),t));
const length = (p: Point) => Math.hypot(p.x,p.y,p.z);
const unit = (p: Point) => scale(p,1/Math.max(length(p),1e-8));
const cross = (a: Point,b: Point): Point => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});

// Longitudinal rails and cross sections, not a filled skin mesh.
// A bone has enlarged ends and a narrow shaft; muscle envelopes taper at both ends.
function cage(out: Segment[], a: Point, b: Point, width: number, depth: number, normal: Point, muscle = false) {
  const axis = unit(sub(b,a));
  let side = unit(cross(axis,normal));
  if(length(side)<.1) side=unit(cross(axis,Math.abs(axis.x)<.8?{x:1,y:0,z:0}:{x:0,y:1,z:0}));
  const up=unit(cross(side,axis));
  const levels=muscle?[.05,.25,.5,.75,.95]:[0,.13,.48,.86,1];
  const profile=muscle?[.12,.75,1,.72,.1]:[.75,1,.62,.9,.7];
  const rings=levels.map((t,k)=>Array.from({length:8},(_,i)=>{
    const angle=i*Math.PI/4;
    return add(mix(a,b,t),add(scale(side,Math.cos(angle)*width*profile[k]),scale(up,Math.sin(angle)*depth*profile[k])));
  }));
  rings.forEach((ring,k)=>ring.forEach((p,i)=>{
    out.push([p,ring[(i+1)%8]]);
    if(k && i%2===0)out.push([rings[k-1][i],p]);
  }));
}

/** Stylized anatomy, NOT measured anatomy. MediaPipe observes only 21 surface landmarks.
 * MCP/CMC bases and tissue volumes below are display-only estimates. No raw data is modified.
 * Thumb: one metacarpal + two phalanges; other digits: one metacarpal + three phalanges.
 * Wrist is a support envelope, not a claim to resolve the eight individual carpal bones.
 */
export function buildAnatomicalFrame(p: Point[], handedness: 'Left'|'Right', mirrored: boolean): AnatomicalFrame {
  const out: AnatomicalFrame={bones:[],tissue:[],tendons:[]};
  const width=length(sub(p[5],p[17]));
  const size=Math.max(.018,Math.min(.14,width));
  const across=unit(sub(p[5],p[17]));
  const forward=unit(sub(mix(p[5],p[17],.5),p[0]));
  // Palm-side sign follows label plus mirror. A handedness error can swap the tissue side.
  const normal=scale(unit(cross(across,forward)),(handedness==='Left'?1:-1)*(mirrored?-1:1));
  const root=add(p[0],scale(forward,size*.13));
  const bases=[.25,.08,-.09,-.25].map(offset=>add(root,scale(across,size*offset)));
  const mcps=[5,9,13,17];
  // Four separate metacarpal rays; never connect adjacent MCPs as if they were bones.
  mcps.forEach((m,i)=>{
    cage(out.bones,bases[i],p[m],size*(i===3?.045:.052),size*.04,normal);
    for(let j=0;j<3;j++)cage(out.bones,p[m+j],p[m+j+1],size*(.046-j*.009),size*(.038-j*.007),normal);
  });
  for(let j=1;j<4;j++)cage(out.bones,p[j],p[j+1],size*(.059-(j-1)*.012),size*(.045-(j-1)*.009),normal);
  // Broad carpal support with two elliptical arches, rather than a single wrist apex.
  const carpalRings=[-.035,.14].map(d=>Array.from({length:12},(_,i)=>{
    const angle=i*Math.PI/6;
    return add(add(p[0],scale(forward,size*d)),add(scale(across,Math.cos(angle)*size*.31),scale(normal,Math.sin(angle)*size*.105)));
  }));
  carpalRings.forEach((ring,k)=>ring.forEach((point,i)=>{
    out.bones.push([point,ring[(i+1)%12]]);
    if(k && i%2===0)out.bones.push([carpalRings[0][i],point]);
  }));
  // Radial carpal/saddle support reaches the observed thumb CMC. This is part of
  // the wrist envelope, not a fourth thumb bone or an extra measured landmark.
  const radialRoot=add(root,scale(across,size*.25));
  cage(out.bones,radialRoot,p[1],size*.075,size*.06,normal);
  // Thenar/hypothenar masses and interosseous envelopes: schematic muscle groups,
  // not individually segmented muscles, attachments or a biomechanical simulation.
  cage(out.tissue,add(root,scale(normal,size*.07)),add(mix(p[1],p[2],.68),scale(normal,size*.07)),size*.14,size*.08,normal,true);
  cage(out.tissue,add(bases[3],scale(normal,size*.08)),add(mix(bases[3],p[17],.85),scale(normal,size*.07)),size*.09,size*.065,normal,true);
  for(let i=0;i<3;i++)cage(out.tissue,mix(bases[i],bases[i+1],.5),mix(mix(p[mcps[i]],p[mcps[i+1]],.5),mix(bases[i],bases[i+1],.5),.18),size*.06,size*.035,normal,true);
  // Schematic dorsal tendon paths follow each articulated digit, not straight tip chords.
  mcps.forEach((m,i)=>{
    const path=[bases[i],p[m],p[m+1],p[m+2],p[m+3]].map((point,j)=>add(point,scale(normal,-size*(.055-j*.007))));
    for(let j=1;j<path.length;j++)out.tendons.push([path[j-1],path[j]]);
  });
  return out;
}
