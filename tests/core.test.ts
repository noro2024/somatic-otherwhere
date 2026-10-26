import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoRecording } from '../src/demo.ts';
import { parseRecording, Recorder, Player } from '../src/recording.ts';
import { MotionAnalyzer, IdentityTracker, displayPoints, opacityAfterLoss } from '../src/model.ts';
test('JSON export/import preserves both coordinate systems and timing',()=>{const r=demoRecording();assert.equal(JSON.stringify(parseRecording(JSON.stringify(r))),JSON.stringify(r));});
test('import rejects invalid coordinates, identities and time order',()=>{
  for(const change of [(r:any)=>r.frames[0].hands[0].world.pop(),(r:any)=>r.frames[1].t=0,(r:any)=>r.frames[0].hands[1].id=1,(r:any)=>r.coordinates.world='absolute',(r:any)=>r.frames[0].hands[0].image[0].x=null]){const r=demoRecording();change(r);assert.throws(()=>parseRecording(JSON.stringify(r)));}
});
test('recorder copies raw data and preserves empty detections and end duration',()=>{const r=new Recorder();r.start(100);const f=demoRecording().frames[0];f.t=110;r.append(f);f.hands[0].image[0].x=99;r.append({t:120,hands:[]});r.stop(200);assert.notEqual(r.data.frames[0].hands[0].image[0].x,99);assert.equal(r.data.frames[1].hands.length,0);assert.equal(r.data.duration,100);assert.equal(r.data.frames[0].t,10);parseRecording(JSON.stringify(r.data));});
test('player consumes all frames deterministically, pauses, and restarts',()=>{const r=demoRecording(),p=new Player();p.playing=true;const frames=[...p.advance(1000,r),...p.advance(7000,r)];assert.deepEqual(frames,r.frames);assert.equal(p.playing,false);p.reset();assert.equal(p.index,0);assert.deepEqual(p.advance(100,r),[]);});
test('smoothing does not mutate input, off uses raw coordinates',()=>{const a=new MotionAnalyzer(),r=demoRecording();const raw=structuredClone(r.frames);a.update(r.frames[0]);const smooth=a.update(r.frames[1]);assert.notDeepEqual(smooth,r.frames[1].hands);assert.deepEqual(r.frames,raw);a.enabled=false;assert.deepEqual(a.update(r.frames[2]),r.frames[2].hands);});
test('ID survives result reordering, expires after loss',()=>{const tracker=new IdentityTracker(),hands=demoRecording().frames[0].hands;const first=tracker.assign(hands,0);const second=tracker.assign([...hands].reverse(),33);assert.equal(first[0].id,second[1].id);assert.notEqual(tracker.assign(hands,800)[0].id,first[0].id);});
test('mirror only flips display X and wrist is anchored to image plane',()=>{const h=demoRecording().frames[0].hands[0];const a=displayPoints(h,false),b=displayPoints(h,true);a.forEach((p,i)=>{assert.equal(p.x,-b[i].x);assert.equal(p.y,b[i].y);assert.equal(p.z,b[i].z);});assert.equal(Math.abs(a[0].z),0);assert.equal(opacityAfterLoss(100),1);assert.equal(opacityAfterLoss(300),.5);assert.equal(opacityAfterLoss(501),0);});

test('anatomical display is finite and leaves recognition data untouched',async()=>{
  const {buildAnatomicalFrame}=await import('../src/anatomy.ts');
  const r=demoRecording();const before=structuredClone(r);
  for(const frame of r.frames.filter((_,i)=>i%30===0))for(const hand of frame.hands)for(const mirror of [false,true]){
    const model=buildAnatomicalFrame(displayPoints(hand,mirror),hand.handedness,mirror);
    assert.ok(model.bones.length>100);assert.ok(model.tissue.length>0);assert.ok(model.tendons.length>0);
    for(const segment of [...model.bones,...model.tissue,...model.tendons])for(const p of segment)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
  }
  assert.deepEqual(r,before);
});

test('deformation is non-destructive and zero amount restores the latest baseline',async()=>{
  const {deform}=await import('../src/visual-state.ts');
  const p={x:.1,y:.2,z:.03},origin={x:0,y:0,z:0},copy={...p};
  assert.notDeepEqual(deform(p,origin,.8,2),p);assert.deepEqual(p,copy);
  const moved={x:.3,y:.4,z:.05};assert.deepEqual(deform(moved,origin,0,99),moved);
});
test('visual controller recovers instantly, smoothly and automatically',async()=>{
  const {VisualStateController}=await import('../src/visual-state.ts');
  const state=new VisualStateController();state.enabled=true;
  for(let i=0;i<30;i++)state.step(.1);assert.ok(state.amount>.1);
  state.recover(true);assert.equal(state.amount,0);
  state.amount=.8;state.recover();for(let i=0;i<24;i++)state.step(.1);assert.equal(state.amount,0);
  let peak=0,returned=false;
  for(let i=0;i<400;i++){state.step(.1);peak=Math.max(peak,state.amount);if(peak>.1&&state.amount===0)returned=true;}
  assert.ok(returned);state.enabled=false;state.step(.1);assert.equal(state.amount,0);
});

test('motion history responds to movement, handles loss and reset',async()=>{
  const {MotionFeaturesAnalyzer}=await import('../src/motion-features.ts');const a=new MotionFeaturesAnalyzer();const f=demoRecording().frames[0];a.update(f);
  const moved=structuredClone(f);moved.t=100;for(const h of moved.hands)h.image[0].x+=.15;
  a.update(moved);assert.ok(a.value.speed>0);assert.ok(a.value.memory>0);assert.equal(a.value.presence,2);
  a.update({t:200,hands:[]});assert.equal(a.value.presence,0);assert.ok(Number.isFinite(a.value.rotation));
  a.reset();assert.equal(a.value.memory,0);
});
test('seeded evolution repeats and strong deformation stays finite',async()=>{
  const {VisualStateController,deform}=await import('../src/visual-state.ts');
  const a=new VisualStateController(),b=new VisualStateController();a.setSeed(123);b.setSeed(123);
  for(let i=0;i<1000;i++){a.step(.05);b.step(.05);assert.equal(a.amount,b.amount);const p=deform({x:.1,y:.2,z:.01},{x:0,y:0,z:0},a.amount,i*.05);assert.ok([p.x,p.y,p.z].every(Number.isFinite));}
});
