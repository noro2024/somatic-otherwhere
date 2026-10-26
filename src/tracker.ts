import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { IdentityTracker, type Frame } from './model.ts';
export class HandTracker {
  private landmarker?: HandLandmarker;
  private ids = new IdentityTracker();
  delegate = 'GPU';
  async init() {
    if(this.landmarker) return;
    const files = await FilesetResolver.forVisionTasks(import.meta.env.BASE_URL+'wasm');
    const create = (delegate: 'GPU'|'CPU') => HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:import.meta.env.BASE_URL+'models/hand_landmarker.task',delegate},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
    try { this.landmarker = await create('GPU'); }
    catch { this.delegate='CPU'; this.landmarker=await create('CPU'); }
  }
  reset() { this.ids.reset(); }
  detect(video: HTMLVideoElement,time: number): Frame {
    const r = this.landmarker!.detectForVideo(video,time);
    return {t:time,hands:this.ids.assign(r.landmarks.map((image,i)=>({image:image.map(({x,y,z})=>({x,y,z})),world:r.worldLandmarks[i].map(({x,y,z})=>({x,y,z})),handedness:r.handedness[i][0].categoryName as 'Left'|'Right',score:r.handedness[i][0].score})),time)};
  }
  dispose() { this.landmarker?.close(); }
}
