// Draws native and user waveforms on one canvas, on a shared time axis,
// either stacked (two rows) or overlaid (one row). Detailed: one column per pixel,
// drawn from the real min/max of the samples, with marks every half second.
// The user track can be shifted (offset, seconds) and stretched (scale) to line it up.

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
    this.offset = 0; // seconds the user track is shifted right (negative = left)
    this.scale = 1; // user track length multiplier
    this.playhead = null; // { t: seconds on the shared axis }
    this.onDrag = null;
    this.resize = () => this.draw();
    window.addEventListener('resize', this.resize);

    // Horizontal drag moves the user track (overlay view only).
    let start = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.overlay || !this.user) return;
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

  setNative(peaks, duration) { this.native = peaks ? { peaks, duration } : null; this.draw(); }
  setUser(peaks, duration) { this.user = peaks ? { peaks, duration } : null; this.draw(); }

  // Length of the shared time axis. Fixed by the native clip (plus room for the user take
  // when it runs longer), so dragging doesn't rescale everything.
  axis() {
    const n = this.native ? this.native.duration : 0;
    if (!this.overlay) return Math.max(n, this.user ? this.user.duration : 0) || 1;
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

    if (this.overlay) {
      drawTrack(this.native, rows[0], nColor, 0.75, 0, 1);
      drawTrack(this.user, rows[0], uColor, 0.55, this.offset, this.scale);
    } else {
      drawTrack(this.native, rows[0], nColor, 1, 0, 1);
      drawTrack(this.user, rows[1], uColor, 1, 0, 1);
    }

    if (this.playhead) {
      const x = this.playhead.t * pxPerSec;
      g.fillStyle = cssVar('--accent');
      g.fillRect(Math.max(0, Math.min(w - 2, x)), 0, 2, hgt);
    }
  }
}
