import { h, toast, shuffle } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { RULES, toSpanish, FALSE_FRIENDS } from '../cognates.js';
import { analyzeWord, transcribe } from '../ipa.js';
import { db } from '../db.js';
import { log } from '../progress.js';

let mode = 'convertir';
const MODES = [['convertir', 'Convertir'], ['reglas', 'Reglas'], ['ronda', 'Ronda rápida'], ['falsos', 'Falsos amigos']];

function stressed(word) {
  const a = analyzeWord(word);
  if (!a) return h('span', {}, word);
  return h('span', {}, ...a.spelling.map((s, i) => (i === a.stress && a.spelling.length > 1 ? h('b', { style: 'color:var(--accent);text-decoration:underline;text-underline-offset:4px' }, s) : s)));
}

function ffCard(f) {
  return h('div', { class: 'card', style: 'gap:4px;border-color:var(--accent)' },
    h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'chip', style: 'background:var(--accent);color:var(--accent-ink)' }, 'FALSO AMIGO'), h('b', { style: 'font-family:var(--display);font-size:20px' }, f.es)),
    h('p', { class: 'small' }, `${f.es} = `, h('b', {}, f.means), ` (no "${f.looks}")`),
    h('p', { class: 'small muted' }, `"${f.looks}" se dice: ${f.say}`));
}

function converter(root) {
  const input = h('input', { type: 'text', placeholder: 'Escribí una palabra en inglés…', 'aria-label': 'Palabra en inglés', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'en',
    style: 'min-height:52px;padding:0 16px;border-radius:14px;border:2px solid var(--ink);background:var(--surface);color:var(--ink);font-size:20px;width:100%' });
  const out = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:10px' });
  root.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Miles de palabras en inglés pasan al español cambiando la terminación. Probá con "information", "possible", "organize", "biology"…'), input, out);
  const draw = () => {
    const w = input.value.trim().toLowerCase();
    out.replaceChildren();
    if (!w) return;
    const ff = FALSE_FRIENDS.filter((f) => f.looks === w);
    const r = toSpanish(w);
    if (r) {
      const save = h('button', { type: 'button', class: 'pill', style: 'align-self:flex-start;min-height:40px' }, 'Guardar en Mazo');
      save.onclick = async () => { await db.put('mazo', { front: r.es, ipa: transcribe(r.es), back: `${w} · regla -${r.rule.en} → -${r.rule.es}`, tag: '#Cognados', created: Date.now() }); toast('Guardado en el Mazo'); };
      out.append(h('section', { class: 'card', style: 'gap:8px' },
        h('span', { class: 'kicker' }, `REGLA  -${r.rule.en} → -${r.rule.es}`),
        h('p', { style: 'font-family:var(--display);font-size:32px;font-weight:700', lang: 'es-AR' }, stressed(r.es)),
        h('p', { class: 'ipa' }, transcribe(r.es)),
        h('p', { class: 'muted small' }, 'La sílaba subrayada lleva la fuerza. Es una regla, no una garantía: verificá en el DLE si no estás seguro.'),
        h('div', { class: 'row' }, h('a', { class: 'pill', style: 'min-height:40px;display:flex;align-items:center;text-decoration:none', href: `https://dle.rae.es/${encodeURIComponent(r.es)}`, target: '_blank', rel: 'noopener' }, 'Ver en el DLE ↗'), save)));
    } else if (!ff.length) out.append(h('p', { class: 'muted small' }, 'Ninguna regla coincide con esa terminación.'));
    ff.forEach((f) => out.append(ffCard(f)));
  };
  input.oninput = draw;
}

function rules(root) {
  root.append(h('p', { class: 'muted small' }, `${RULES.length} reglas de inglés a español. La sílaba subrayada lleva la fuerza.`));
  for (const r of RULES) {
    root.append(h('div', { class: 'card', style: 'gap:6px;padding:12px 16px' },
      h('div', { class: 'row', style: 'gap:10px' }, h('b', { style: 'font-size:18px' }, `-${r.en}`), h('span', { class: 'muted' }, '→'), h('b', { style: 'font-size:18px;color:var(--accent)' }, `-${r.es}`)),
      h('div', { class: 'small', style: 'display:flex;flex-direction:column;gap:2px' }, r.ex.map(([en, es]) => h('span', {}, h('span', { class: 'muted' }, `${en} → `), stressed(es))))));
  }
}

