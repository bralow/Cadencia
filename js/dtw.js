// Syllable-level alignment of two takes of the same sentence with dynamic time warping
// over MFCC features (the standard "what does this frame sound like" fingerprint).
const SR = 16000, WIN = 400, HOP = 160, NFFT = 512, NMEL = 26, NCEP = 13; // 25 ms / 10 ms frames
export const FRAME = HOP / SR; // seconds per frame

function downsample(buffer) {
  const src = buffer.getChannelData(0);
  const f = Math.max(1, Math.round(buffer.sampleRate / SR));
  const out = new Float32Array(Math.floor(src.length / f));
  for (let i = 0; i < out.length; i++) { let s = 0; for (let k = 0; k < f; k++) s += src[i * f + k]; out[i] = s / f; }
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const melFilters = (() => {
  const mel = (f) => 2595 * Math.log10(1 + f / 700), inv = (m) => 700 * (10 ** (m / 2595) - 1);
  const lo = mel(80), hi = mel(7600);
  const pts = Array.from({ length: NMEL + 2 }, (_, i) => Math.floor(((NFFT + 1) * inv(lo + ((hi - lo) * i) / (NMEL + 1))) / SR));
  return Array.from({ length: NMEL }, (_, m) => {
    const w = new Float32Array(NFFT / 2 + 1);
    for (let k = pts[m]; k < pts[m + 1]; k++) w[k] = (k - pts[m]) / Math.max(1, pts[m + 1] - pts[m]);
    for (let k = pts[m + 1]; k < pts[m + 2]; k++) w[k] = (pts[m + 2] - k) / Math.max(1, pts[m + 2] - pts[m + 1]);
    return w;
  });
})();
const hamming = Float32Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)));

// MFCC frames between [t0, t1] seconds, mean/variance normalized.
export function mfcc(buffer, t0 = 0, t1 = Infinity) {
  const x = downsample(buffer);
  const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(x.length, Math.ceil(Math.min(t1, x.length / SR) * SR));
  const frames = [];
  const re = new Float32Array(NFFT), im = new Float32Array(NFFT);
  for (let s = a; s + WIN <= b; s += HOP) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < WIN; i++) re[i] = (x[s + i] - 0.97 * (x[s + i - 1] || 0)) * hamming[i];
    fft(re, im);
    const logmel = new Float32Array(NMEL);
    for (let m = 0; m < NMEL; m++) {
      let e = 0;
      const w = melFilters[m];
      for (let k = 0; k <= NFFT / 2; k++) if (w[k]) e += w[k] * (re[k] * re[k] + im[k] * im[k]);
      logmel[m] = Math.log(e + 1e-10);
    }
    const c = new Float32Array(NCEP);
    for (let n = 0; n < NCEP; n++) {
      let sum = 0;
      for (let m = 0; m < NMEL; m++) sum += logmel[m] * Math.cos((Math.PI * n * (m + 0.5)) / NMEL);
      c[n] = sum;
    }
    frames.push(c);
  }
  // Per-utterance normalization makes different voices and mics comparable.
  for (let n = 0; n < NCEP; n++) {
    let mu = 0; frames.forEach((f) => { mu += f[n]; }); mu /= frames.length || 1;
    let v = 0; frames.forEach((f) => { v += (f[n] - mu) ** 2; }); const sd = Math.sqrt(v / (frames.length || 1)) || 1;
    frames.forEach((f) => { f[n] = (f[n] - mu) / sd; });
  }
  return frames;
}

// Aligns user speech [u0,u1] to native speech [n0,n1].
// Returns { n0, n1, map: user time (s) for each native frame, ratio: local tempo (user/native), similarity 0..1 }
export function alignTakes(nativeBuf, userBuf, n0, n1, u0, u1) {
  const A = mfcc(nativeBuf, n0, n1), B = mfcc(userBuf, u0, u1);
  const N = A.length, M = B.length;
  if (N < 5 || M < 5) return null;
  const dist = (i, j) => { let s = 0; const a = A[i], b = B[j]; for (let k = 1; k < NCEP; k++) { const d = a[k] - b[k]; s += d * d; } return Math.sqrt(s); };
  // Cumulative cost with a band so the path can't wander absurdly far.
  const band = Math.max(Math.abs(N - M) + 10, Math.round(Math.max(N, M) * 0.3));
  const D = new Float32Array(N * M).fill(Infinity), step = new Uint8Array(N * M); // 0 diag, 1 up (i-1), 2 left (j-1)
  for (let i = 0; i < N; i++) {
    const jc = Math.round((i * (M - 1)) / Math.max(1, N - 1));
    for (let j = Math.max(0, jc - band); j < Math.min(M, jc + band + 1); j++) {
      const c = dist(i, j);
      if (i === 0 && j === 0) { D[0] = c; continue; }
      let best = Infinity, s = 0;
      if (i > 0 && j > 0 && D[(i - 1) * M + j - 1] + 2 * c < best) { best = D[(i - 1) * M + j - 1] + 2 * c; s = 0; }
      if (i > 0 && D[(i - 1) * M + j] + c < best) { best = D[(i - 1) * M + j] + c; s = 1; }
      if (j > 0 && D[i * M + j - 1] + c < best) { best = D[i * M + j - 1] + c; s = 2; }
      D[i * M + j] = best; step[i * M + j] = s;
    }
  }
  if (!Number.isFinite(D[N * M - 1])) return null;
  // Backtrack, averaging the user frames matched to each native frame.
  const sum = new Float32Array(N), cnt = new Float32Array(N);
  let i = N - 1, j = M - 1;
  while (true) {
    sum[i] += j; cnt[i]++;
    if (i === 0 && j === 0) break;
    const s = step[i * M + j];
    if (s === 0) { i--; j--; } else if (s === 1) i--; else j--;
    if (i < 0 || j < 0) break;
  }
  const mapFrames = Array.from(sum, (v, k) => (cnt[k] ? v / cnt[k] : 0));
  for (let k = 1; k < N; k++) if (!cnt[k]) mapFrames[k] = mapFrames[k - 1];
  // Light smoothing so the warp doesn't jitter.
  const smooth = mapFrames.map((_, k) => { const w = mapFrames.slice(Math.max(0, k - 3), k + 4); return w.reduce((a, b) => a + b, 0) / w.length; });
  const map = Float32Array.from(smooth, (f) => u0 + f * FRAME);
  const K = 8; // ±80 ms window for local tempo
  const ratio = Float32Array.from(smooth, (_, k) => {
    const a = Math.max(0, k - K), b = Math.min(N - 1, k + K);
    return b > a ? (smooth[b] - smooth[a]) / (b - a) : 1;
  });
  // Global tempo-corrected similarity: share of native frames within ±25% of the take's average tempo.
  const avg = (M - 1) / Math.max(1, N - 1);
  const ok = Array.from(ratio).filter((r) => r / avg > 0.75 && r / avg < 1.33).length;
  return { n0, n1, map, ratio: Float32Array.from(ratio, (r) => r / avg), similarity: ok / N };
}

// User time for a native time t (inside the aligned span), else null.
export function warpTime(al, t) {
  if (!al || t < al.n0 || t > al.n1) return null;
  const f = (t - al.n0) / FRAME, k = Math.floor(f);
  if (k >= al.map.length - 1) return al.map[al.map.length - 1];
  return al.map[k] + (al.map[k + 1] - al.map[k]) * (f - k);
}
