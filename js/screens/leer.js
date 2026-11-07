import { h } from '../ui.js';
import { transcribe } from '../ipa.js';
import { stopSpeaking } from '../tts.js';
import { showWordPanel, tappableText, markWord, sentenceWith } from '../wordpanel.js';

const KEY = 'cadencia.leer';
const SAMPLE = 'Che, ¿vamos a tomar unos mates a la plaza? Llevo la yerba y el termo. Si llueve, nos quedamos en casa y miramos el partido.';
let view = 'text';

export function readTabs(active) {
  const el = h('div', { class: 'seg scroll', role: 'navigation', 'aria-label': 'Leer' },
    active === 'lectura' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Lectura') : h('a', { href: '#/leer' }, 'Lectura'),
    active === 'lunfardo' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Lunfardo') : h('a', { href: '#/lunfardo' }, 'Lunfardo'),
    active === 'libros' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Libros') : h('a', { href: '#/libros' }, 'Libros'),
    active === 'recetas' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Recetas') : h('a', { href: '#/recetas' }, 'Recetas'),
    active === 'podcast' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Podcast') : h('a', { href: '#/podcast' }, 'Podcast'),
    active === 'ipa' ? h('span', { class: 'on', 'aria-current': 'page' }, 'IPA') : h('a', { href: '#/ipa' }, 'IPA'));
  requestAnimationFrame(() => { const on = el.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); });
  return el;
}

export async function render(main) {
  let text = localStorage.getItem(KEY) || SAMPLE;

  const textBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(view === 'text') }, 'Texto');
  const ipaBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(view === 'ipa') }, 'IPA');
  main.append(h('div', { class: 'between' }, readTabs('lectura'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' }, textBtn, ipaBtn)));
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
    const p = tappableText(text, (word, b) => { markWord(passage, b); showWord(word); });
    passage.append(p);
  }

  function showWord(word) { showWordPanel(panel, word, { context: sentenceWith(text, word), tag: '#Lectura' }); }

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
