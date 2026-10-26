export class CameraManager {
  private stream?: MediaStream;
  private generation = 0;
  constructor(readonly video: HTMLVideoElement, private onEnded: ()=>void) {}
  async start() {
    this.stop(); const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('カメラAPIが使えません。localhostまたはHTTPSで開いてください。');
    const stream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
    if (generation !== this.generation) { stream.getTracks().forEach(t=>t.stop()); return false; }
    this.stream = stream; this.video.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener('ended',this.onEnded,{once:true});
    try { await this.video.play(); } catch (error) { this.stop(); throw error; }
    return generation === this.generation;
  }
  stop() { this.generation++; this.stream?.getTracks().forEach(t=>t.stop()); this.stream = undefined; this.video.pause(); this.video.srcObject = null; }
}
export function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if(error.name==='NotAllowedError') return 'カメラの許可が拒否されました。ブラウザのサイト設定で許可して再試行してください。';
    if(error.name==='NotFoundError') return 'カメラが見つかりません。接続を確認してください。';
    if(error.name==='NotReadableError') return 'カメラを開始できません。他のアプリの使用状況を確認してください。';
  }
  return error instanceof Error ? error.message : 'カメラまたはモデルの初期化に失敗しました。';
}
