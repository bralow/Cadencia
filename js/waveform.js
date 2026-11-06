// Draws native and user waveforms on one canvas, on a shared time axis,
// either stacked (two rows) or overlaid (one row).
const BARS = 64;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.native = null; // { peaks, duration }
    this.user = null;
    this.overlay = false;
    this.playhead = null; // { which: 'native'|'user'|'both', t: seconds }
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

    const rows = this.overlay ? [{ y: 0, h: hgt }] : [{ y: 0, h: hgt / 2 - 4 }, { y: hgt / 2 + 4, h: hgt / 2 - 4 }];
    if (!this.overlay) {
      g.fillStyle = grid; g.fillRect(0, hgt / 2 - 0.5, w, 1);
    }

    const drawTrack = (track, row, color, alpha) => {
      const mid = row.y + row.h / 2;
      if (!track) {
        g.fillStyle = muted; g.globalAlpha = 0.5;
        g.fillRect(0, mid - 0.5, w, 1);
        g.globalAlpha = 1;
        return;
      }
      const span = (track.duration / total) * w; // this track's width on the shared axis
      const step = span / BARS, bw = Math.max(2, step * 0.62);
      g.fillStyle = color; g.globalAlpha = alpha;
      for (let i = 0; i < BARS; i++) {
        const v = sample(track.peaks, i / BARS, (i + 1) / BARS);
        const bh = Math.max(3, v * (row.h - 4));
        const x = i * step + (step - bw) / 2;
        roundRect(g, x, mid - bh / 2, bw, bh, bw / 2);
      }
      g.globalAlpha = 1;
    };

    if (this.overlay) {
      drawTrack(this.native, rows[0], nColor, 0.85);
      drawTrack(this.user, rows[0], uColor, 0.6);
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

function sample(peaks, a, b) {
  const i0 = Math.floor(a * peaks.length), i1 = Math.max(i0 + 1, Math.floor(b * peaks.length));
  let m = 0;
  for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
  return m;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  g.fill();
}
