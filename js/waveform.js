// Draws native and user waveforms on one canvas, on a shared time axis,
// either stacked (two rows) or overlaid (one row). Detailed: one column per pixel,
// drawn from the real min/max of the samples, with marks every half second.

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.native = null; // { peaks: {min, max}, duration }
    this.user = null;
    this.overlay = false;
    this.playhead = null; // { t: seconds }
    this.resize = () => this.draw();
    window.addEventListener('resize', this.resize);
  }
  destroy() { window.removeEventListener('resize', this.resize); }

  setNative(peaks, duration) { this.native = peaks ? { peaks, duration } : null; this.draw(); }
  setUser(peaks, duration) { this.user = peaks ? { peaks, duration } : null; this.draw(); }

  draw() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, hgt = c.clientHeight;
    if (!w) return;
    c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);

    const total = Math.max(this.native ? this.native.duration : 0, this.user ? this.user.duration : 0) || 1;
    const nColor = cssVar('--native'), uColor = cssVar('--user'), grid = cssVar('--line'), muted = cssVar('--muted');
    const rows = this.overlay ? [{ y: 0, h: hgt }] : [{ y: 0, h: hgt / 2 - 3 }, { y: hgt / 2 + 3, h: hgt / 2 - 3 }];

    // Half-second marks (stronger every second).
    for (let t = 0.5; t < total; t += 0.5) {
      const x = Math.round((t / total) * w) + 0.5;
      g.fillStyle = grid;
      g.globalAlpha = Number.isInteger(t) ? 1 : 0.5;
      g.fillRect(x, 0, 1, hgt);
    }
    g.globalAlpha = 1;
    if (!this.overlay) { g.fillStyle = grid; g.fillRect(0, hgt / 2 - 0.5, w, 1); }

    const drawTrack = (track, row, color, alpha) => {
      const mid = row.y + row.h / 2, amp = row.h / 2 - 2;
      if (!track) {
        g.fillStyle = muted; g.globalAlpha = 0.35;
        g.fillRect(0, mid - 0.5, w, 1);
        g.globalAlpha = 1;
        return;
      }
      const { min, max } = track.peaks;
      const n = max.length;
      const span = Math.max(1, Math.round((track.duration / total) * w)); // this track's width in px
      g.fillStyle = color; g.globalAlpha = alpha;
      g.beginPath();
      // Top edge left→right, bottom edge right→left: one filled shape.
      const col = (x) => {
        const a = Math.floor((x / span) * n), b = Math.max(a + 1, Math.floor(((x + 1) / span) * n));
        let lo = 0, hi = 0;
        for (let i = a; i < b && i < n; i++) { if (min[i] < lo) lo = min[i]; if (max[i] > hi) hi = max[i]; }
        return [lo, hi];
      };
      const cols = [];
      for (let x = 0; x < span; x++) cols.push(col(x));
      g.moveTo(0, mid);
      cols.forEach(([, hi], x) => g.lineTo(x + 0.5, mid - Math.max(0.5, hi * amp)));
      for (let x = cols.length - 1; x >= 0; x--) g.lineTo(x + 0.5, mid - Math.min(-0.5, cols[x][0] * amp));
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    };

    if (this.overlay) {
      drawTrack(this.native, rows[0], nColor, 0.75);
      drawTrack(this.user, rows[0], uColor, 0.55);
    } else {
      drawTrack(this.native, rows[0], nColor, 1);
      drawTrack(this.user, rows[1], uColor, 1);
    }

    if (this.playhead) {
      const x = (this.playhead.t / total) * w;
      g.fillStyle = cssVar('--accent');
      g.fillRect(Math.min(w - 2, x), 0, 2, hgt);
    }
  }
}
