// Canciones: songs cut from recordings you have (tools/prepare_songs.py). Listen, with the lyrics in sync
// when the pack has them (from .srt files or Whisper). No translations.
import { h, iconEl } from '../ui.js';
import { readTabs } from './leer.js';
import { importCard } from './podcast.js';
import { db } from '../db.js';
import { log } from '../progress.js';
import { toast } from '../ui.js';
import { transcribe } from '../ipa.js';

const PREF = 'cadencia.canciones';
const prefs = () => { try { return { mode: 'todas', ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { mode: 'todas' }; } };
const setPref = (p) => { const v = { ...prefs(), ...p }; try { localStorage.setItem(PREF, JSON.stringify(v)); } catch { /* ignore */ } return v; };
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const MODES = [['todas', '▶ Todas'], ['una', '🔂 Repetir'], ['mezcla', '🔀 Mezclar']];

export async function render(main) {
  main.append(h('div', { class: 'between' }, readTabs('canciones')));
  const songs = (await db.all('songs')).sort((a, b) => a.show.localeCompare(b.show) || a.n - b.n);
  if (!songs.length) {
    main.append(h('section', { class: 'card empty' },
      h('h2', {}, 'Todavía no hay canciones'),
      h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Prepará las canciones en la computadora con prepare_songs.py y después importá cada canciones-1.zip, canciones-2.zip… acá o en Perfil.')),
    importCard());
    return () => {};
  }

  let p = prefs(), cur = -1, url = null;
  const audio = new Audio();
  audio.preload = 'auto';

  const search = h('input', { type: 'search', placeholder: 'Buscar una canción…', 'aria-label': 'Buscar', autocomplete: 'off',
    style: 'min-height:48px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:16px;width:100%' });
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:6px' });
  const rows = songs.map((s, i) => {
    const b = h('button', { type: 'button', class: 'card', style: 'flex-direction:row;align-items:center;gap:12px;text-align:left;cursor:pointer;font:inherit;color:inherit;padding:10px 14px' },
      h('span', { class: 'muted small', style: 'min-width:22px;font-variant-numeric:tabular-nums' }, String(i + 1)),
      h('span', { style: 'flex:1;font-family:var(--display);font-size:17px;line-height:1.25' }, s.title),
      h('span', { class: 'muted small' }, clock(s.duration)));
    b.onclick = () => (i === cur && !audio.paused ? audio.pause() : start(i));
    return b;
  });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...rows.filter((_, i) => !q || songs[i].title.toLowerCase().includes(q)));
  };
  search.oninput = draw;

  const nowTitle = h('b', { style: 'font-family:var(--display);font-size:17px;line-height:1.2;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, 'Elegí una canción');
  const timeEl = h('span', { class: 'muted small', style: 'font-variant-numeric:tabular-nums' }, '0:00');
  const bar = h('input', { type: 'range', min: '0', max: '1', step: '1', value: '0', 'aria-label': 'Posición', style: 'width:100%;accent-color:var(--accent)' });
  const playBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Reproducir', style: 'width:52px;height:52px' }, iconEl('play'));
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Anterior' }, iconEl('prev'));
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Siguiente' }, iconEl('next'));
  const modeBtns = MODES.map(([k, l]) => h('button', { type: 'button', class: 'pill', style: 'min-height:34px;border:none;font-size:12px;white-space:nowrap', 'aria-pressed': String(p.mode === k) }, l));
  modeBtns.forEach((b, i) => { b.onclick = () => { p = setPref({ mode: MODES[i][0] }); modeBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); }; });
  const player = h('section', { class: 'card', style: 'position:sticky;bottom:calc(env(safe-area-inset-bottom) + 80px);z-index:5;gap:6px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.12)' },
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap;align-items:center' }, nowTitle, timeEl),
    bar,
    h('div', { class: 'row', style: 'gap:18px;flex-wrap:nowrap;align-items:center;justify-content:center' }, prevBtn, playBtn, nextBtn),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo', style: 'align-self:center' }, modeBtns));

  // Lyrics in sync with the song: the current line lights up; tap a line to jump there.
  const lyr = h('section', { class: 'card', 'aria-label': 'Letra', hidden: true, style: 'gap:2px;padding:12px 10px;max-height:46vh;overflow-y:auto' });
  const saveLine = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, '+ Penumbra');
  const lyrHead = h('div', { class: 'between', hidden: true }, h('span', { class: 'kicker' }, 'LETRA'), saveLine);
  let lineEls = [], curLine = -1;
  function showLyrics(s) {
    curLine = -1;
    const lines = s.lines || [];
    lyr.hidden = lyrHead.hidden = !lines.length;
    lineEls = lines.map((ln, k) => {
      const el = h('button', { type: 'button', lang: 'es-AR', style: 'all:unset;display:block;cursor:pointer;padding:6px 8px;border-radius:10px;font-size:18px;line-height:1.45;transition:background .15s' }, ln.t);
      el.onclick = () => { audio.currentTime = ln.s; if (audio.paused) audio.play().catch(() => {}); };
      return el;
    });
    lyr.replaceChildren(...lineEls);
  }
  function paintLyrics() {
    const s = songs[cur];
    if (!s || !s.lines || !s.lines.length) return;
    const t = audio.currentTime;
    let k = -1;
    for (let i = 0; i < s.lines.length; i++) if (s.lines[i].s <= t + 0.15) k = i; else break;
    if (k === curLine) return;
    if (curLine >= 0 && lineEls[curLine]) { lineEls[curLine].style.background = ''; lineEls[curLine].style.fontWeight = ''; }
    curLine = k;
    const el = lineEls[k];
    if (el) { el.style.background = 'var(--chip)'; el.style.fontWeight = '700'; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  saveLine.onclick = async () => {
    const s = songs[cur];
    const ln = s && s.lines && s.lines[Math.max(0, curLine)];
    if (!ln) return;
    await db.put('mazo', { front: ln.t, ipa: transcribe(ln.t), back: `${s.show} · ${s.title}`, tag: '#Canciones', created: Date.now(),
      source: { kind: 'song', id: s.id, s: ln.s, e: ln.e, label: `${s.show} · ${s.title}` } });
    toast('Guardado en Penumbra');
  };

  main.append(h('div', { class: 'between' }, h('h1', { style: 'font-size:26px' }, songs[0].show), h('span', { class: 'muted small' }, `${songs.length} ${songs.length === 1 ? "canción" : "canciones"}`)),
    lyrHead, lyr, search, list, h('details', { style: 'margin-top:8px' }, h('summary', { class: 'muted small' }, 'Importar otro paquete'), importCard()), player);
  draw();

  function start(i) {
    cur = (i + songs.length) % songs.length;
    const s = songs[cur];
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(s.blob);
    audio.src = url;
    audio.play().catch(() => {});
    nowTitle.textContent = s.title;
    showLyrics(s);
    bar.max = String(Math.round(s.duration || 1));
    rows.forEach((r, k) => { r.style.borderColor = k === cur ? 'var(--accent)' : ''; r.style.borderWidth = k === cur ? '2px' : ''; });
    log('canciones', { id: s.id });
  }
  const next = (auto) => {
    if (!songs.length) return;
    if (auto && p.mode === 'una') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    if (p.mode === 'mezcla' && songs.length > 1) { let k; do { k = Math.floor(Math.random() * songs.length); } while (k === cur); start(k); return; }
    start(cur + 1);
  };
  audio.onplay = () => { playBtn.replaceChildren(iconEl('stop')); playBtn.setAttribute('aria-label', 'Pausa'); };
  audio.onpause = () => { playBtn.replaceChildren(iconEl('play')); playBtn.setAttribute('aria-label', 'Reproducir'); };
  audio.onended = () => next(true);
  let raf = 0;
  const tick = () => { paintLyrics(); raf = requestAnimationFrame(tick); };
  audio.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
  audio.addEventListener('pause', () => cancelAnimationFrame(raf));
  audio.ontimeupdate = () => { timeEl.textContent = `${clock(audio.currentTime)} / ${clock(songs[cur] ? songs[cur].duration : 0)}`; if (document.activeElement !== bar) bar.value = String(Math.round(audio.currentTime)); };
  bar.oninput = () => { audio.currentTime = Number(bar.value); };
  playBtn.onclick = () => (cur < 0 ? start(0) : audio.paused ? audio.play().catch(() => {}) : audio.pause());
  prevBtn.onclick = () => (audio.currentTime > 3 ? (audio.currentTime = 0) : start(cur - 1));
  nextBtn.onclick = () => next(false);

  return () => { cancelAnimationFrame(raf); audio.pause(); audio.removeAttribute('src'); if (url) URL.revokeObjectURL(url); };
}
