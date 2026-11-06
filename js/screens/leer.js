import { h, iconEl, toast } from '../ui.js';
import { transcribe, analyzeWord } from '../ipa.js';
import { db } from '../db.js';
import { speak, stopSpeaking, ttsReady, argentineAudio, cachedArgentineAudio } from '../tts.js';

const KEY = 'cadencia.leer';
const SAMPLE = 'Che, ¿vamos a tomar unos mates a la plaza? Llevo la yerba y el termo. Si llueve, nos quedamos en casa y miramos el partido.';
let view = 'text';

function features(word, ipa) {
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


export async function render(main) {
  let text = localStorage.getItem(KEY) || SAMPLE;

  const textBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(view === 'text') }, 'Texto');
  const ipaBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(view === 'ipa') }, 'IPA');
  main.append(h('div', { class: 'between' }, h('h1', {}, 'Leer'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' }, textBtn, ipaBtn)));
  main.append(h('p', { class: 'muted small' }, 'Tocá cualquier palabra para ver sílabas, sonidos y guardarla.'));

  const passage = h('div', { lang: 'es-AR' });
  const editor = h('textarea', { rows: '6', 'aria-label': 'Texto para leer', hidden: true, style: 'width:100%;border-radius:14px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:12px 14px;font-family:var(--display);font-size:18px;line-height:1.5;resize:vertical' });
  const editBtn = h('button', { type: 'button', class: 'pill', style: 'align-self:flex-start;min-height:40px' }, 'Cambiar texto');
  main.append(h('section', { class: 'card' }, passage, editor, editBtn));

  const panel = h('section', { class: 'hero', 'aria-label': 'Palabra seleccionada', 'aria-live': 'polite', hidden: true, style: 'padding:16px 18px;gap:10px' });
  main.append(panel);

  function drawPassage() {
    passage.replaceChildren();
    if (view === 'ipa') {
      passage.append(h('p', { class: 'ipa', style: 'font-size:17px;line-height:1.7' }, transcribe(text)));
      return;
    }
    const p = h('p', { style: 'font-family:var(--display);font-size:19px;line-height:1.75' });
    for (const part of text.split(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/)) {
      if (!part) continue;
      if (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(part)) {
        const b = h('button', { type: 'button', class: 'word', style: 'all:unset;cursor:pointer;border-radius:6px;padding:0 1px' }, part);
        b.onclick = () => {
          passage.querySelectorAll('.word').forEach((x) => { x.style.background = ''; x.style.boxShadow = ''; });
          b.style.background = 'color-mix(in srgb, var(--accent) 22%, transparent)';
          b.style.boxShadow = 'inset 0 -2px 0 var(--accent)';
          showWord(part);
        };
        p.append(b);
      } else p.append(part);
    }
    passage.append(p);
  }

  function contextFor(word) {
    const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    return (sentences.find((s) => new RegExp(`\\b${word}\\b`, 'i').test(s)) || '').trim();
  }

  function showWord(word) {
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
      await db.put('mazo', { front: word.toLowerCase(), ipa, back: contextFor(word), tag: '#Lectura', audio: audio || undefined, created: Date.now() });
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

  textBtn.onclick = () => { view = 'text'; textBtn.setAttribute('aria-pressed', 'true'); ipaBtn.setAttribute('aria-pressed', 'false'); drawPassage(); };
  ipaBtn.onclick = () => { view = 'ipa'; ipaBtn.setAttribute('aria-pressed', 'true'); textBtn.setAttribute('aria-pressed', 'false'); drawPassage(); };
  editBtn.onclick = () => {
    if (editor.hidden) {
      editor.value = text; editor.hidden = false; passage.hidden = true; editBtn.textContent = 'Listo'; editor.focus();
    } else {
      text = editor.value.trim() || SAMPLE;
      try { localStorage.setItem(KEY, text); } catch { /* ignore */ }
      editor.hidden = true; passage.hidden = false; editBtn.textContent = 'Cambiar texto'; panel.hidden = true; drawPassage();
    }
  };

  drawPassage();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  return () => stopSpeaking();
}
