// Pitch (F0) tracking with the YIN algorithm, then per-speaker normalization to
// semitones around the speaker's median, so a male and a female voice can be compared.
const TARGET_SR = 16000;
const FMIN = 65, FMAX = 500;
const WIN = 0.04, HOP = 0.01; // seconds

function downsample(buffer) {
  const src = buffer.getChannelData(0);
  const factor = Math.max(1, Math.round(buffer.sampleRate / TARGET_SR));
  const out = new Float32Array(Math.floor(src.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += src[i * factor + k];
    out[i] = s / factor; // box filter keeps it simple; speech F0 is far below the new Nyquist
  }
  return { data: out, sr: buffer.sampleRate / factor };
}

function yin(frame, sr, tauMin, tauMax, threshold = 0.15) {
  const W = frame.length - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) { const x = frame[i] - frame[i + tau]; sum += x * x; }
    d[tau] = sum;
  }
  // Cumulative mean normalized difference.
  let running = 0;
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { running += d[tau]; cmnd[tau] = running ? (d[tau] * tau) / running : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t; break;
    }
  }
  if (tau < 0) return 0;
  // Parabolic interpolation for sub-sample accuracy.
  const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
  const denom = a + c - 2 * b;
  const shift = denom ? (a - c) / (2 * denom) : 0;
  return sr / (tau + shift);
}

// Returns { times: Float32Array, st: Float32Array (NaN = unvoiced), median }
export function pitchTrack(buffer) {
  const { data, sr } = downsample(buffer);
  const win = Math.round(WIN * sr), hop = Math.round(HOP * sr);
  const tauMin = Math.floor(sr / FMAX), tauMax = Math.ceil(sr / FMIN);
  const frameLen = win + tauMax;
  // Loudness gate: ignore frames much quieter than the loudest part.
  let peakRms = 0;
  const rmsOf = (start) => { let s = 0; for (let i = 0; i < win; i++) { const v = data[start + i] || 0; s += v * v; } return Math.sqrt(s / win); };
  for (let start = 0; start + frameLen < data.length; start += hop) peakRms = Math.max(peakRms, rmsOf(start));

  const times = [], f0 = [];
  for (let start = 0; start + frameLen < data.length; start += hop) {
    const t = (start + win / 2) / sr;
    times.push(t);
    if (rmsOf(start) < peakRms * 0.08) { f0.push(0); continue; }
    f0.push(yin(data.subarray(start, start + frameLen), sr, tauMin, tauMax));
  }

  // Median-of-5 smoothing on voiced frames, drop isolated blips and octave jumps.
  const sm = f0.map((v, i) => {
    if (!v) return 0;
    const w = f0.slice(Math.max(0, i - 2), i + 3).filter(Boolean).sort((x, y) => x - y);
    return w.length >= 3 ? w[Math.floor(w.length / 2)] : 0;
  });
  const voiced = sm.filter(Boolean).sort((x, y) => x - y);
  const median = voiced.length ? voiced[Math.floor(voiced.length / 2)] : 0;
  const st = new Float32Array(sm.length);
  for (let i = 0; i < sm.length; i++) {
    if (!sm[i] || !median) { st[i] = NaN; continue; }
    const v = 12 * Math.log2(sm[i] / median);
    st[i] = Math.abs(v) > 14 ? NaN : v; // likely an octave error
  }
  return { times: Float32Array.from(times), st, median };
}
