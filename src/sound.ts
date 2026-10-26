import type { MotionFeatures } from './motion-features.ts';
export class SoundGenerator{
  private context?:AudioContext;private master?:GainNode;private bus?:GainNode;
  private filter?:BiquadFilterNode;private pan?:StereoPannerNode;
  private voices:{osc:OscillatorNode;gain:GainNode}[]=[];
  private fingerNotes=[0,0,0,0,0];
  private nextNote=0;private count=0;private clock=0;
  enabled=false;volume=.18;level=0;
  private meter?:AnalyserNode;private samples=new Float32Array(256);
  async start(){
    if(!this.context){
      const c=this.context=new AudioContext();
      this.master=c.createGain();this.master.gain.value=0;
      const compressor=c.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=8;
      this.bus=c.createGain();this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=800;
      this.pan=c.createStereoPanner();this.meter=c.createAnalyser();this.meter.fftSize=256;this.bus.connect(this.filter).connect(this.pan).connect(this.master).connect(compressor).connect(this.meter).connect(c.destination);
      const delay=c.createDelay(2),feedback=c.createGain(),wet=c.createGain();delay.delayTime.value=.47;feedback.gain.value=.28;wet.gain.value=.25;
      this.pan.connect(delay);delay.connect(feedback).connect(delay);delay.connect(wet).connect(this.master);
      for(let i=0;i<8;i++){const osc=c.createOscillator(),gain=c.createGain();osc.type=i===1?'triangle':'sine';osc.frequency.value=55*(i+1);gain.gain.value=.065;osc.connect(gain).connect(this.bus);osc.start();this.voices.push({osc,gain});}
    }
    await this.context.resume();this.enabled=true;this.nextNote=this.context.currentTime;
  }
  async stop(){this.enabled=false;this.level=0;if(this.context){this.master!.gain.setValueAtTime(0,this.context.currentTime);await this.context.suspend();}}
  update(f:MotionFeatures,mutation:number,dt:number,active:boolean){
    if(!this.enabled||!this.context)return;const c=this.context,t=c.currentTime;this.clock+=dt;
    this.meter!.getFloatTimeDomainData(this.samples);this.level=Math.sqrt(this.samples.reduce((sum,v)=>sum+v*v,0)/this.samples.length);
    const audible=active&&f.presence>0;
    // Silence windows and independent drift keep this from being a gesture-to-note instrument.
    const breath=.55+.45*Math.sin(this.clock*(.19+f.speed*.8)+f.memory*4);
    this.master!.gain.setTargetAtTime(audible?this.volume*breath:0,t,.25);
    this.filter!.frequency.setTargetAtTime(120+Math.pow(f.openness,2)*5800+f.speed*9000+f.jointMotion*6500+mutation*2400,t,.07);
    this.pan!.pan.setTargetAtTime(Math.max(-.8,Math.min(.8,(f.center.x-.5)*2+Math.sin(f.rotation)*.45+Math.sin(this.clock*.13)*.15)),t,.08);
    const base=45*Math.pow(2,(f.openness*19+f.speed*12+f.memory*7+(1-f.center.y)*8)/12);
    this.voices.forEach(({osc,gain},i)=>{
      const finger=i<3?-1:i-3,bend=finger<0?f.openness:f.fingerBends[finger],motion=finger<0?f.speed:f.fingerSpeeds[finger];
      const ratio=i<3?[1,1.5,2.005][i]:Math.pow(2,([0,7,12,16,21][finger]+bend*24)/12);
      osc.frequency.setTargetAtTime(base*ratio*(1+.012*Math.sin(this.clock*(.3+motion*5)+i)),t,.045);
      osc.detune.setTargetAtTime(Math.sin(this.clock*.7+i)*(12+motion*150),t,.05);
      gain.gain.setTargetAtTime(i<3?.025+f.openness*.02:.008+bend*.012+motion*.045,t,.035);
    });
    // Independent finger voices overlap; cooldown and a global cap bound polyphony.
    if(audible)for(let i=0;i<5;i++){
      const motion=f.fingerSpeeds[i],bend=f.fingerBends[i];
      if(motion<.035||t<this.fingerNotes[i]||this.count>=24)continue;
      this.fingerNotes[i]=t+.075+(1-motion)*.22;
      const osc=c.createOscillator(),overtone=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner();
      const hz=90*Math.pow(2,([0,5,9,14,19][i]+bend*30+f.memory*7)/12);
      osc.type=i%2?'triangle':'sine';overtone.type='sine';
      osc.frequency.setValueAtTime(hz*(1+motion*.2),t);osc.frequency.exponentialRampToValueAtTime(hz,t+.18);
      overtone.frequency.value=hz*(2.01+mutation*.7);pan.pan.value=(i-2)*.32;
      const duration=.45+bend*1.3+mutation*.5;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.012+motion*.026,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain);overtone.connect(gain);gain.connect(pan).connect(this.bus!);
      osc.start(t);overtone.start(t);osc.stop(t+duration+.02);overtone.stop(t+duration+.02);this.count++;
      osc.onended=()=>{osc.disconnect();overtone.disconnect();gain.disconnect();pan.disconnect();this.count--;};
    }
    if(audible&&t>=this.nextNote&&this.count<24){
      const phase=this.clock+f.memory*8;this.nextNote=t+.07+Math.pow(1-f.speed,3)*.7+(Math.sin(phase*1.7)+1)*.12;
      if(breath<.2)return;
      const scale=[0,2,5,7,9,12,14,19],degree=Math.floor((Math.sin(phase*.43+f.openness*5+f.rotation*2)+1)*3.9);
      const osc=c.createOscillator(),gain=c.createGain();osc.type=f.speed>.45?'sawtooth':mutation>.6?'triangle':'sine';osc.frequency.value=base*2*Math.pow(2,scale[degree]/12);osc.detune.value=Math.sin(phase+f.rotation)*mutation*(28+f.speed*260);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.045+f.speed*.055,t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+1.8);
      osc.connect(gain).connect(this.bus!);osc.start(t);osc.stop(t+1.9);this.count++;osc.onended=()=>{osc.disconnect();gain.disconnect();this.count--;};
    }
  }
  dispose(){this.enabled=false;void this.context?.close();}
}
