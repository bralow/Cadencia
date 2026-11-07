// Shared player for raw PCM speech (Gemini voices). Unlocked on a user tap so Android allows sound.
let ctx = null;
let current = null;

export function audioOut() {
  if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// Call from a tap handler before any await.
export const unlockAudio = () => { audioOut(); };

export function int16ToFloat(int16) {
  const f = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 0x8000;
  return f;
}

export function stopPcm() { if (current) { try { current.stop(); } catch { /* done */ } current = null; } }

// Plays mono float samples at the given rate. Resolves when finished or stopped.
export function playPcm(samples, rate = 24000) {
  stopPcm();
  const c = audioOut();
  const buf = c.createBuffer(1, samples.length, rate);
  buf.getChannelData(0).set(samples);
  const node = c.createBufferSource();
  node.buffer = buf; node.connect(c.destination);
  current = node;
  return new Promise((resolve) => { node.onended = () => { if (current === node) current = null; resolve(); }; node.start(); });
}

export function concat(chunks) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
