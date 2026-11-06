import { h, iconEl, toast, shuffle } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { Player, Recorder } from '../audio.js';

// An s or z at the end of a syllable before a consonant (same word or next word) is aspirated: [h].
const SPOT = /[sz](?=\s*[bcdfgjklmnñpqrtvxyBCDFGJKLMNÑPQRTVXY])/g;
const SPEEDS = ['1', '1.25', '1.5'];
let queue = null, qi = 0, speed = '1.25';

export async function render(main) {
  main.append(h('div', { class: 'between' }, practiceTabs('elision')));
  const clips = await db.all('clips');
  if (!clips.length) {
    main.append(h('section', { class: 'card empty' }, h('h2', {}, 'Faltan los clips'),
      h('p', { class: 'muted small' }, 'Elisión usa las frases de OpenSLR. Importá el paquete en Perfil.'),
      h('a', { class: 'btn', href: '#/perfil', style: 'align-self:center' }, 'Ir a Perfil')));
    return () => {};
  }
  // Sentences with at least two aspiration spots, most first.
  const rich = clips.map((c) => ({ c, n: (c.text.match(SPOT) || []).length })).filter((x) => x.n >= 2);
  const byId = new Map(clips.map((c) => [c.id, c]));
  if (!queue || !queue.every((id) => byId.has(id))) { queue = shuffle(rich.sort((a, b) => b.n - a.n).slice(0, 60).map((x) => x.c.id)); qi = 0; }

  main.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'En Buenos Aires la s antes de consonante casi no suena: se aspira, como una h suave (e[h]tá, lo[h] pibe[h]). Escuchá las marcas y probá a velocidad de calle.'));
  const counter = h('span', { class: 'muted', style: 'font-size:14px;font-weight:600' });
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Siguiente frase' }, iconEl('next'));
  const textEl = h('p', { style: 'font-family:var(--display);font-size:22px;line-height:1.55;font-weight:600', lang: 'es-AR' });
  const ipaEl = h('p', { class: 'ipa' });
  const spots = h('span', { class: 'chip solid' });
  main.append(h('section', { class: 'card', style: 'gap:10px' }, h('div', { class: 'between' }, spots, h('div', { class: 'row', style: 'gap:0' }, counter, nextBtn)), textEl, ipaEl));

  const speedBtns = SPEEDS.map((v) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(v === speed) }, v === '1' ? '1.0x' : `${v}x`));
  main.append(h('div', { class: 'between' }, h('span', { class: 'muted small', style: 'font-weight:600' }, 'Velocidad de calle'), h('div', { class: 'row', role: 'group', 'aria-label': 'Velocidad', style: 'gap:6px' }, speedBtns)));

  const playBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Escuchar' }, iconEl('play'));
  const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabar tu voz' }, iconEl('mic'));
  const recLabel = h('span', { style: 'font-weight:700;color:var(--accent)' }, 'Grabar');
  const mineBtn = h('button', { type: 'button', class: 'round user', 'aria-label': 'Escuchar mi voz', disabled: true }, iconEl('play'));
  const loopBtn = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false' }, 'Bucle');
  main.append(h('div', { class: 'controls' },
    h('div', { class: 'control' }, playBtn, h('span', {}, 'Escuchar')),
    h('div', { class: 'control' }, recBtn, recLabel),
    h('div', { class: 'control' }, mineBtn, h('span', {}, 'Mi voz'))),
  h('div', { class: 'row', style: 'justify-content:center' }, loopBtn));

  const native = new Player(), mine = new Player(), recorder = new Recorder();
  let autoStop = 0;
  const setRate = () => { native.rate = parseFloat(speed); };
  speedBtns.forEach((b, i) => { b.onclick = () => { speed = SPEEDS[i]; speedBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); setRate(); }; });

  async function load() {
    native.pause(); mine.load(null); mineBtn.disabled = true;
    if (!queue.length) { textEl.textContent = 'No encontré frases con s aspirada en tus clips.'; return; }
    const c = byId.get(queue[qi % queue.length]);
    counter.textContent = `${(qi % queue.length) + 1} / ${queue.length}`;
    const n = (c.text.match(SPOT) || []).length;
    spots.textContent = `${n} s aspirada${n === 1 ? '' : 's'}`;
    const parts = []; let last = 0;
    for (const m of c.text.matchAll(SPOT)) {
      parts.push(c.text.slice(last, m.index));
      parts.push(h('span', { style: 'color:var(--accent);text-decoration:underline wavy;text-underline-offset:5px' }, m[0], h('sup', { style: 'font-size:12px;font-family:var(--ipa-font)' }, 'h')));
      last = m.index + 1;
    }
    parts.push(c.text.slice(last));
    textEl.replaceChildren(...parts);
    ipaEl.textContent = transcribe(c.text);
    native.load(await db.audioFor(c.id)); setRate();
  }

  playBtn.onclick = () => { if (native.playing) { native.pause(); playBtn.replaceChildren(iconEl('play')); } else { mine.pause(); native.play(); playBtn.replaceChildren(iconEl('pause')); } };
  native.el.onended = () => playBtn.replaceChildren(iconEl('play'));
  loopBtn.onclick = () => { const on = loopBtn.getAttribute('aria-pressed') !== 'true'; loopBtn.setAttribute('aria-pressed', String(on)); native.loop = on; };
  mineBtn.onclick = () => { native.pause(); playBtn.replaceChildren(iconEl('play')); mine.play(); };
  async function stopRec() {
    clearTimeout(autoStop);
    const blob = await recorder.stop();
    recBtn.classList.remove('live'); recBtn.replaceChildren(iconEl('mic')); recLabel.textContent = 'Grabar';
    if (blob && blob.size) { mine.load(blob); mineBtn.disabled = false; }
  }
  recBtn.onclick = async () => {
    if (recorder.recording) { await stopRec(); return; }
    native.pause(); playBtn.replaceChildren(iconEl('play'));
    try { await recorder.start(); } catch { toast('Necesito permiso para usar el micrófono'); return; }
    recBtn.classList.add('live'); recBtn.replaceChildren(iconEl('stop')); recLabel.textContent = 'Detener';
    const dur = isFinite(native.el.duration) ? native.el.duration : 5;
    autoStop = setTimeout(() => { if (recorder.recording) stopRec(); }, Math.min(20000, (dur * 2 + 1.5) * 1000));
  };
  nextBtn.onclick = () => { qi++; load(); };

  await load();
  return () => { clearTimeout(autoStop); if (recorder.recording) recorder.stop(); native.load(null); mine.load(null); };
}
