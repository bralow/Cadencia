// Draws native and user waveforms on one canvas, on a shared time axis,
// either stacked (two rows) or overlaid (one row). Detailed: one column per pixel,
// drawn from the real min/max of the samples, with marks every half second.
// The user track can be shifted (offset, seconds) and stretched (scale) to line it up.

import { warpTime, FRAME } from './dtw.js';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Time (seconds) where speech ends: last bucket louder than `threshold`.
export function speechEnd(track, threshold = 0.12) {
  if (!track) return 0;
  const { min, max } = track.peaks;
  for (let i = max.length - 1; i >= 0; i--) if (Math.max(max[i], -min[i]) >= threshold) return ((i + 1) / max.length) * track.duration;
  return track.duration;
}

// Time (seconds) where speech starts: first bucket louder than `threshold`.
export function onset(track, threshold = 0.12) {
  if (!track) return 0;
  const { min, max } = track.peaks;
  for (let i = 0; i < max.length; i++) if (Math.max(max[i], -min[i]) >= threshold) return (i / max.length) * track.duration;
  return 0;
}

export class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.native = null; // { peaks: {min, max}, duration }
    this.user = null;
    this.overlay = false;
    this.mode = 'wave'; // 'wave' | 'pitch'
    this.nativePitch = null; // { times, st }
    this.userPitch = null;
    this.warp = null; // syllable alignment result (dtw.js); drawn when warpOn
    this.warpOn = false;
    this.offset = 0; // seconds the user track is shifted right (negative = left)
    this.scale = 1; // user track length multiplier
    this.playhead = null; // { t: seconds on the shared axis }
    this.onDrag = null;
    this.resize = () => this.draw();
    window.addEventListener('resize', this.resize);

    // Horizontal drag moves the user track (overlay view only).
    let start = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!(this.overlay || this.mode === 'pitch') || !this.user || this.warped()) return;
      start = { x: e.clientX, offset: this.offset };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!start) return;
      const secPerPx = this.axis() / canvas.clientWidth;
      this.offset = start.offset + (e.clientX - start.x) * secPerPx;
      this.draw();
      if (this.onDrag) this.onDrag(this.offset);
    });
    const end = () => { start = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
  destroy() { window.removeEventListener('resize', this.resize); }

  aligned() { return this.overlay || this.mode === 'pitch'; }
  warped() { return this.warpOn && !!this.warp && this.aligned(); }
  // Native-axis time -> user time, following the syllable alignment.
  toUser(T) {
    const al = this.warp;
    if (T < al.n0) return al.map[0] - (al.n0 - T);
    if (T > al.n1) return al.map[al.map.length - 1] + (T - al.n1);
    return warpTime(al, T);
  }
  // User time -> native-axis time (inverse of toUser), for the playhead.
  fromUser(u) {
    const al = this.warp, m = al.map;
    if (u <= m[0]) return al.n0 - (m[0] - u);
    if (u >= m[m.length - 1]) return al.n1 + (u - m[m.length - 1]);
    let k = 0; while (k < m.length - 1 && m[k + 1] < u) k++;
    const span = m[k + 1] - m[k] || 1;
    return al.n0 + (k + (u - m[k]) / span) * FRAME;
  }
  setNativePitch(p) { this.nativePitch = p; this.draw(); }
  setUserPitch(p) { this.userPitch = p; this.draw(); }

  setNative(peaks, duration) { this.native = peaks ? { peaks, duration } : null; this.draw(); }
  setUser(peaks, duration) { this.user = peaks ? { peaks, duration } : null; this.draw(); }

  // Length of the shared time axis. Fixed by the native clip (plus room for the user take
  // when it runs longer), so dragging doesn't rescale everything.
  axis() {
    const n = this.native ? this.native.duration : 0;
    if (!this.aligned()) return Math.max(n, this.user ? this.user.duration : 0) || 1;
    if (this.warped()) return n || 1;
    const u = this.user ? this.user.duration * this.scale + Math.max(0, this.offset) : 0;
    return Math.max(n, this.overlay ? Math.min(u, n * 1.6 || u) : u) || 1;
  }

  draw() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, hgt = c.clientHeight;
    if (!w) return;
    c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);

    const total = this.axis();
    const pxPerSec = w / total;
    const nColor = cssVar('--native'), uColor = cssVar('--user'), grid = cssVar('--line'), muted = cssVar('--muted');
    const rows = this.overlay ? [{ y: 0, h: hgt }] : [{ y: 0, h: hgt / 2 - 3 }, { y: hgt / 2 + 3, h: hgt / 2 - 3 }];

    for (let t = 0.5; t < total; t += 0.5) {
      const x = Math.round(t * pxPerSec) + 0.5;
      g.fillStyle = grid;
      g.globalAlpha = Number.isInteger(t) ? 1 : 0.5;
      g.fillRect(x, 0, 1, hgt);
    }
    g.globalAlpha = 1;
    if (this.mode === 'pitch') { this.drawPitch(g, w, hgt, pxPerSec, nColor, uColor, grid, muted); this.drawPlayhead(g, w, hgt, pxPerSec); return; }
    if (!this.overlay) { g.fillStyle = grid; g.fillRect(0, hgt / 2 - 0.5, w, 1); }

    const drawTrack = (track, row, color, alpha, startSec, scale) => {
      const mid = row.y + row.h / 2, amp = row.h / 2 - 2;
      if (!track) {
        g.fillStyle = muted; g.globalAlpha = 0.35;
        g.fillRect(0, mid - 0.5, w, 1);
        g.globalAlpha = 1;
        return;
      }
      const { min, max } = track.peaks;
      const n = max.length;
      const x0 = startSec * pxPerSec;
      const span = Math.max(1, track.duration * scale * pxPerSec);
      const from = Math.max(0, Math.floor(x0)), to = Math.min(w, Math.ceil(x0 + span));
      if (to <= from) return;
      const cols = [];
      for (let x = from; x < to; x++) {
        const a = Math.floor(((x - x0) / span) * n), b = Math.max(a + 1, Math.floor(((x + 1 - x0) / span) * n));
        let lo = 0, hi = 0;
        for (let i = Math.max(0, a); i < b && i < n; i++) { if (min[i] < lo) lo = min[i]; if (max[i] > hi) hi = max[i]; }
        cols.push([lo, hi]);
      }
      g.fillStyle = color; g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(from, mid);
      cols.forEach(([, hi], k) => g.lineTo(from + k + 0.5, mid - Math.max(0.5, hi * amp)));
      for (let k = cols.length - 1; k >= 0; k--) g.lineTo(from + k + 0.5, mid - Math.min(-0.5, cols[k][0] * amp));
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    };

    if (this.overlay && this.warped()) {
      drawTrack(this.native, rows[0], nColor, 0.75, 0, 1);
      this.drawWarpedUser(g, w, rows[0], pxPerSec, uColor);
      this.drawRhythm(g, w, hgt, pxPerSec);
    } else if (this.overlay) {
      drawTrack(this.native, rows[0], nColor, 0.75, 0, 1);
      drawTrack(this.user, rows[0], uColor, 0.55, this.offset, this.scale);
    } else {
      drawTrack(this.native, rows[0], nColor, 1, 0, 1);
      drawTrack(this.user, rows[1], uColor, 1, 0, 1);
    }

    this.drawPlayhead(g, w, hgt, pxPerSec);
  }

  drawWarpedUser(g, w, row, pxPerSec, color) {
    const { min, max } = this.user.peaks, n = max.length, dur = this.user.duration;
    const mid = row.y + row.h / 2, amp = row.h / 2 - 2;
    const cols = [];
    for (let x = 0; x < w; x++) {
      const ua = this.toUser(x / pxPerSec), ub = this.toUser((x + 1) / pxPerSec);
      const lo0 = Math.min(ua, ub), hi0 = Math.max(ua, ub);
      if (hi0 < 0 || lo0 > dur) { cols.push(null); continue; }
      const a = Math.max(0, Math.floor((lo0 / dur) * n)), b = Math.min(n, Math.max(a + 1, Math.ceil((hi0 / dur) * n)));
      let lo = 0, hi = 0;
      for (let i = a; i < b; i++) { if (min[i] < lo) lo = min[i]; if (max[i] > hi) hi = max[i]; }
      cols.push([lo, hi]);
    }
    g.fillStyle = color; g.globalAlpha = 0.55;
    let x = 0;
    while (x < w) {
      while (x < w && !cols[x]) x++;
      if (x >= w) break;
      const start = x;
      g.beginPath(); g.moveTo(start, mid);
      while (x < w && cols[x]) { g.lineTo(x + 0.5, mid - Math.max(0.5, cols[x][1] * amp)); x++; }
      for (let k = x - 1; k >= start; k--) g.lineTo(k + 0.5, mid - Math.min(-0.5, cols[k][0] * amp));
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }

  // Strip along the bottom: orange where you were slower than your average, blue where faster.
  drawRhythm(g, w, hgt, pxPerSec) {
    const al = this.warp, slow = cssVar('--user'), fast = cssVar('--native-fast') || '#4A86C5';
    for (let k = 0; k < al.ratio.length; k++) {
      const r = al.ratio[k];
      if (r > 0.75 && r < 1.33) continue;
      const x = (al.n0 + k * FRAME) * pxPerSec;
      g.fillStyle = r >= 1.33 ? slow : fast;
      g.globalAlpha = 0.9;
      g.fillRect(x, hgt - 7, Math.max(1, FRAME * pxPerSec + 0.5), 7);
    }
    g.globalAlpha = 1;
  }

  drawPlayhead(g, w, hgt, pxPerSec) {
    if (!this.playhead) return;
    const x = this.playhead.t * pxPerSec;
    g.fillStyle = cssVar('--accent');
    g.fillRect(Math.max(0, Math.min(w - 2, x)), 0, 2, hgt);
  }

  // Melody view: semitones around each speaker's own median voice, -12..+12.
  drawPitch(g, w, hgt, pxPerSec, nColor, uColor, grid, muted) {
    const RANGE = 12, top = 10, bottom = hgt - 10;
    const y = (st) => top + ((RANGE - Math.max(-RANGE, Math.min(RANGE, st))) / (2 * RANGE)) * (bottom - top);
    g.font = '11px system-ui, sans-serif';
    for (const st of [-6, 0, 6]) {
      g.fillStyle = grid; g.globalAlpha = st === 0 ? 1 : 0.6;
      g.fillRect(0, Math.round(y(st)) + 0.5, w, 1);
      g.globalAlpha = 1;
    }
    g.fillStyle = muted;
    g.fillText('agudo', 4, top + 10);
    g.fillText('grave', 4, bottom - 2);
    const line = (track, color, width, startSec, scale) => {
      if (!track) return;
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      let pen = false, prevT = -1;
      for (let i = 0; i < track.st.length; i++) {
        const v = track.st[i];
        const t = startSec + track.times[i] * scale;
        if (Number.isNaN(v) || t - prevT > 0.05) pen = false;
        if (Number.isNaN(v)) continue;
        const px = t * pxPerSec, py = y(v);
        if (pen) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true; prevT = t;
      }
      g.stroke();
    };
    line(this.nativePitch, nColor, 3.5, 0, 1);
    if (this.warped() && this.userPitch) {
      const up = this.userPitch, t0 = up.times[0] || 0;
      g.strokeStyle = uColor; g.lineWidth = 2.5; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      let pen = false;
      const total = w / pxPerSec;
      for (let T = 0; T <= total; T += 0.01) {
        const u = this.toUser(T), i = Math.round((u - t0) / 0.01);
        const v = i >= 0 && i < up.st.length ? up.st[i] : NaN;
        if (Number.isNaN(v)) { pen = false; continue; }
        const px = T * pxPerSec, py = y(v);
        if (pen) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true;
      }
      g.stroke();
      this.drawRhythm(g, w, hgt, pxPerSec);
    } else line(this.userPitch, uColor, 2.5, this.offset, this.scale);
    if (!this.nativePitch && !this.userPitch) { g.fillStyle = muted; g.fillText('Analizando la melodía…', 8, hgt / 2); }
  }
}
