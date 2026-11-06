// Audio engine: decoding, peaks, recording, playback with pitch-preserving speed.
let ctx;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export async function decode(blob) {
  const buf = await blob.arrayBuffer();
  return audioCtx().decodeAudioData(buf);
}

// Detailed envelope: `n` buckets, each with the min and max sample, normalized to -1..1.
export function peaks(buffer, n = 2000) {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / n));
  const min = new Float32Array(n), max = new Float32Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = 0;
    const start = i * size, end = Math.min(data.length, start + size);
    for (let j = start; j < end; j++) { const v = data[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    min[i] = lo; max[i] = hi;
    top = Math.max(top, hi, -lo);
  }
  if (top) for (let i = 0; i < n; i++) { min[i] /= top; max[i] /= top; }
  return { min, max };
}

// One <audio> element per source, so speed changes keep the pitch.
export class Player {
  constructor() {
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.preservesPitch = true;
    this.el.mozPreservesPitch = true;
    this.url = null;
  }
  load(blob) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = blob ? URL.createObjectURL(blob) : null;
    this.el.src = this.url || '';
    if (!blob) this.el.removeAttribute('src');
  }
  get playing() { return !this.el.paused; }
  set rate(r) { this.el.playbackRate = r; this.el.defaultPlaybackRate = r; }
  set loop(v) { this.el.loop = v; }
  set volume(v) { this.el.volume = v; }
  async play(fromStart = true) {
    if (!this.url) return;
    if (fromStart) this.el.currentTime = 0;
    try { await this.el.play(); } catch { /* interrupted */ }
  }
  pause() { this.el.pause(); }
  get progress() { return this.el.duration ? this.el.currentTime / this.el.duration : 0; }
  get time() { return this.el.currentTime || 0; }
}

// Microphone recorder.
export class Recorder {
  constructor() { this.stream = null; this.rec = null; this.chunks = []; }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.done = new Promise((resolve) => {
      this.rec.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' }));
      };
    });
    this.rec.start();
    this.startedAt = performance.now();
  }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
  stop() {
    if (this.recording) this.rec.stop();
    return this.done;
  }
}
