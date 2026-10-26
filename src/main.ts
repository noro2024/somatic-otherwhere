import './style.css';
import { CameraManager, cameraError } from './camera.ts';
import { HandTracker } from './tracker.ts';
import { MotionAnalyzer, opacityAfterLoss, type Frame, type Hand } from './model.ts';
import { Recorder, Player, parseRecording } from './recording.ts';
import { HandVisualizer, drawOverlay } from './visualizer.ts';
import { SoundGenerator } from './sound.ts';
import { demoRecording } from './demo.ts';

document.querySelector('#app')!.innerHTML=`<main>
<header><div><div class="eyebrow">MOTION RESEARCH / PHASE 01—05 / PROTOTYPE</div><h1>SOMATIC / OTHERWHERE</h1><p>手の記憶がほどけ、未知の形と音になる。</p></div><div class="badge">LOCAL PROCESSING</div></header>
<div class="toolbar"><button id="start" class="primary">カメラで読み取り</button><button id="stop" disabled>停止</button><span id="status" class="status" role="status" aria-live="polite">待機中 · カメラはオフです</span></div>
<section class="views">
<div class="panel camera-panel"><div class="panel-head">01 / CAMERA INPUT <span id="mirror-label">MIRRORED</span></div><div class="viewport"><div class="camera-stage"><div class="camera-image" id="camera-image"><video id="video" class="mirror" playsinline muted></video><canvas id="overlay" width="1280" height="720"></canvas></div></div><div id="placeholder" class="placeholder"><b>⌖</b><span id="placeholder-text">カメラを開始するか、デモ記録を再生してください</span></div><div class="view-note">21 LANDMARKS / UP TO 2 HANDS</div></div></div>
<div class="panel artwork-panel"><div class="panel-head">02 / OTHERWHERE <button id="reset">視点をリセット</button></div><div class="viewport"><div id="scene" aria-label="手の3D骨格"></div><div class="view-note">ドラッグ: 回転 · スクロール: ズーム · 右ドラッグ: 移動</div></div></div>
</section>
<section class="metrics" aria-label="性能計測"><div class="metric"><label>TRACKING</label><strong id="tracking">—<small>fps</small></strong></div><div class="metric"><label>RENDERING</label><strong id="rendering">—<small>fps</small></strong></div><div class="metric"><label>INFERENCE</label><strong id="inference">—<small>ms</small></strong></div><div class="metric"><label>DETECTED HANDS</label><strong id="hands">0<small>/ 2</small></strong></div></section>
<section class="controls"><div class="panel"><div class="panel-head">SIGNAL / 表示設定 <span>RAW → SMOOTH → DISPLAY</span></div><div class="control-body"><label><input id="smooth" type="checkbox" checked>平滑化</label><label>強度 <input id="strength" type="range" min="0" max="1" step=".05" value=".55"><output id="strength-value">0.55</output></label><label><input id="mirror" type="checkbox" checked>左右反転（2D・3D共通）</label><div class="muted wide">3Dの手形状は推定メートル座標。手首の位置は画面座標から配置。<br>奥行きは手に対する相対値で、カメラからの絶対距離ではありません。</div></div></div>
<div class="panel"><div class="panel-head">SESSION / 座標の記録・再生 <span id="mode">IDLE</span></div><div class="control-body"><div class="transport"><button id="record" disabled>● 記録</button><button id="play" disabled>▶ 再生</button><button id="rewind" disabled>先頭へ</button><button id="export" disabled>JSON保存</button><button id="import">読み込み</button><button id="demo">デモ記録</button><input id="file" type="file" accept=".json,application/json"></div><progress id="progress" class="timeline" value="0" max="1" aria-label="再生位置"></progress><div id="session" class="muted wide">記録なし · 映像・音声は保存しません</div></div></div></section>
<section class="panel" style="margin-top:16px"><div class="panel-head">FORM / 立体表現と変容 <span id="form-state">HUMAN</span></div><div class="control-body"><label><input id="mutation" type="checkbox" checked>自動変容</label><label>強度 <input id="mutation-strength" type="range" min="0" max="1" step=".05" value="1"></label><label><input id="particles" type="checkbox" checked>粒子</label><label><input id="surface" type="checkbox" checked>半透明面</label><button id="recover">滑らかに復帰</button><button id="snap">即時復帰</button><div class="muted wide">変形するのは3D表示のみ。左の認識骨格を保ち、不定期に現在の手の形へ戻ります。</div></div></section><section class="panel sound-panel"><div class="panel-head">AUTONOMY / SOUND <span id="audio-status">SILENT</span></div><div class="control-body"><button id="audio">音を開始</button><label>音量 <input id="volume" type="range" min="0" max=".6" step=".01" value=".18"></label><label>変化速度 <input id="evolution" type="range" min="0" max="1" step=".05" value=".5"></label><label>復帰頻度 <input id="recovery" type="range" min="0" max="1" step=".05" value=".5"></label><label>異質さ <input id="chaos" type="range" min="0" max="1" step=".05" value=".8"></label><label><input id="space" type="checkbox" checked>空間・計器</label><label><input id="quality" type="checkbox" checked>発光</label><label>シード <input id="seed" type="number" min="0" max="4294967295" value="37" style="width:90px"></label><button id="apply-seed">シード適用</button><div class="muted wide">音は手の動き・履歴・変容と時間から生成。停止・一時停止・手の消失で静かになります。</div></div></section><footer><span>検証: 開く・握る → 指を曲げる → 手首を回す → 両手を交差 → 画面外から復帰</span><span>推定座標 / 遮蔽・交差では左右IDが入れ替わる場合があります</span></footer>
</main>`;
const cameraPanel=document.querySelector('.camera-panel')!;
document.querySelector('.artwork-panel .viewport')!.append(cameraPanel);
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(id:string)=>el<HTMLButtonElement>(id);
const video=el<HTMLVideoElement>('video'), canvas=el<HTMLCanvasElement>('overlay');
const tracker=new HandTracker(), analyzer=new MotionAnalyzer(), recorder=new Recorder(), player=new Player();
const sound=new SoundGenerator();
let demoLoop=false,loopOffset=0;
let visualizer: HandVisualizer | undefined;
let running=false, starting=false, mode:'idle'|'live'|'replay'='idle', mirror=true, lastVideo=-1,lastDetection=0,lastFrameTime=0;
let latest: Hand[]=[], latestRaw:Frame={t:0,hands:[]};
let detectionCount=0,renderCount=0,metricTime=performance.now(),inferenceTotal=0,lastTick=performance.now();
let replayLabel='記録';
const camera=new CameraManager(video,()=>{stop();status('カメラの接続が切れました。再接続して開始してください。',true);});
function status(message:string,error=false){el('status').textContent=message;el('status').classList.toggle('error',error);}
try { visualizer=new HandVisualizer(el('scene')); }
catch { status('WebGLを初期化できません。Chromeのハードウェアアクセラレーションを確認してください。',true); }
function clear(){analyzer.reset();visualizer?.clear();latest=[];latestRaw={t:0,hands:[]};drawOverlay(canvas,[],mirror,1);el('hands').innerHTML='0<small>/ 2</small>';}
function controls(){
  button('start').disabled=running||starting;button('stop').disabled=!running&&!starting&&mode!=='replay'&&!sound.enabled;
  button('record').disabled=!running;button('record').textContent=recorder.active?'■ 記録を終了':'● 記録';button('record').classList.toggle('recording',recorder.active);
  for(const id of ['play','rewind','export'])button(id).disabled=!recorder.data.frames.length||recorder.active||starting;
  for(const id of ['demo','import'])button(id).disabled=recorder.active||starting;
  button('play').textContent=player.playing?'Ⅱ 一時停止':'▶ 再生';el('mode').textContent=recorder.active?'RECORDING':mode==='live'?'LIVE':mode==='replay'?'REPLAY':'IDLE';
  el('session').textContent=recorder.data.frames.length?`${replayLabel} · ${recorder.data.frames.length} frames · ${(recorder.data.duration/1000).toFixed(1)}秒${mode==='replay'?` · 再生 ${(player.time/1000).toFixed(1)}秒`:''}`:'記録なし · 映像・音声は保存しません';
}
function stop(){demoLoop=false;void sound.stop();audioControls();running=false;starting=false;camera.stop();recorder.stop(performance.now());player.playing=false;mode='idle';clear();el('placeholder').hidden=false;el('placeholder-text').textContent='カメラ停止中';status('停止しました · カメラはオフです');controls();}
let startToken=0;
button('start').onclick=async()=>{
  const audioReady=sound.start().then(()=>true,()=>false);
  demoLoop=false;loopOffset=0;const token=++startToken;starting=true;player.reset();clear();controls();status('モデルとカメラを準備しています…');
  try{
    await tracker.init();if(token!==startToken||!starting)return;
    if(!await camera.start()||token!==startToken||!starting)return;
    const audioStarted=await audioReady;if(token!==startToken||!starting){await sound.stop();return;}audioControls();
    if(!audioStarted)status('音を開始できませんでした。「音を開始」で再試行できます。',true);
    running=true;mode='live';tracker.reset();lastVideo=-1;lastDetection=0;el('placeholder').hidden=true;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;el('camera-image').style.aspectRatio=`${video.videoWidth}/${video.videoHeight}`;
    status(`認識中 · ${tracker.delegate} · カメラ映像はこの端末内で処理`);
  }catch(error){camera.stop();void sound.stop();audioControls();status(cameraError(error),true);}finally{if(token===startToken){starting=false;controls();}}
};
button('stop').onclick=()=>{startToken++;stop();};
el<HTMLInputElement>('mutation').onchange=e=>{if(visualizer)visualizer.state.enabled=(e.target as HTMLInputElement).checked;};
el<HTMLInputElement>('mutation-strength').oninput=e=>{if(visualizer)visualizer.state.strength=Number((e.target as HTMLInputElement).value);};
el<HTMLInputElement>('particles').onchange=e=>{if(visualizer)visualizer.particlesEnabled=(e.target as HTMLInputElement).checked;};
el<HTMLInputElement>('surface').onchange=e=>{if(visualizer)visualizer.surfaceEnabled=(e.target as HTMLInputElement).checked;};
button('recover').onclick=()=>visualizer?.state.recover();
button('snap').onclick=()=>visualizer?.state.recover(true);
button('reset').onclick=()=>visualizer?.resetView();
el<HTMLInputElement>('smooth').onchange=e=>{analyzer.enabled=(e.target as HTMLInputElement).checked;};
el<HTMLInputElement>('strength').oninput=e=>{analyzer.strength=Number((e.target as HTMLInputElement).value);el('strength-value').textContent=analyzer.strength.toFixed(2);};
el<HTMLInputElement>('mirror').onchange=e=>{mirror=(e.target as HTMLInputElement).checked;video.classList.toggle('mirror',mirror);el('mirror-label').textContent=mirror?'MIRRORED':'UNMIRRORED';if(latest.length)visualizer?.update(latest,lastFrameTime,mirror);};
button('record').onclick=()=>{if(recorder.active)recorder.stop(performance.now());else {recorder.start(performance.now());replayLabel='カメラ記録';}controls();};
function enterReplay(){loopOffset=0;camera.stop();running=false;starting=false;mode='replay';clear();player.reset();canvas.width=1280;canvas.height=720;el('camera-image').style.aspectRatio='16/9';el('placeholder').hidden=true;status('座標データを再生 · カメラはオフ / 映像なし');controls();}
button('play').onclick=()=>{if(mode!=='replay')enterReplay();if(player.time>=recorder.data.duration){player.reset();clear();}player.playing=!player.playing;controls();};
button('rewind').onclick=()=>{enterReplay();player.playing=true;controls();};
button('demo').onclick=()=>{demoLoop=true;recorder.data=demoRecording();replayLabel='合成デモ（実測ではありません）';enterReplay();player.playing=true;status('合成デモを再生中 · カメラは使用していません');controls();};
button('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(recorder.data)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`hand-motion-${new Date().toISOString().replaceAll(':','-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
button('import').onclick=()=>el<HTMLInputElement>('file').click();
el<HTMLInputElement>('file').onchange=async e=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try{if(file.size>60_000_000)throw new Error('JSONは60MB以下にしてください。');const data=parseRecording(await file.text());demoLoop=false;recorder.data=data;replayLabel='読み込み記録';enterReplay();status('JSONを読み込みました。再生ボタンで確認できます。');controls();}
  catch(error){status(cameraError(error),true);}finally{input.value='';}
};
function receive(frame:Frame){latestRaw=frame;latest=analyzer.update(frame);lastFrameTime=frame.t;visualizer?.update(latest,frame.t,mirror);el('hands').innerHTML=`${frame.hands.length}<small>/ 2</small>`;}
function tick(now:number){
  const delta=now-lastTick;lastTick=now;renderCount++;
  if(running&&video.readyState>=2&&video.currentTime!==lastVideo&&now-lastDetection>=1000/30){
    lastVideo=video.currentTime;lastDetection=now;
    try{const started=performance.now();const frame=tracker.detect(video,now);inferenceTotal+=performance.now()-started;detectionCount++;const wasRecording=recorder.active;recorder.append(frame);if(wasRecording&&!recorder.active){status('記録上限に達しました。JSONを保存してください。');controls();}receive(frame);}
    catch(error){stop();status(`認識エラー: ${cameraError(error)}`,true);}
  }
  if(mode==='replay'){const wasPlaying=player.playing;for(const frame of player.advance(delta,recorder.data))receive({...frame,t:frame.t+loopOffset});if(wasPlaying&&!player.playing){if(demoLoop){loopOffset+=recorder.data.duration;player.reset();player.playing=true;}controls();}}
  const time=mode==='replay'?player.time+loopOffset:now;
  drawOverlay(canvas,latest,mirror,opacityAfterLoss(time-lastFrameTime));visualizer?.render(time);
  if(visualizer)sound.update(visualizer.motion.value,visualizer.state.amount,Math.min(.1,delta/1000),(running||player.playing)&&time-lastFrameTime<500);
  if(time-lastFrameTime>500&&latestRaw.hands.length)el('hands').innerHTML='0<small>/ 2</small>';
  if(now-metricTime>=1000){const seconds=(now-metricTime)/1000;el('tracking').innerHTML=`${running?(detectionCount/seconds).toFixed(1):'—'}<small>fps</small>`;el('rendering').innerHTML=`${visualizer?(renderCount/seconds).toFixed(1):'—'}<small>fps</small>`;el('inference').innerHTML=`${detectionCount?(inferenceTotal/detectionCount).toFixed(1):'—'}<small>ms</small>`;detectionCount=0;renderCount=0;inferenceTotal=0;metricTime=now;controls();audioControls();}
  el('form-state').textContent=(visualizer?.state.amount??0)<.01?'HUMAN':(visualizer?.state.amount??0)<.4?'MUTATION':'UNKNOWN';
  el<HTMLProgressElement>('progress').value=mode==='replay'?player.time/Math.max(1,recorder.data.duration):0;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{sound.dispose();camera.stop();tracker.dispose();visualizer?.dispose();});

