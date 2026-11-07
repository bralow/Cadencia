// Tarjeta del día: one short culture card per day, read, heard in Flor's voice, and answered.
import { h, iconEl, toast } from '../ui.js';
import { CARDS } from '../culturadata.js';
import { tappableText, markWord, showWordPanel, sentenceWith } from '../wordpanel.js';
import { florClip, florReady } from '../florvoz.js';
import { Player } from '../audio.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { log } from '../progress.js';

const START = 'cadencia.cultura.start';
const DAY = 86400000;
const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Card 1 is the day you first open it; one new card each day after that.
export function dayNumber() {
  let start = Number(localStorage.getItem(START));
  if (!start) { start = midnight(Date.now()); try { localStorage.setItem(START, String(start)); } catch { /* ignore */ } }
  return Math.round((midnight(Date.now()) - start) / DAY);
}
export const cardFor = (n) => CARDS[((n % CARDS.length) + CARDS.length) % CARDS.length];
const dateFor = (n) => midnight(Date.now()) - (dayNumber() - n) * DAY;
const fmt = (t) => new Date(t).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

// Hands a question to Diario or Escribir, which pick it up as their prompt.
export function answerIn(route, q) {
  try { localStorage.setItem('cadencia.handoff', JSON.stringify({ prompt: q, at: Date.now() })); } catch { /* ignore */ }
  location.hash = route;
}
export function takeHandoff() {
  try {
    const v = JSON.parse(localStorage.getItem('cadencia.handoff') || 'null');
    localStorage.removeItem('cadencia.handoff');
    return v && Date.now() - v.at < 10 * 60000 ? v.prompt : null;
  } catch { return null; }
}

let showing = null; // card number open on this screen

export async function render(main) {
  const today = dayNumber();
  if (showing === null || showing > today) showing = today;
  const n = showing;
  const c = cardFor(n);

  const panel = h('section', { class: 'hero', 'aria-label': 'Palabra seleccionada', 'aria-live': 'polite', hidden: true, style: 'padding:16px 18px;gap:10px' });
  const body = tappableText(c.text, (word, b) => { markWord(body, b); showWordPanel(panel, word, { context: sentenceWith(c.text, word), tag: '#Cultura' }); }, 'font-size:18px;line-height:1.6');

  const player = new Player();
  const listen = h('button', { type: 'button', class: 'pill', style: 'min-height:40px', disabled: !florReady() }, '▶ Escuchar a Flor');
  player.el.onended = player.el.onpause = () => { listen.textContent = '▶ Escuchar a Flor'; };
  listen.onclick = async () => {
    if (player.playing) { player.pause(); return; }
    listen.textContent = '…';
    try {
      if (!player.el.src) player.load(await florClip(`${c.title}. ${c.text}`));
      listen.textContent = '■ Parar';
      await player.play();
    } catch (err) { listen.textContent = '▶ Escuchar a Flor'; toast('Sin voz: ' + (err.message || err)); }
  };
  const keep = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Guardar palabras');
  keep.onclick = async () => {
    for (const [w, gloss] of c.vocab) await db.put('mazo', { front: w, ipa: transcribe(w), back: `${gloss} · ${c.title}`, tag: '#Cultura', created: Date.now() });
    toast(`${c.vocab.length} palabras al Mazo`); keep.disabled = true;
  };

  const speakBtn = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, '🎙 Hablando');
  const writeBtn = h('button', { type: 'button', class: 'btn ghost', style: 'flex:1' }, '✎ Escribiendo');
  speakBtn.onclick = () => answerIn('#/diario', c.q);
  writeBtn.onclick = () => answerIn('#/escribir', c.q);

  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tarjeta anterior', disabled: n === 0 }, iconEl('prev'));
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tarjeta siguiente', disabled: n >= today }, iconEl('next'));
  prev.onclick = () => { showing = n - 1; window.dispatchEvent(new Event('cadencia:rerender')); };
  next.onclick = () => { showing = n + 1; window.dispatchEvent(new Event('cadencia:rerender')); };

  main.append(
    h('div', { class: 'between' },
      h('a', { href: '#/hoy', class: 'pill', style: 'text-decoration:none;display:flex;align-items:center' }, '← Hoy'),
      h('div', { class: 'row', style: 'gap:0' }, prev, h('span', { class: 'muted small' }, n === today ? 'Hoy' : `Día ${n + 1}`), next)),
    h('section', { class: 'card', style: 'gap:10px' },
      h('div', { class: 'between' }, h('span', { class: 'kicker' }, c.cat.toUpperCase()), h('span', { class: 'muted small' }, fmt(dateFor(n)))),
      h('h1', { style: 'font-size:28px' }, c.title),
      body,
      h('div', { class: 'row wrap', style: 'gap:6px' }, listen, keep)),
    panel,
    h('section', { class: 'card', style: 'gap:8px' },
      h('span', { class: 'kicker' }, 'PALABRAS'),
      ...c.vocab.map(([w, gloss]) => h('div', { style: 'display:flex;flex-direction:column' }, h('b', {}, w), h('span', { class: 'muted small' }, gloss)))),
    h('section', { class: 'card', style: 'gap:10px' },
      h('span', { class: 'kicker' }, 'TU TURNO · CONTESTÁ'),
      h('p', { style: 'font-size:17px;line-height:1.4;font-family:var(--display)' }, c.q),
      h('div', { class: 'row', style: 'gap:8px' }, speakBtn, writeBtn)),
    h('p', { class: 'muted small', style: 'text-align:center' }, 'Tocá cualquier palabra del texto para ver su significado y su IPA.'));

  log('cultura', { n });
  return () => { player.load(null); };
}
