// The review display shared by Escribir and Diario: original vs corrected (word by word),
// a porteño version, Flor reading it, and the list of changes filtered by lens.
import { h, toast } from './ui.js';
import { LENSES, diffWords } from './escribir.js';
import { geminiSpeech } from './gemini.js';
import { unlockAudio, playPcm, stopPcm } from './pcm.js';
import { florVoice } from './florvoz.js';
import { useFlor, phoneSay, stopPhone } from './voz.js';
import { transcribe } from './ipa.js';
import { db } from './db.js';

const lensOf = (id) => LENSES.find((l) => l.id === id) || { id, label: id, color: 'var(--muted)' };

export function diffView(a, b) {
  const p = h('p', { style: 'font-size:17px;line-height:1.7', lang: 'es-AR' });
  for (const seg of diffWords(a, b)) {
    if (p.childNodes.length) p.append(' ');
    if (seg.type === 'same') p.append(seg.text);
    else if (seg.type === 'del') p.append(h('s', { style: 'opacity:.6;background:color-mix(in srgb, var(--muted) 18%, transparent);border-radius:4px;padding:0 2px' }, seg.text));
    else p.append(h('b', { style: 'background:color-mix(in srgb, var(--accent) 22%, transparent);border-radius:4px;padding:0 2px' }, seg.text));
  }
  return p;
}

export function changeCard(c, tag) {
  const l = lensOf(c.lens);
  const keep = h('button', { type: 'button', class: 'pill', style: 'min-height:32px;font-size:11px;align-self:flex-start' }, 'Guardar');
  keep.onclick = async () => {
    await db.put('mazo', { front: c.better, ipa: transcribe(c.better), back: `${c.original ? `En vez de «${c.original}». ` : ''}${c.why || ''}`.trim(), tag, created: Date.now() });
    toast('Guardado en el Mazo'); keep.disabled = true; keep.textContent = '✓ Guardado';
  };
  return h('div', { class: 'card', style: 'gap:4px;padding:10px 12px' },
    h('div', { class: 'row wrap', style: 'gap:6px;align-items:baseline' },
      c.original ? h('s', { style: 'opacity:.7' }, c.original) : '', c.original ? '→' : '', h('b', {}, c.better || '(sacar)'),
      h('span', { style: `font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--chip);color:${l.color}` }, l.label.toUpperCase())),
    c.why ? h('span', { class: 'small muted' }, c.why) : '', keep);
}

// Returns an array of elements. opts: { tag, reuse: (corrected) => void, extra: [elements after the text card] }
export function reviewView(text, r, opts = {}) {
  const tag = opts.tag || '#Escribir';
  let view = 'corrected', lens = 'all';
  const views = [['corrected', 'Corregido'], ...(r.porteno ? [['porteno', 'Como un porteño']] : [])].map(([k, label]) =>
    h('button', { type: 'button', class: 'pill', style: 'min-height:36px;border:none', 'aria-pressed': String(k === view) }, label));
  const textBox = h('div');
  const listen = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '▶ Escuchar');
  const keepAll = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Guardar texto');
  const reuse = opts.reuse ? h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Seguir escribiendo desde acá') : '';
  const target = () => (view === 'porteno' ? r.porteno : r.corrected);
  const paintText = () => {
    views.forEach((b, i) => b.setAttribute('aria-pressed', String((i ? 'porteno' : 'corrected') === view)));
    textBox.replaceChildren(diffView(text, target()));
  };
  views.forEach((b, i) => { b.onclick = () => { view = i ? 'porteno' : 'corrected'; stopPcm(); stopPhone(); listen.textContent = '▶ Escuchar'; paintText(); }; });
  const audio = {};
  listen.onclick = async () => {
    unlockAudio();
    if (listen.textContent.startsWith('■')) { stopPcm(); stopPhone(); listen.textContent = '▶ Escuchar'; return; }
    if (!useFlor()) { listen.textContent = '■ Parar'; await phoneSay(target()); listen.textContent = '▶ Escuchar'; return; }
    listen.textContent = '…';
    try {
      const t = target();
      if (!audio[t]) audio[t] = await geminiSpeech(t, florVoice());
      listen.textContent = '■ Parar';
      await playPcm(audio[t].samples, audio[t].rate);
    } catch (err) { toast('Sin voz: ' + (err.message || err)); }
    listen.textContent = '▶ Escuchar';
  };
  keepAll.onclick = async () => {
    const t = target();
    await db.put('mazo', { front: t, ipa: transcribe(t), back: `Mi versión: ${text}`, tag, created: Date.now() });
    toast('Guardado en el Mazo');
  };
  if (reuse) reuse.onclick = () => opts.reuse(r.corrected);

  const counts = {};
  r.changes.forEach((c) => { counts[c.lens] = (counts[c.lens] || 0) + 1; });
  const lensBtns = [['all', `Todo (${r.changes.length})`], ...LENSES.filter((l) => counts[l.id]).map((l) => [l.id, `${l.label} (${counts[l.id]})`])]
    .map(([id, label]) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px', 'aria-pressed': String(id === lens) }, label); b.dataset.lens = id; return b; });
  const cards = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const paintCards = () => {
    lensBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lens === lens)));
    cards.replaceChildren(...r.changes.filter((c) => lens === 'all' || c.lens === lens).map((c) => changeCard(c, tag)));
  };
  lensBtns.forEach((b) => { b.onclick = () => { lens = b.dataset.lens; paintCards(); }; });
  paintText(); paintCards();

  return [
    h('section', { class: 'card', style: 'gap:10px' },
      opts.heading || '',
      h('div', { class: 'between' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Versión' }, views), r.level ? h('span', { class: 'muted small' }, `Nivel: ${r.level}`) : ''),
      textBox,
      h('div', { class: 'row wrap', style: 'gap:6px' }, listen, keepAll, reuse),
      r.praise ? h('p', { class: 'small' }, '✓ ', r.praise) : ''),
    ...(opts.extra || []),
    r.changes.length
      ? h('section', { style: 'display:flex;flex-direction:column;gap:8px' },
        h('span', { class: 'kicker' }, 'CAMBIOS'), h('div', { class: 'row wrap', style: 'gap:6px' }, lensBtns), cards)
      : h('section', { class: 'card' }, h('p', {}, '¡Impecable! No hay nada que corregir.')),
    r.tip ? h('section', { class: 'card', style: 'gap:4px' }, h('span', { class: 'kicker' }, 'PARA LA PRÓXIMA'), h('p', { class: 'small' }, r.tip)) : '',
  ];
}
