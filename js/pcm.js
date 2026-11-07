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

// 16-bit mono WAV, so speech can go through the normal audio player (speed control, pitch kept).
export function pcmToWav(samples, rate = 24000) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
