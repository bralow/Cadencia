// Audio editor (FE-13).
//  openAudioEditor(blob)        → Promise<Blob|null>: trim, cut out a part, join another clip, volume.
//  openMarkerEditor(src, label) → Promise<{s,e}|null>: move the start and end of a moment inside a long
//                                 recording (a podcast episode) without copying any audio.
import { h, toast } from './ui.js';
import { decode, Recorder } from './audio.js';
import { pcmToWav } from './pcm.js';
import { overlay } from './imgedit.js';
import { db } from './db.js';

const RATE = 22050; // plenty for speech, and half the size of 44.1 kHz

async function toMono(blob) {
  const buf = await decode(blob);
  const len = Math.ceil(buf.duration * RATE);
  const off = new OfflineAudioContext(1, Math.max(1, len), RATE);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0).slice();
}
const fmt = (s) => `${s.toFixed(2)} s`;

export function openAudioEditor(blob) {
  return new Promise((resolve) => {
    const { sheet, close } = overlay();
    let data = null, sel = [0, 0], gain = 1, undo = [], player = null, raf = 0;
    const canvas = h('canvas', { 'aria-label': 'Forma de onda', style: 'width:100%;height:110px;border-radius:12px;background:var(--chip);touch-action:none;display:block' });
    const info = h('span', { class: 'muted small', style: 'font-variant-numeric:tabular-nums' }, 'Cargando…');
    const vol = h('input', { type: 'range', min: '0.25', max: '3', step: '0.05', value: '1', 'aria-label': 'Volumen', style: 'flex:1;accent-color:var(--accent)' });
    const volLbl = h('span', { class: 'small', style: 'min-width:44px;text-align:right' }, '100%');
    const dur = () => (data ? data.length / RATE : 0);

    function draw(playAt = -1) {
      const w = canvas.width = canvas.clientWidth * 2, ht = canvas.height = 220, ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, ht);
      if (!data) return;
      const css = getComputedStyle(document.body);
      const step = Math.max(1, Math.floor(data.length / w));
      const x0 = (sel[0] / dur()) * w, x1 = (sel[1] / dur()) * w;
      ctx.fillStyle = css.getPropertyValue('--accent-ring') || '#f0c9b7';
      ctx.fillRect(x0, 0, x1 - x0, ht);
      ctx.fillStyle = css.getPropertyValue('--ink') || '#222';
      for (let x = 0; x < w; x++) {
        let lo = 0, hi = 0;
        for (let i = x * step, e = Math.min(data.length, i + step); i < e; i++) { const v = data[i] * gain; if (v < lo) lo = v; if (v > hi) hi = v; }
        ctx.fillRect(x, (1 - Math.min(1, hi)) * ht / 2, 1, Math.max(1, (Math.min(1, hi) - Math.max(-1, lo)) * ht / 2));
      }
      ctx.fillStyle = css.getPropertyValue('--accent') || '#b5482a';
      ctx.fillRect(x0 - 2, 0, 4, ht); ctx.fillRect(x1 - 2, 0, 4, ht);
      ctx.beginPath(); ctx.arc(x0, ht - 14, 12, 0, 7); ctx.arc(x1, ht - 14, 12, 0, 7); ctx.fill();
      if (playAt >= 0) { ctx.fillStyle = css.getPropertyValue('--gold') || '#c99a2e'; ctx.fillRect((playAt / dur()) * w - 1, 0, 3, ht); }
      info.textContent = `Total ${fmt(dur())} · selección ${fmt(sel[0])} → ${fmt(sel[1])}`;
    }

    // Drag whichever selection edge is nearer the finger.
    let edge = -1;
    const tAt = (e) => { const r = canvas.getBoundingClientRect(); return Math.min(dur(), Math.max(0, ((e.clientX - r.left) / r.width) * dur())); };
    canvas.addEventListener('pointerdown', (e) => { if (!data) return; const t = tAt(e); edge = Math.abs(t - sel[0]) <= Math.abs(t - sel[1]) ? 0 : 1; sel[edge] = t; canvas.setPointerCapture(e.pointerId); draw(); });
    canvas.addEventListener('pointermove', (e) => { if (edge < 0) return; sel[edge] = tAt(e); if (sel[0] > sel[1]) { sel.reverse(); edge = 1 - edge; } draw(); });
    canvas.addEventListener('pointerup', () => { edge = -1; });

    const push = () => { undo.push({ data, sel: [...sel], gain }); if (undo.length > 20) undo.shift(); };
    const idx = (t) => Math.round(t * RATE);
    function stop() { if (player) { player.pause(); player = null; } cancelAnimationFrame(raf); draw(); }
    function play(from, to) {
      stop();
      const a = Math.max(0, from), b = to > from + 0.02 ? to : dur();
      const part = data.slice(idx(a), idx(b)).map((v) => Math.max(-1, Math.min(1, v * gain)));
      player = new Audio(URL.createObjectURL(pcmToWav(part, RATE)));
      const t0 = performance.now();
      const tick = () => { if (!player) return; draw(a + ((performance.now() - t0) / 1000)); if (!player.ended) raf = requestAnimationFrame(tick); else stop(); };
      player.play().then(() => { raf = requestAnimationFrame(tick); }).catch(() => {});
    }
    const btn = (label, fn, cls = 'pill') => { const b = h('button', { type: 'button', class: cls, style: 'min-height:40px;font-size:13px' }, label); b.onclick = fn; return b; };
    const hasSel = () => sel[1] - sel[0] > 0.05;

    const actions = h('div', { class: 'row wrap', style: 'gap:6px' },
      btn('▶ Todo', () => play(0, dur())),
      btn('▶ Selección', () => (hasSel() ? play(sel[0], sel[1]) : toast('Marcá una parte primero'))),
      btn('■', stop),
      btn('✂ Quedarme con la selección', () => { if (!hasSel()) return toast('Marcá una parte primero'); push(); data = data.slice(idx(sel[0]), idx(sel[1])); sel = [0, dur()]; draw(); }),
      btn('🗑 Borrar la selección', () => { if (!hasSel()) return toast('Marcá una parte primero'); push(); const a = idx(sel[0]), b = idx(sel[1]); const out = new Float32Array(data.length - (b - a)); out.set(data.subarray(0, a)); out.set(data.subarray(b), a); data = out; sel = [sel[0], sel[0]]; draw(); }),
      btn('✨ Quitar silencios', () => { push(); const th = 0.02; let a = 0, b = data.length - 1; while (a < b && Math.abs(data[a]) < th) a++; while (b > a && Math.abs(data[b]) < th) b--; data = data.slice(Math.max(0, a - RATE * 0.08), Math.min(data.length, b + RATE * 0.12)); sel = [0, dur()]; draw(); }),
      btn('↶ Deshacer', () => { const u = undo.pop(); if (!u) return; ({ data, gain } = u); sel = u.sel; vol.value = String(gain); volLbl.textContent = `${Math.round(gain * 100)}%`; draw(); }));

    // Joining: another file, or a new recording, goes on the end.
    const file = h('input', { type: 'file', accept: 'audio/*', hidden: true });
    const append = async (b) => { try { const more = await toMono(b); push(); const out = new Float32Array(data.length + more.length); out.set(data); out.set(more, data.length); data = out; sel = [dur() - more.length / RATE, dur()]; draw(); toast('Clip agregado al final'); } catch { toast('No pude leer ese audio'); } };
    file.onchange = () => { if (file.files[0]) append(file.files[0]); file.value = ''; };
    const rec = new Recorder();
    const recBtn = btn('● Grabar y unir', async () => {
      if (rec.recording) { recBtn.textContent = '● Grabar y unir'; append(await rec.stop()); return; }
      stop(); try { await rec.start(); recBtn.textContent = '■ Parar'; } catch { toast('Necesito permiso para el micrófono'); }
    });

    vol.oninput = () => { gain = Number(vol.value); volLbl.textContent = `${Math.round(gain * 100)}%`; draw(); };
    vol.onchange = () => push();
    const norm = btn('Normalizar', () => { let top = 0; for (const v of data) top = Math.max(top, Math.abs(v)); if (!top) return; push(); gain = Math.min(3, 0.95 / top); vol.value = String(gain); volLbl.textContent = `${Math.round(gain * 100)}%`; draw(); });

    const done = (v) => { stop(); if (rec.recording) rec.stop(); close(); resolve(v); };
    const save = btn('Guardar audio', () => done(pcmToWav(data.map((v) => Math.max(-1, Math.min(1, v * gain))), RATE)), 'btn');
    save.style.flex = '1';
    const cancel = btn('Cancelar', () => done(null), 'btn ghost');
    cancel.style.flex = '1';

    sheet.append(h('div', { class: 'between' }, h('b', {}, 'Editar audio'), info), canvas,
      h('p', { class: 'muted small' }, 'Tocá o arrastrá sobre la onda para mover el inicio y el final de la selección.'),
      actions,
      h('span', { class: 'kicker' }, 'VOLUMEN'), h('div', { class: 'row', style: 'gap:8px' }, vol, volLbl, norm),
      h('span', { class: 'kicker' }, 'UNIR'), h('div', { class: 'row wrap', style: 'gap:6px' }, btn('+ Agregar archivo', () => file.click()), recBtn, file),
      h('div', { class: 'row', style: 'gap:10px' }, cancel, save));

    toMono(blob).then((d) => { data = d; sel = [0, dur()]; draw(); }).catch(() => { info.textContent = 'No pude leer este audio.'; });
  });
}