function speedRound(root) {
  const ROUND = 10, LIMIT = 6000;
  const all = shuffle(RULES.flatMap((r) => r.ex.map(([en, es]) => ({ en, es, rule: r }))).filter((x) => x.en !== x.es)).slice(0, ROUND);
  let idx = 0, score = 0, timer = 0, raf = 0, t0 = 0, locked = false;
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const word = h('p', { style: 'font-size:32px;font-weight:700;text-align:center', lang: 'en' });
  const bar = h('div', { style: 'width:100%' });
  const opts = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const fb = h('p', { 'aria-live': 'polite', class: 'small', style: 'min-height:20px;text-align:center' });
  const card = h('section', { class: 'card', style: 'gap:12px;padding:20px' }, h('div', { class: 'between' }, h('span', { class: 'kicker' }, '¿CÓMO SE DICE?'), counter), word, h('div', { class: 'progress' }, bar), opts, fb);
  root.append(h('p', { class: 'muted small' }, '10 palabras, 6 segundos cada una. Aplicá la regla sin pensar.'), card);
  const wrongs = (q) => {
    const stem = q.es.slice(0, -q.rule.es.length);
    const others = shuffle(RULES.filter((r) => r.es !== q.rule.es)).slice(0, 4).map((r) => stem + r.es);
    return shuffle([...new Set([q.en, ...others])].filter((x) => x !== q.es)).slice(0, 2);
  };
  function finish() {
    cancelAnimationFrame(raf); clearTimeout(timer);
    card.replaceChildren(h('span', { class: 'kicker' }, 'RONDA TERMINADA'), h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${all.length}`),
      h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
  }
  function answer(choice) {
    if (locked) return;
    locked = true; cancelAnimationFrame(raf); clearTimeout(timer);
    const q = all[idx];
    log('cognados', { correct: choice === q.es });
    if (choice === q.es) { score++; fb.textContent = `¡Sí! -${q.rule.en} → -${q.rule.es}`; } else fb.textContent = choice ? `Era “${q.es}” (-${q.rule.en} → -${q.rule.es})` : `¡Tiempo! Era “${q.es}”.`;
    opts.querySelectorAll('button').forEach((b) => { b.disabled = true; if (b.textContent === q.es) { b.style.background = 'var(--sel)'; b.style.color = 'var(--sel-ink)'; b.style.opacity = '1'; } });
    setTimeout(() => { idx++; if (idx < all.length) show(); else finish(); }, 1300);
  }
  function show() {
    locked = false;
    const q = all[idx];
    counter.textContent = `${idx + 1} / ${all.length}`;
    word.textContent = q.en; fb.textContent = '';
    opts.replaceChildren(...shuffle([q.es, ...wrongs(q)]).map((o) => h('button', { type: 'button', class: 'pill', style: 'min-height:54px;font-size:18px;border-radius:14px', onclick: () => answer(o) }, o)));
    t0 = performance.now();
    const tick = () => { const p = 1 - (performance.now() - t0) / LIMIT; bar.style.width = `${Math.max(0, p) * 100}%`; if (p > 0) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => answer(null), LIMIT);
  }
  show();
  return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
}

function falseFriends(root) {
  root.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Se parecen al inglés pero significan otra cosa. Las clásicas que hacen pasar vergüenza.'));
  FALSE_FRIENDS.forEach((f) => root.append(ffCard(f)));
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, practiceTabs('cognados')));
  const tabs = MODES.map(([k, label]) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(k === mode), style: 'min-height:40px;font-size:12px' }, label));
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  let cleanup = null;
  const draw = () => {
    if (cleanup) cleanup();
    cleanup = null;
    body.replaceChildren();
    if (mode === 'convertir') converter(body);
    else if (mode === 'reglas') rules(body);
    else if (mode === 'ronda') cleanup = speedRound(body);
    else falseFriends(body);
  };
  tabs.forEach((b, i) => { b.onclick = () => { mode = MODES[i][0]; tabs.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  main.append(h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Modo', style: 'gap:6px' }, tabs), body);
  draw();
  return () => { if (cleanup) cleanup(); };
}
