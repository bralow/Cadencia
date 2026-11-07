import { h, iconEl, toast, shuffle } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { questionsFor, noteFor } from '../vosdata.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { log } from '../progress.js';

const ROUND = 10;
const MODES = [['pres', 'Presente'], ['imp', 'Imperativo'], ['subj', 'Subjuntivo']];
const MODE_LABEL = { pres: 'PRESENTE', imp: 'IMPERATIVO', subj: 'SUBJUNTIVO' };
let state = { mode: 'pres' };

const bare = (s) => s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clean = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');

export async function render(main) {
  const counter = h('span', { class: 'muted', style: 'font-size:14px;font-weight:600' });
  main.append(h('div', { class: 'between' }, practiceTabs('vos'), counter));
  const bar = h('div');
  main.append(h('div', { class: 'progress' }, bar));

  const modeBtns = MODES.map(([k, label]) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(k === state.mode) }, label));
  modeBtns.forEach((b, i) => { b.onclick = () => { state.mode = MODES[i][0]; modeBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); newRound(); }; });
  main.append(h('div', { class: 'row', role: 'group', 'aria-label': 'Tiempo verbal' }, modeBtns));

  const kicker = h('span', { class: 'kicker' });
  const sentence = h('p', { style: 'font-family:var(--display);font-size:24px;font-weight:600;line-height:1.25', lang: 'es-AR' });
  const tuSpan = h('span', { class: 'muted', style: 'text-decoration:line-through' });
  const vosLead = h('span', { style: 'font-weight:700' });
  const input = h('input', { id: 'resp', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', lang: 'es',
    style: 'min-height:52px;padding:0 16px;border-radius:14px;border:2px solid var(--ink);background:var(--surface);color:var(--ink);font-size:20px;font-weight:600;width:100%' });
  const accents = h('div', { class: 'row', style: 'gap:6px' }, ['á', 'é', 'í', 'ó', 'ú', 'ñ'].map((c) => {
    const b = h('button', { type: 'button', class: 'pill', style: 'min-width:44px;padding:0;font-size:16px' }, c);
    b.onmousedown = (e) => e.preventDefault(); // keep the keyboard open
    b.onclick = () => { const p = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, p) + c + input.value.slice(input.selectionEnd ?? p); input.focus(); input.setSelectionRange(p + 1, p + 1); };
    return b;
  }));
  const action = h('button', { type: 'button', class: 'btn' }, 'Comprobar');
  const card = h('section', { class: 'card', style: 'gap:14px;padding:22px 20px' },
    kicker, sentence,
    h('div', { class: 'row', style: 'gap:10px;font-size:15px' }, tuSpan, iconEl('next'), vosLead),
    h('label', { for: 'resp', class: 'small muted', style: 'font-weight:600' }, 'Tu respuesta'), input, accents, action);
  main.append(card);

  const feedback = h('section', { class: 'hero', 'aria-live': 'polite', style: 'padding:16px 18px;gap:6px', hidden: true });
  main.append(feedback);

  let round = [], idx = 0, score = 0, checked = false;

  function newRound() {
    round = shuffle(questionsFor(state.mode)).slice(0, ROUND);
    idx = 0; score = 0;
    show();
  }

  function show() {
    checked = false;
    feedback.hidden = true;
    const q = round[idx];
    counter.textContent = `${idx + 1} / ${round.length}`;
    bar.style.width = `${(idx / round.length) * 100}%`;
    kicker.textContent = `${q.verb.inf.toUpperCase()} · ${MODE_LABEL[q.mode]} · ${q.verb.en}`;
    sentence.textContent = q.sentence.replace('___', '____');
    tuSpan.textContent = q.tuForm;
    vosLead.textContent = q.mode === 'subj' ? 'que vos …' : q.mode === 'imp' ? 'vos: …' : 'vos …';
    input.value = ''; input.disabled = false;
    action.textContent = 'Comprobar';
    input.focus({ preventScroll: true });
  }

  function check() {
    const q = round[idx];
    const got = clean(input.value);
    if (!got) { input.focus(); return; }
    const ok = q.accept.some((a) => clean(a) === got);
    const near = !ok && q.accept.some((a) => bare(a) === bare(got));
    if (ok) score++;
    log('vos', { mode: q.mode, correct: ok });
    checked = true;
    input.disabled = true;
    const filled = q.sentence.replace('___', q.answer).replace(/^./, (c) => c.toUpperCase());
    const save = h('button', { type: 'button', class: 'pill', style: 'align-self:flex-start;margin-top:4px;background:transparent;color:var(--hero-ink);border-color:var(--hero-muted)' }, 'Guardar en Mazo');
    save.onclick = async () => {
      await db.put('mazo', { front: filled, ipa: transcribe(filled), back: `${q.verb.inf} (${q.verb.en}): vos ${q.answer} · ${q.tuForm}`, tag: '#Vos', created: Date.now() });
      toast('Guardado en el Mazo');
    };
    feedback.replaceChildren(
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
        h('span', { style: `font-weight:700;font-size:16px;color:${ok ? 'var(--gold-text)' : near ? 'var(--gold-text)' : '#F2A989'}` }, ok ? '¡Bien!' : near ? 'Casi: revisá la tilde.' : 'No exactamente.'),
        h('span', { style: 'font-weight:700' }, q.answer),
        h('span', { class: 'ipa', style: 'color:var(--hero-muted)' }, transcribe(q.answer))),
      h('p', { style: 'font-size:14px;line-height:1.45' }, noteFor(q.mode, q.verb, q.answer)),
      h('p', { style: 'font-size:14px;font-style:italic' }, filled),
      save);
    feedback.hidden = false;
    action.textContent = idx < round.length - 1 ? 'Siguiente' : 'Ver resultado';
    action.focus({ preventScroll: true });
  }

  function next() {
    if (idx < round.length - 1) { idx++; show(); return; }
    bar.style.width = '100%';
    feedback.hidden = true;
    card.replaceChildren(
      h('span', { class: 'kicker' }, 'RONDA TERMINADA'),
      h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
      h('p', { class: 'muted small' }, score === round.length ? '¡Impecable! Ya hablás como porteño.' : 'Repetí la ronda o cambiá de tiempo verbal arriba.'),
      h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
  }

  action.onclick = () => (checked ? next() : check());
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); action.click(); } };

  newRound();
}
