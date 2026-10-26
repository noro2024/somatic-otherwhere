export type Point = { x: number; y: number; z: number };
export type Hand = { id: number; handedness: 'Left' | 'Right'; score: number; image: Point[]; world: Point[] };
export type Frame = { t: number; hands: Hand[] };
export type Recording = {
  version: 1; createdAt: string; duration: number;
  coordinates: { image: 'normalized-unmirrored'; world: 'meters-hand-centered' };
  frames: Frame[];
};
export const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const clone = <T>(value: T): T => structuredClone(value);
export const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

// IDs follow nearest wrist positions for up to 700ms. Crossing/occlusion is ambiguous.
export class IdentityTracker {
  private previous: { hand: Hand; time: number }[] = [];
  private nextId = 1;
  reset() { this.previous = []; this.nextId = 1; }
  assign(hands: Omit<Hand, 'id'>[], time: number): Hand[] {
    const previous = this.previous.filter(p => time-p.time < 700);
    const candidates = hands.flatMap((h,i) => previous.map((p,j) => ({i,j,d:distance(h.image[0],p.hand.image[0])}))).sort((a,b)=>a.d-b.d);
    const ids = new Map<number,number>(), used = new Set<number>();
    for (const c of candidates) if (c.d < .45 && !ids.has(c.i) && !used.has(c.j)) { ids.set(c.i,previous[c.j].hand.id); used.add(c.j); }
    const result = hands.map((h,i)=>({...h,id:ids.get(i) ?? this.nextId++}));
    this.previous = [...previous.filter(p=>!result.some(h=>h.id===p.hand.id)),...result.map(hand=>({hand,time}))];
    return result;
  }
}

// Raw input is never mutated; smoothing is time-based and stored separately.
export class MotionAnalyzer {
  enabled = true;
  strength = .55;
  private states = new Map<number, {hand: Hand; time: number}>();
  reset() { this.states.clear(); }
  update(frame: Frame): Hand[] {
    const output = frame.hands.map(hand => {
      const old = this.states.get(hand.id);
      const alpha = !this.enabled || !old || frame.t-old.time > 350 ? 1 : 1-Math.exp(-Math.max(1,frame.t-old.time)/(12+this.strength*180));
      const smooth = (points: Point[], before?: Point[]) => alpha === 1 ? points.map(p=>({...p})) : points.map((p,i)=>({x:(before?.[i].x ?? p.x)+(p.x-(before?.[i].x ?? p.x))*alpha,y:(before?.[i].y ?? p.y)+(p.y-(before?.[i].y ?? p.y))*alpha,z:(before?.[i].z ?? p.z)+(p.z-(before?.[i].z ?? p.z))*alpha}));
      const filtered = {...hand,image:smooth(hand.image,old?.hand.image),world:smooth(hand.world,old?.hand.world)};
      this.states.set(hand.id,{hand:filtered,time:frame.t});
      return filtered;
    });
    for (const [id,s] of this.states) if (frame.t-s.time > 700) this.states.delete(id);
    return output;
  }
}

export function opacityAfterLoss(age: number) { return Math.max(0,Math.min(1,1-(age-100)/400)); }
// Display units are meters for local shape only. Image wrist maps onto a .65 x .45 display plane.
// World wrist is subtracted; +X right, +Y up, +Z toward viewer. Mirroring flips X in both views.
// No absolute camera depth is inferred: wrist depth is fixed at 0.
export function displayPoints(hand: Hand, mirror: boolean): Point[] {
  const sign = mirror ? -1 : 1, wrist = hand.world[0];
  return hand.world.map(p=>({x:sign*((hand.image[0].x-.5)*.65+p.x-wrist.x),y:(.5-hand.image[0].y)*.45-(p.y-wrist.y),z:-(p.z-wrist.z)}));
}
