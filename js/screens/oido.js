import { h, iconEl, toast, shuffle } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { CONTRASTS } from '../pairsdata.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { Player } from '../audio.js';

const ROUND = 10;
const LETTERS = 'a-záéíóúüñ';
let contrastId = 'rr';

const wordRe = (w) => new RegExp(`(^|[^${LETTERS}])(${w})([^${LETTERS}]|$)`, 'i');

// Questions: a clip containing one word of a pair; the answer is that word.
function buildQuestions(contrast, clips) {
  const qs = [];
  for (const pair of contrast.pairs) {
    for (const word of pair) {
      const re = wordRe(word);
      const hits = clips.filter((c) => re.test(c.text));
      for (const c of shuffle(hits).slice(0, 3)) qs.push({ pair, word, clip: c });
    }
  }
  // Spread across pairs so one common word ("esta") doesn't take over.
  const byPair = new Map();
  for (const q of shuffle(qs)) { const k = q.pair.join('|'); if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(q); }
  const out = [];
  while (out.length < ROUND && [...byPair.values()].some((l) => l.length)) {
    for (const l of byPair.values()) if (l.length && out.length < ROUND) out.push(l.shift());
  }
  return shuffle(out);
}

export async function render(main) {
  const clips = await db.all('clips');
  const counter = h('span', { class: 'muted', style: 'font-size:14px;font-weight:600' });
  main.append(h('div', { class: 'between' }, practiceTabs('oido'), counter));

  if (!clips.length) {
    main.append(h('section', { class: 'card empty' }, h('h2', {}, 'Faltan los clips'),
      h('p', { class: 'muted small' }, 'Oído usa las frases de OpenSLR. Importá el paquete en Perfil.'),
      h('a', { class: 'btn', href: '#/perfil', style: 'align-self:center' }, 'Ir a Perfil')));
    return () => {};
  }

  const available = Object.fromEntries(CONTRASTS.map((c) => [c.id, buildQuestions(c, clips).length]));
  const bar = h('div');
  main.append(h('div', { class: 'progress' }, bar));
  const tabs = CONTRASTS.map((c) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(c.id === contrastId), disabled: !available[c.id] }, c.label));
  tabs.forEach((b, i) => { b.onclick = () => { contrastId = CONTRASTS[i].id; tabs.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); newRound(); }; });
  main.append(h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Contraste' }, tabs));

  const player = new Player();
  const kicker = h('span', { class: 'kicker' });
  const prompt = h('p', { style: 'font-family:var(--display);font-size:22px;font-weight:600;line-height:1.25' }, '¿Qué palabra escuchaste?');
  const playBtn = h('button', { type: 'button', class: 'round native', style: 'width:72px;height:72px;align-self:center', 'aria-label': 'Escuchar la frase' }, iconEl('play'));
  const slowBtn = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', style: 'align-self:center;min-height:40px' }, 'Más lento (0.75x)');
  const options = h('div', { class: 'grid3', style: 'grid-template-columns:repeat(2,minmax(0,1fr));gap:10px' });
  const card = h('section', { class: 'card', style: 'gap:14px;padding:20px' }, kicker, prompt, playBtn, slowBtn, options);
  main.append(card);
  const feedback = h('section', { class: 'hero', 'aria-live': 'polite', hidden: true, style: 'padding:16px 18px;gap:8px' });
  main.append(feedback);
  const noteEl = h('p', { class: 'muted small', style: 'line-height:1.45' });
  main.append(noteEl);
  if (Object.values(available).some((n) => n < ROUND)) {
    main.append(h('p', { class: 'muted small' }, 'Algunas palabras no aparecen en tus clips. Para tener más preguntas, armá el paquete con más frases (por ejemplo --max 4000) y volvé a importarlo.'));
  }

  let round = [], idx = 0, score = 0, answered = false;

  const play = async () => {
    const q = round[idx];
    player.load(await db.audioFor(q.clip.id));
    player.rate = slowBtn.getAttribute('aria-pressed') === 'true' ? 0.75 : 1;
    player.play();
  };
  playBtn.onclick = play;
  slowBtn.onclick = () => { slowBtn.setAttribute('aria-pressed', String(slowBtn.getAttribute('aria-pressed') !== 'true')); play(); };

  function newRound() {
    if (!available[contrastId]) { const first = CONTRASTS.find((x) => available[x.id]); if (first) contrastId = first.id; }
    tabs.forEach((x, j) => x.setAttribute('aria-pressed', String(CONTRASTS[j].id === contrastId)));
    const c = CONTRASTS.find((x) => x.id === contrastId);
    round = buildQuestions(c, clips);
    idx = 0; score = 0;
    noteEl.textContent = c.note;
    show();
  }

  function show() {
    answered = false;
    feedback.hidden = true;
    const q = round[idx];
    const c = CONTRASTS.find((x) => x.id === contrastId);
    counter.textContent = `${idx + 1} / ${round.length}`;
    bar.style.width = `${(idx / round.length) * 100}%`;
    kicker.textContent = c.title.toUpperCase();
    options.replaceChildren(...shuffle(q.pair).map((w) => {
      const b = h('button', { type: 'button', class: 'pill', style: 'min-height:64px;font-size:20px;font-family:var(--display);border-radius:16px' }, w);
      b.onclick = () => answer(w, b);
      return b;
    }));
    play();
  }

  function answer(choice, btn) {
    if (answered) return;
    answered = true;
    const q = round[idx];
    const ok = choice === q.word;
    if (ok) score++;
    options.querySelectorAll('button').forEach((b) => {
      b.disabled = true;
      if (b.textContent === q.word) { b.style.background = 'var(--sel)'; b.style.color = 'var(--sel-ink)'; b.style.opacity = '1'; }
      else if (b === btn) { b.style.textDecoration = 'line-through'; }
    });
    const m = q.clip.text.match(wordRe(q.word));
    const i = m.index + m[1].length;
    const sentence = h('p', { style: 'font-size:16px;line-height:1.5', lang: 'es-AR' },
      q.clip.text.slice(0, i),
      h('mark', { style: 'background:var(--accent);color:var(--accent-ink);border-radius:6px;padding:0 4px;font-weight:700' }, q.clip.text.slice(i, i + m[2].length)),
      q.clip.text.slice(i + m[2].length));
    const save = h('button', { type: 'button', class: 'pill', style: 'align-self:flex-start;background:transparent;color:var(--hero-ink);border-color:var(--hero-muted)' }, 'Guardar en Mazo');
    save.onclick = async () => {
      const other = q.pair.find((w) => w !== q.word);
      await db.put('mazo', { front: q.clip.text, ipa: transcribe(q.clip.text), back: `${q.word} ${transcribe(q.word)} · no ${other} ${transcribe(other)}`, tag: '#Oído', audio: (await db.audioFor(q.clip.id)) || undefined, created: Date.now() });
      toast('Guardado en el Mazo');
    };
    const next = h('button', { type: 'button', class: 'btn', style: 'align-self:stretch' }, idx < round.length - 1 ? 'Siguiente' : 'Ver resultado');
    next.onclick = () => { if (idx < round.length - 1) { idx++; show(); } else finish(); };
    feedback.replaceChildren(
      h('span', { style: `font-weight:700;font-size:16px;color:${ok ? 'var(--gold-text)' : '#F2A989'}` }, ok ? '¡Bien escuchado!' : `Era “${q.word}”.`),
      sentence,
      h('div', { style: 'display:flex;flex-direction:column;gap:2px;font-size:14px' },
        ...q.pair.map((w) => h('span', {}, h('b', {}, w), ' ', h('span', { class: 'ipa', style: 'color:var(--gold-text)' }, transcribe(w))))),
      h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'pill', style: 'background:transparent;color:var(--hero-ink);border-color:var(--hero-muted)', onclick: play }, 'Escuchar otra vez'), save),
      next);
    feedback.hidden = false;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function finish() {
    bar.style.width = '100%';
    feedback.hidden = true;
    card.replaceChildren(
      h('span', { class: 'kicker' }, 'RONDA TERMINADA'),
      h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
      h('p', { class: 'muted small' }, score === round.length ? '¡Oído porteño!' : 'Repetí la ronda o probá otro contraste.'),
      h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
  }

  if (!Object.values(available).some(Boolean)) {
    card.replaceChildren(h('h2', {}, 'No encontré estas palabras'), h('p', { class: 'muted small' }, 'Ninguna palabra de los pares aparece en tus clips. Armá un paquete con más frases y volvé a importarlo.'));
    return () => player.load(null);
  }
  newRound();
  return () => player.load(null);
}