// Start and end markers on a long recording. Nothing is copied: the card keeps pointing at the episode.
export function openMarkerEditor(src) {
  return new Promise(async (resolve) => {
    const rec = await db.get(src.kind === 'song' ? 'songs' : 'epaudio', src.id);
    if (!rec) { toast('No encuentro el audio del episodio'); resolve(null); return; }
    const { sheet, close } = overlay();
    const url = URL.createObjectURL(rec.blob);
    const audio = new Audio(url);
    let s = src.s, e = src.e, timer = 0;
    const lbl = h('b', { style: 'font-variant-numeric:tabular-nums;font-size:18px' });
    const paint = () => { lbl.textContent = `${fmt(s)} → ${fmt(e)}  (${(e - s).toFixed(1)} s)`; };
    const playPart = (a, b) => { clearTimeout(timer); audio.currentTime = Math.max(0, a); audio.play().catch(() => {}); timer = setTimeout(() => audio.pause(), (b - a) * 1000 + 150); };
    const nudge = (which, d) => { if (which === 's') s = Math.max(0, Math.min(e - 0.3, s + d)); else e = Math.max(s + 0.3, e + d); paint(); if (which === 's') playPart(s, Math.min(e, s + 1.5)); else playPart(Math.max(s, e - 1.5), e); };
    const row = (which, title) => h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, h('span', { class: 'kicker' }, title),
      h('div', { class: 'row wrap', style: 'gap:6px' }, ...[-1, -0.25, 0.25, 1].map((d) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, `${d > 0 ? '+' : '−'}${Math.abs(d)} s`); b.onclick = () => nudge(which, d); return b; })));
    const play = h('button', { type: 'button', class: 'pill', style: 'min-height:44px' }, '▶ Escuchar el fragmento');
    play.onclick = () => playPart(s, e);
    const done = (v) => { clearTimeout(timer); audio.pause(); URL.revokeObjectURL(url); close(); resolve(v); };
    const ok = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, 'Guardar marcas'); ok.onclick = () => done({ s: Math.round(s * 100) / 100, e: Math.round(e * 100) / 100 });
    const cancel = h('button', { type: 'button', class: 'btn ghost', style: 'flex:1' }, 'Cancelar'); cancel.onclick = () => done(null);
    paint();
    sheet.append(h('b', {}, 'Marcas del fragmento'), h('p', { class: 'muted small' }, 'El audio sigue en el episodio: solo cambian el inicio y el final.'), lbl, play, row('s', 'INICIO'), row('e', 'FINAL'), h('div', { class: 'row', style: 'gap:10px' }, cancel, ok));
  });
}
