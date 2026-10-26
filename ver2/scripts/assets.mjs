import { cp, mkdir, writeFile, access } from 'node:fs/promises';
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
try { await access('public/models/hand_landmarker.task'); }
catch {
  const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model download: ${response.status}`);
  await writeFile('public/models/hand_landmarker.task', Buffer.from(await response.arrayBuffer()));
}
console.log('Local WASM and version 1 hand model ready.');
