import { clone, type Frame, type Recording } from './model.ts';
export const MAX_FRAMES = 18000;
export function createRecording(): Recording { return {version:1,createdAt:new Date().toISOString(),duration:0,coordinates:{image:'normalized-unmirrored',world:'meters-hand-centered'},frames:[]}; }
export function parseRecording(text: string): Recording {
  if (text.length > 60_000_000) throw new Error('JSONは60MB以下にしてください。');
  const r = JSON.parse(text);
  if (!r || r.version !== 1 || !Number.isFinite(r.duration) || r.duration < 0 || r.duration > 3_600_000 || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || r.coordinates?.image !== 'normalized-unmirrored' || r.coordinates?.world !== 'meters-hand-centered' || !Array.isArray(r.frames) || !r.frames.length || r.frames.length > MAX_FRAMES) throw new Error('対応する記録形式ではありません（version 1）。');
  let previous = -1;
  for (const f of r.frames) {
    if (!Number.isFinite(f.t) || f.t < 0 || f.t <= previous || f.t > r.duration || !Array.isArray(f.hands) || f.hands.length > 2) throw new Error('フレームの時刻または手の数が不正です。');
    previous = f.t;
    const ids = new Set();
    for (const h of f.hands) {
      if (!Number.isSafeInteger(h.id) || h.id < 0 || ids.has(h.id) || !['Left','Right'].includes(h.handedness) || !Number.isFinite(h.score) || h.score < 0 || h.score > 1) throw new Error('手の識別情報が不正です。');
      ids.add(h.id);
      for (const name of ['image','world']) if (!Array.isArray(h[name]) || h[name].length !== 21 || !h[name].every((p: any)=>p && ['x','y','z'].every(k=>Number.isFinite(p[k]) && Math.abs(p[k]) < 100))) throw new Error('21点の有限座標が必要です。');
    }
  }
  return r as Recording;
}
export class Recorder {
  data = createRecording();
  active = false;
  private startTime = 0;
  private bytes = 0;
  start(time: number) { this.data = createRecording(); this.startTime = time; this.bytes = 0; this.active = true; }
  append(frame: Frame) {
    if (!this.active) return;
    const t = frame.t-this.startTime;
    if (t < 0 || (this.data.frames.length && t <= this.data.frames.at(-1)!.t)) return;
    const saved = {...clone(frame),t};
    const bytes = JSON.stringify(saved).length+1;
    if (this.bytes+bytes > 55_000_000) { this.active = false; return; }
    this.bytes += bytes; this.data.frames.push(saved); this.data.duration = t;
    if (this.data.frames.length >= MAX_FRAMES) this.active = false;
  }
  stop(time: number) { if(this.active) this.data.duration = Math.max(this.data.duration,time-this.startTime); this.active = false; }
}
export class Player {
  index = 0;
  time = 0;
  playing = false;
  reset() { this.index = 0; this.time = 0; this.playing = false; }
  advance(delta: number, recording: Recording): Frame[] {
    if (!this.playing) return [];
    this.time = Math.min(recording.duration,this.time+delta);
    const frames: Frame[] = [];
    while (this.index < recording.frames.length && recording.frames[this.index].t <= this.time) frames.push(recording.frames[this.index++]);
    if (this.time >= recording.duration) this.playing = false;
    return frames;
  }
}
