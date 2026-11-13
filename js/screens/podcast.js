// Podcast (ArgenTalk): episodes with a word-timed transcript that follows the audio.
import { h, iconEl, toast } from '../ui.js';
import { readTabs } from './leer.js';
import { db, persist } from '../db.js';
import { importPack, positions, savePosition, segmentAt } from '../podcast.js';
import { showWordPanel } from '../wordpanel.js';
import { transcribe } from '../ipa.js';
import { log } from '../progress.js';

let openEp = null;
const SPEEDS = [0.75, 0.9, 1, 1.25];
const PREF = 'cadencia.podcast.prefs';
const prefs = () => { try { return { speed: 1, tap: 'ir', ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { speed: 1, tap: 'ir' }; } };
const setPref = (p) => { const v = { ...prefs(), ...p }; try { localStorage.setItem(PREF, JSON.stringify(v)); } catch { /* ignore */ } return v; };
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const h_ = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h_ ? `${h_}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const clean = (w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

export async function render(main) {
  main.append(h('div', { class: 'between' }, readTabs('podcast')));
  const eps = (await db.all('episodes')).sort((a, b) => a.show.localeCompare(b.show) || a.n - b.n);
  const ep = openEp && eps.find((e) => e.id === openEp);
  if (ep) return episodeView(main, ep);
  openEp = null;
  return listView(main, eps);
}

export function importCard() {
  const status = h('p', { class: 'small', role: 'status' });
  const input = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed,application/x-zip,application/octet-stream', id: 'podpack', hidden: true });
  const btn = h('label', { for: 'podpack', class: 'btn', role: 'button', tabindex: '0' }, 'Importar paquete');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Leyendo el paquete…';
    try {
      await persist();
      const r = await importPack(file, (d, t) => { status.textContent = `Importando… ${d} de ${t}`; });
      toast(r.kind === 'podcast' ? `${r.n} episodios importados` : r.kind === 'songs' ? `${r.n} canciones importadas` : `${r.n} clips importados`);
      window.dispatchEvent(new Event('cadencia:rerender'));
    } catch (err) { status.textContent = 'No se pudo importar: ' + (err.message || err); }
    input.value = '';
  };
  return h('section', { class: 'card', style: 'gap:8px' }, input, btn, status);
}

function listView(main, eps) {
  if (!eps.length) {
    main.append(h('section', { class: 'card empty' },
      h('h2', {}, 'Todavía no hay episodios'),
      h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Prepará los episodios en la computadora con prepare_podcast.py y después importá cada archivo argentalk-1.zip, argentalk-2.zip… acá o en Perfil.')),
    importCard());
    return () => {};
  }
  const pos = positions();
  const done = eps.filter((e) => pos[e.id] && pos[e.id].done).length;
  main.append(h('div', { class: 'between' }, h('h1', { style: 'font-size:26px' }, eps[0].show), h('span', { class: 'muted small' }, `${done} de ${eps.length} escuchados`)));
  const search = h('input', { type: 'search', placeholder: 'Buscar en las transcripciones…', 'aria-label': 'Buscar', autocomplete: 'off',
    style: 'min-height:48px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:16px;width:100%' });
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...eps.filter((e) => !q || e.title.toLowerCase().includes(q) || e.segments.some((s) => s.t.toLowerCase().includes(q))).map((e) => {
      const p = pos[e.id] || {};
      const frac = e.duration ? Math.min(1, (p.t || 0) / e.duration) : 0;
      const b = h('button', { type: 'button', class: 'card', style: 'text-align:left;cursor:pointer;font:inherit;color:inherit;gap:6px;padding:12px 14px' },
        h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' },
          h('b', { style: 'font-family:var(--display);font-size:17px;line-height:1.25' }, e.title),
          h('span', { class: 'muted small', style: 'white-space:nowrap' }, p.done ? '✓' : clock(e.duration))),
        frac > 0.01 && !p.done ? h('div', { class: 'progress' }, h('div', { style: `width:${frac * 100}%` })) : '');
      b.onclick = () => { openEp = e.id; window.dispatchEvent(new Event('cadencia:rerender')); };
      return b;
    }));
  };
  search.oninput = draw;
  draw();
  main.append(search, list, h('details', { style: 'margin-top:8px' }, h('summary', { class: 'muted small' }, 'Importar otro paquete'), importCard()));
  return () => {};
}

function episodeView(main, ep) {
  let p = prefs();
  const segs = ep.segments;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.preservesPitch = true;
  let url = null;

  // --- Header and transcript
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Episodios');
  back.onclick = () => { openEp = null; window.dispatchEvent(new Event('cadencia:rerender')); };
  const tapBtns = [['ir', '▶ Ir ahí'], ['buscar', '📖 Significado']].map(([k, l]) => h('button', { type: 'button', class: 'pill', style: 'min-height:34px;border:none;font-size:12px', 'aria-pressed': String(p.tap === k) }, l));
  tapBtns.forEach((b, i) => { b.onclick = () => { p = setPref({ tap: i ? 'buscar' : 'ir' }); tapBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); }; });
  const panel = h('section', { class: 'hero', 'aria-label': 'Palabra seleccionada', 'aria-live': 'polite', hidden: true, style: 'padding:16px 18px;gap:10px' });
  const transcript = h('article', { class: 'card', style: 'gap:2px;padding:14px 12px' });
  const segEls = [], wordEls = [];
  segs.forEach((s, i) => {
    const time = h('button', { type: 'button', 'aria-label': `Escuchar desde ${clock(s.s)}`, style: 'border:none;background:none;color:var(--muted);font:inherit;font-size:11px;font-weight:700;padding:2px 6px 0 0;min-width:38px;text-align:left;cursor:pointer;font-variant-numeric:tabular-nums' }, clock(s.s));
    time.onclick = () => { seek(s.s); play(); };
    const words = h('p', { style: 'font-size:17px;line-height:1.6;flex:1', lang: 'es-AR' });
    const ws = s.w && s.w.length ? s.w : [[s.t, s.s, s.e]];
    wordEls[i] = ws.map(([w, a], k) => {
      const span = h('span', { style: 'border-radius:4px;cursor:pointer;padding:0 1px' }, w);
      span.onclick = () => {
        if (p.tap === 'ir') { seek(a); play(); return; }
        const word = clean(w);
        if (word) { showWordPanel(panel, word, { context: s.t, tag: '#ArgenTalk' }); panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      };
      if (k) words.append(' ');
      words.append(span);
      return span;
    });
    const row = h('div', { style: 'display:flex;gap:4px;align-items:flex-start;padding:6px 6px;border-radius:10px;transition:background .15s' }, time, words);
    segEls[i] = row;
    transcript.append(row);
  });

  // --- Controls (stay at the bottom while you scroll)
  const playBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Reproducir', style: 'width:56px;height:56px' }, iconEl('play'));
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Frase anterior' }, iconEl('prev'));
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Frase siguiente' }, iconEl('next'));
  const speedBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:13px;min-width:58px' }, `${p.speed}x`);
  const loopBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:12px', 'aria-pressed': 'false' }, '🔁 Frase');
  const saveBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:12px' }, '+ Penumbra');
  const timeEl = h('span', { class: 'muted small', style: 'font-variant-numeric:tabular-nums;white-space:nowrap' }, `0:00 / ${clock(ep.duration)}`);
  const bar = h('input', { type: 'range', min: '0', max: String(Math.round(ep.duration || 1)), step: '1', value: '0', 'aria-label': 'Posición', style: 'width:100%;accent-color:var(--accent)' });
  const controls = h('section', { class: 'card', style: 'position:sticky;bottom:calc(env(safe-area-inset-bottom) + 80px);z-index:5;gap:6px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.12)' },
    bar,
    h('div', { class: 'between', style: 'flex-wrap:nowrap;gap:6px' }, timeEl,
      h('div', { class: 'row', style: 'gap:2px;flex-wrap:nowrap;align-items:center' }, prevBtn, playBtn, nextBtn)),
    h('div', { class: 'row', style: 'gap:6px;justify-content:center' }, speedBtn, loopBtn, saveBtn));

  main.append(
    h('div', { class: 'between' }, back, h('div', { class: 'seg', role: 'group', 'aria-label': 'Al tocar una palabra' }, tapBtns)),
    h('h1', { style: 'font-size:22px;line-height:1.25' }, ep.title),
    transcript, panel, controls);

  // --- Playback
  let loop = false, cur = -1, curWord = null, raf = 0, lastSave = 0, userScroll = 0;
  const seek = (t) => { audio.currentTime = Math.max(0, t); paint(true); };
  const play = () => { audio.play().catch(() => {}); };
  const setRate = () => { audio.playbackRate = p.speed; audio.defaultPlaybackRate = p.speed; };
  (async () => {
    const rec = await db.get('epaudio', ep.id);
    if (!rec) { toast('No encuentro el audio de este episodio. Importá el paquete de nuevo.'); return; }
    url = URL.createObjectURL(rec.blob);
    audio.src = url;
    setRate();
    const saved = positions()[ep.id];
    if (saved && saved.t && !saved.done) audio.currentTime = saved.t;
  })();

  function paint(force) {
    const t = audio.currentTime;
    const i = segmentAt(segs, t);
    if (i !== cur || force) {
      if (cur >= 0 && segEls[cur]) segEls[cur].style.background = '';
      cur = i;
      if (cur >= 0 && segEls[cur]) {
        segEls[cur].style.background = 'var(--chip)';
        if (Date.now() - userScroll > 4000) segEls[cur].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    // Current word
    let w = null;
    if (cur >= 0) {
      const ws = segs[cur].w || [];
      for (let k = ws.length - 1; k >= 0; k--) if (ws[k][1] <= t) { w = wordEls[cur][k]; break; }
    }
    if (w !== curWord) {
      if (curWord) { curWord.style.background = ''; curWord.style.color = ''; }
      curWord = w;
      if (curWord) { curWord.style.background = 'var(--sel)'; curWord.style.color = 'var(--sel-ink)'; }
    }
    // Loop the current sentence
    if (loop && cur >= 0 && t >= segs[cur].e) audio.currentTime = segs[cur].s;
    timeEl.textContent = `${clock(t)} / ${clock(ep.duration || audio.duration)}`;
    if (document.activeElement !== bar) bar.value = String(Math.round(t));
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); savePosition(ep.id, t, ep.duration || audio.duration); }
  }
  const tick = () => { paint(); raf = requestAnimationFrame(tick); };
  audio.onplay = () => { playBtn.replaceChildren(iconEl('stop')); playBtn.setAttribute('aria-label', 'Pausa'); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
  audio.onpause = () => { playBtn.replaceChildren(iconEl('play')); playBtn.setAttribute('aria-label', 'Reproducir'); cancelAnimationFrame(raf); paint(); savePosition(ep.id, audio.currentTime, ep.duration); };
  audio.onended = () => { savePosition(ep.id, ep.duration, ep.duration); log('podcast', { id: ep.id, done: true }); };
  playBtn.onclick = () => (audio.paused ? play() : audio.pause());
  prevBtn.onclick = () => { const i = Math.max(0, (audio.currentTime - (cur >= 0 ? segs[cur].s : 0) > 1.5 ? cur : cur - 1)); if (segs[i]) seek(segs[i].s); };
  nextBtn.onclick = () => { if (segs[cur + 1]) seek(segs[cur + 1].s); };
  speedBtn.onclick = () => { p = setPref({ speed: SPEEDS[(SPEEDS.indexOf(p.speed) + 1) % SPEEDS.length] }); speedBtn.textContent = `${p.speed}x`; setRate(); };
  loopBtn.onclick = () => { loop = !loop; loopBtn.setAttribute('aria-pressed', String(loop)); };
  saveBtn.onclick = async () => {
    const s = segs[Math.max(0, cur)];
    if (!s) return;
    await db.put('mazo', { front: s.t, ipa: transcribe(s.t), back: `${ep.show} · ${ep.title} · ${clock(s.s)}`, tag: '#ArgenTalk', created: Date.now(),
      source: { kind: 'podcast', id: ep.id, s: s.s, e: s.e, label: `${ep.title} · ${clock(s.s)}` } });
    toast('Guardada en Penumbra');
  };
  bar.oninput = () => { audio.currentTime = Number(bar.value); paint(true); };
  const markScroll = () => { userScroll = Date.now(); };
  window.addEventListener('touchmove', markScroll, { passive: true });
  window.addEventListener('wheel', markScroll, { passive: true });
  log('podcast', { id: ep.id, open: true });

  return () => {
    savePosition(ep.id, audio.currentTime, ep.duration);
    cancelAnimationFrame(raf);
    audio.pause(); audio.removeAttribute('src');
    if (url) URL.revokeObjectURL(url);
    window.removeEventListener('touchmove', markScroll);
    window.removeEventListener('wheel', markScroll);
  };
}
