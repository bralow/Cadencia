import { h, iconEl, toast } from './ui.js';
import { analyzeWord } from './ipa.js';
import { db } from './db.js';
import { speak, ttsReady, argentineAudio, cachedArgentineAudio } from './tts.js';

const LETTERS = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/;

export function features(word, ipa) {
  const w = word.toLowerCase(), out = [];
  if (/ll|y[aeiouáéíóú]|^hi[aeiou]/.test(w)) out.push(['RIOPLATENSE', w.includes('ll') ? 'll → [ʃ], yeísmo rehilado' : 'y → [ʃ], yeísmo rehilado', true]);
  if (/[hʔ]/.test(ipa.replace(/^\[|\]$/g, '')) && /s[^aeiouáéíóú]/.test(w)) out.push(['RIOPLATENSE', 's antes de consonante → [h], aspirada', true]);
  if (/[íú][aeo]|[aeo][íú]/.test(w)) out.push(['HIATO', 'la tilde separa las dos vocales']);
  else if (/[jw]/.test(ipa)) out.push(['DIPTONGO', 'vocal débil (i, u) + otra vocal, en una sílaba']);
  if (/β/.test(ipa)) out.push(['ENTRE VOCALES', 'b/v → [β], los labios no se cierran']);
  if (/ð/.test(ipa)) out.push(['ENTRE VOCALES', 'd → [ð], suave, como "th" en "this"']);
  if (/ɣ/.test(ipa)) out.push(['ENTRE VOCALES', 'g → [ɣ], sin cerrar la garganta']);
  if (/r/.test(ipa.replace(/ɾ/g, ''))) out.push(['VIBRANTE', 'r fuerte [r], la lengua vibra']);
  if (/ɲ/.test(ipa)) out.push(['Ñ', 'ñ → [ɲ]']);
  if (/x/.test(ipa)) out.push(['JOTA', `${/j/.test(w) ? 'j' : 'g'} → [x]`]);
  if (/z|c[eiéí]/.test(w)) out.push(['SESEO', `${w.includes('z') ? 'z' : 'c'} → [s], como en toda América`]);
  return out.slice(0, 4);
}


// A paragraph whose words are buttons; onWord(word, button) is called on tap.
export function tappableText(text, onWord, style = 'font-family:var(--display);font-size:19px;line-height:1.75') {
  const p = h('p', { style, lang: 'es-AR' });
  for (const part of text.split(LETTERS)) {
    if (!part) continue;
    if (LETTERS.test(part) && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(part)) {
      const b = h('button', { type: 'button', class: 'word', style: 'all:unset;cursor:pointer;border-radius:6px;padding:0 1px' }, part);
      b.onclick = () => onWord(part, b);
      p.append(b);
    } else p.append(part);
  }
  return p;
}

export function markWord(root, b) {
  root.querySelectorAll('.word').forEach((x) => { x.style.background = ''; x.style.boxShadow = ''; });
  b.style.background = 'color-mix(in srgb, var(--accent) 22%, transparent)';
  b.style.boxShadow = 'inset 0 -2px 0 var(--accent)';
}

export function sentenceWith(text, word) {
  const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
  return (sentences.find((s) => new RegExp(`(^|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ])${word}([^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]|$)`, 'i').test(s)) || '').trim();
}

export function showWordPanel(panel, word, { context = '', tag = '#Lectura' } = {}) {
  const a = analyzeWord(word);
  if (!a) return;
  const ipa = a.ipa;
  const syl = a.spelling.map((s, i) => h('span', { style: `padding:6px 12px;border-radius:10px;background:color-mix(in srgb, var(--hero-ink) 12%, transparent);font-size:15px;${i === a.stress ? 'font-weight:700' : ''}` }, i === a.stress && a.spelling.length > 1 ? s.toUpperCase() : s));
  const sylRow = h('div', { class: 'row wrap', style: 'gap:6px' });
  syl.forEach((s, i) => { if (i) sylRow.append(h('span', { style: 'color:var(--hero-muted)' }, '·')); sylRow.append(s); });
  sylRow.append(h('span', { style: 'font-size:12px;color:var(--hero-muted);margin-left:6px' },
    `${a.spelling.length} sílaba${a.spelling.length > 1 ? 's' : ''}${a.spelling.length > 1 ? `, fuerza en la ${['1.ª', '2.ª', '3.ª', '4.ª', '5.ª', '6.ª'][a.stress] || (a.stress + 1) + '.ª'}` : ''}`));
  const feats = features(word, ipa).map(([badge, desc, local]) => h('div', { class: 'row', style: 'gap:10px;font-size:13px;align-items:flex-start' },
    h('span', { style: `flex:none;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;${local ? 'background:var(--accent);color:var(--accent-ink)' : 'border:1px solid var(--hero-muted)'}` }, badge),
    h('span', { style: 'padding-top:2px' }, desc)));
  const ext = (href, label) => h('a', { href, target: '_blank', rel: 'noopener', style: 'flex:1;min-height:44px;border-radius:12px;background:color-mix(in srgb, var(--hero-ink) 12%, transparent);color:var(--hero-ink);text-decoration:none;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px' },
    label, h('span', { html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>', style: 'display:contents' }));
  const listen = h('button', { type: 'button', class: 'btn ghost', style: 'flex:1;color:var(--hero-ink);border-color:var(--hero-muted)' }, iconEl('play'), 'Escuchar');
  listen.onclick = async () => {
    const r = await speak(word.toLowerCase());
    if (r.error) toast(`Voz argentina no disponible: ${r.error.message}. Uso la del teléfono.`);
    else if (r.used === 'none') toast('Este teléfono no tiene voz sintética');
  };
  const save = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, 'Guardar en Mazo');
  save.onclick = async () => {
    // Attach the Argentine audio when the voice is set up, so the Anki card can play it.
    let audio = await cachedArgentineAudio(word.toLowerCase());
    if (!audio && ttsReady()) { try { audio = await argentineAudio(word.toLowerCase()); } catch { audio = null; } }
    await db.put('mazo', { front: word.toLowerCase(), ipa, back: context, tag, audio: audio || undefined, created: Date.now() });
    toast('Guardado en el Mazo');
  };
  const lw = a.word;
  panel.replaceChildren(...[
    h('div', { class: 'row wrap', style: 'gap:12px;align-items:baseline' },
      h('span', { style: 'font-family:var(--display);font-size:28px;font-weight:700' }, word.toLowerCase()),
      h('span', { class: 'ipa', style: 'font-size:17px;color:var(--gold-text)' }, ipa)),
    sylRow,
    feats.length ? h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, feats) : null,
    h('div', { class: 'row' }, ext(`https://dle.rae.es/${encodeURIComponent(lw)}`, 'Ver en el DLE'), ext(`https://www.asale.org/damer/${encodeURIComponent(lw)}`, 'Americanismos')),
    h('div', { class: 'row' }, listen, save)].filter(Boolean));
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