function audioControls(){button('audio').textContent=sound.enabled?'音を停止':'音を開始';el('audio-status').textContent=sound.enabled?`AUDIO ACTIVE · RMS ${sound.level.toFixed(4)}`:'SILENT';}
async function enableAudio(){try{await sound.start();audioControls();controls();}catch(e){status(`音の初期化に失敗: ${cameraError(e)}`,true);}}
button('audio').onclick=async()=>{if(sound.enabled)await sound.stop();else await enableAudio();audioControls();controls();};
el<HTMLInputElement>('volume').oninput=e=>sound.volume=Number((e.target as HTMLInputElement).value);
for(const [id,key] of [['evolution','speed'],['recovery','recovery'],['chaos','chaos']] as const)el<HTMLInputElement>(id).oninput=e=>{if(visualizer)visualizer.state[key]=Number((e.target as HTMLInputElement).value);};
el<HTMLInputElement>('space').onchange=e=>{if(visualizer)visualizer.spaceEnabled=(e.target as HTMLInputElement).checked;};
el<HTMLInputElement>('quality').onchange=e=>{if(visualizer)visualizer.quality=(e.target as HTMLInputElement).checked;};
button('apply-seed').onclick=()=>{const n=Number(el<HTMLInputElement>('seed').value);if(Number.isFinite(n)&&visualizer){visualizer.state.reset();visualizer.state.setSeed(n);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){void sound.stop();audioControls();}});
