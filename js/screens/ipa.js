import { h, toast, shuffle } from '../ui.js';
import { readTabs } from './leer.js';
import { SOUNDS, CONFUSABLE, WORDS } from '../ipadata.js';
import { transcribe } from '../ipa.js';

let mode = 'simbolos';
const MODES = [['simbolos', 'Símbolos'], ['descifrar', 'Descifrar'], ['escribir', 'Escribir']];

// IPA string -> list of sound tokens (tʃ is one token), without brackets, stress or dots.
function tokens(ipa) {
  const s = ipa.replace(/[[\]ˈ.‖|]/g, '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ') continue;
    if (s[i] === 't' && s[i + 1] === 'ʃ') { out.push('tʃ'); i++; } else out.push(s[i]);
  }
  return out;
}

function highlight(word, symbol) {
  // Show the word with its IPA; the sound in question is underlined inside the IPA.
  const ipa = transcribe(word);
  const parts = symbol === 'tʃ' ? ipa.split('tʃ') : ipa.split(symbol);
  const nodes = [];
  parts.forEach((p, i) => { nodes.push(p); if (i < parts.length - 1) nodes.push(h('b', { style: 'color:var(--accent);text-decoration:underline;text-underline-offset:3px' }, symbol)); });
  return h('div', { class: 'between', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
    h('span', { style: 'font-family:var(--display);font-size:18px;font-weight:600', lang: 'es-AR' }, word),
    h('span', { class: 'ipa' }, ...nodes));
}

function soundboard(root) {
  const detail = h('section', { class: 'hero', hidden: true, 'aria-live': 'polite', style: 'padding:16px 18px;gap:8px' });
  const groups = [...new Set(SOUNDS.map((x) => x.group))];
  root.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Todos los sonidos del español rioplatense. Los marcados con ', h('b', { style: 'color:var(--accent)' }, '●'), ' son los que delatan el acento porteño. Tocá uno para ver cómo se hace.'));
  for (const g of groups) {
    root.append(h('h3', { style: 'font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--muted);margin-top:4px' }, g.toUpperCase()));
    root.append(h('div', { style: 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px' }, SOUNDS.filter((x) => x.group === g).map((x) => {
      const b = h('button', { type: 'button', class: 'pill', 'aria-label': `${x.s}: ${x.name}`, style: `min-height:64px;border-radius:14px;display:flex;flex-direction:column;gap:2px;position:relative;${x.ar ? 'border-color:var(--accent);border-width:2px' : ''}` },
        h('span', { style: 'font-family:var(--ipa-font);font-size:24px;font-weight:500' }, x.s),
        h('span', { style: 'font-size:10px;font-weight:600;color:var(--muted)' }, x.name),
        x.ar ? h('span', { 'aria-hidden': 'true', style: 'position:absolute;top:4px;right:7px;color:var(--accent);font-size:11px' }, '●') : null);
      b.onclick = () => {
        detail.replaceChildren(
          h('div', { class: 'row', style: 'gap:12px;align-items:baseline' },
            h('span', { style: 'font-family:var(--ipa-font);font-size:40px;color:var(--gold-text)' }, `[${x.s}]`),
            h('span', { style: 'font-family:var(--display);font-size:22px;font-weight:700' }, x.name),
            x.ar ? h('span', { class: 'chip', style: 'background:var(--accent);color:var(--accent-ink)' }, 'RIOPLATENSE') : ''),
          h('p', { style: 'font-size:15px;line-height:1.45' }, x.how),
          h('div', { style: 'background:var(--surface);color:var(--ink);border-radius:14px;padding:4px 14px' }, x.ex.map((w) => highlight(w, x.s))));
        detail.hidden = false;
        detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      return b;
    })));
  }
  root.append(detail);
}

function decodeGame(root) {
  const ROUND = 10;
  let round = shuffle(WORDS).slice(0, ROUND), idx = 0, score = 0;
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const ipaEl = h('p', { class: 'ipa', style: 'font-size:30px;text-align:center;color:var(--ink)' });
  const opts = h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px' });
  const fb = h('p', { 'aria-live': 'polite', style: 'font-size:15px;min-height:22px' });
  const next = h('button', { type: 'button', class: 'btn', hidden: true }, 'Siguiente');
  root.append(h('p', { class: 'muted small' }, 'Leé la transcripción y elegí la palabra que suena así.'),
    h('section', { class: 'card', style: 'gap:14px;padding:20px' }, h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'DESCIFRAR'), counter), ipaEl, opts, fb, next));

  function show() {
    const w = round[idx];
    counter.textContent = `${idx + 1} / ${round.length}`;
    ipaEl.textContent = transcribe(w);
    // Distractors: words of similar length, preferring ones that share letters.
    const others = shuffle(WORDS.filter((x) => x !== w && Math.abs(x.length - w.length) <= 2)).slice(0, 3);
    fb.textContent = ''; next.hidden = true;
    opts.replaceChildren(...shuffle([w, ...others]).map((o) => {
      const b = h('button', { type: 'button', class: 'pill', style: 'min-height:56px;font-size:18px;font-family:var(--display);border-radius:14px' }, o);
      b.onclick = () => {
        opts.querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.textContent === w) { x.style.background = 'var(--sel)'; x.style.color = 'var(--sel-ink)'; x.style.opacity = '1'; } });
        if (o === w) { score++; fb.textContent = '¡Bien leído!'; }
        else { b.style.textDecoration = 'line-through'; fb.textContent = `“${o}” sería ${transcribe(o)}.`; }
        next.textContent = idx < round.length - 1 ? 'Siguiente' : 'Ver resultado';
        next.hidden = false;
      };
      return b;
    }));
  }
  next.onclick = () => {
    if (idx < round.length - 1) { idx++; show(); return; }
    root.querySelector('.card').replaceChildren(h('span', { class: 'kicker' }, 'RONDA TERMINADA'),
      h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
      h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
  };
  show();
}

function encodeGame(root) {
  const ROUND = 8;
  let round = shuffle(WORDS).slice(0, ROUND), idx = 0, score = 0;
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const wordEl = h('p', { style: 'font-family:var(--display);font-size:32px;font-weight:700;text-align:center', lang: 'es-AR' });
  const built = h('div', { 'aria-live': 'polite', style: 'min-height:56px;border:2px dashed var(--line);border-radius:14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;padding:8px;font-family:var(--ipa-font);font-size:24px' });
  const tiles = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center' });
  const undo = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Borrar');
  const check = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, 'Comprobar');
  const fb = h('div', { 'aria-live': 'polite', style: 'font-size:15px;display:flex;flex-direction:column;gap:4px' });
  root.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Armá la pronunciación porteña tocando los símbolos en orden. Cuidado con las trampas: ɾ o r, b o β, ʃ o ʝ… (sin acento ni puntos).'),
    h('section', { class: 'card', style: 'gap:14px;padding:20px' }, h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'ESCRIBIR'), counter), wordEl, built, tiles, h('div', { class: 'row' }, undo, check), fb));

  let answer = [], picked = [], tileEls = [], done = false;
  function drawBuilt() {
    built.replaceChildren(...(picked.length ? picked.map((t) => h('span', { style: 'padding:2px 6px;border-radius:8px;background:var(--chip)' }, tileEls[t].dataset.sym)) : [h('span', { class: 'muted', style: 'font-size:14px;font-family:var(--body)' }, 'tocá los símbolos…')]));
  }
  function show() {
    const w = round[idx];
    done = false;
    counter.textContent = `${idx + 1} / ${round.length}`;
    wordEl.textContent = w;
    answer = tokens(transcribe(w));
    const traps = shuffle([...new Set(answer.flatMap((t) => CONFUSABLE[t] || []))].filter((t) => !answer.includes(t))).slice(0, 4);
    const pool = shuffle([...answer, ...traps]);
    picked = []; fb.replaceChildren(); check.textContent = 'Comprobar';
    tileEls = pool.map((sym, i) => {
      const b = h('button', { type: 'button', class: 'pill', 'data-sym': sym, style: 'min-width:52px;min-height:52px;font-family:var(--ipa-font);font-size:22px;font-weight:500;border-radius:12px' }, sym);
      b.onclick = () => { if (done) return; picked.push(i); b.disabled = true; drawBuilt(); };
      return b;
    });
    tiles.replaceChildren(...tileEls);
    drawBuilt();
  }
  undo.onclick = () => { if (done || !picked.length) return; tileEls[picked.pop()].disabled = false; drawBuilt(); };
  check.onclick = () => {
    if (done) {
      if (idx < round.length - 1) { idx++; show(); return; }
      root.querySelector('.card').replaceChildren(h('span', { class: 'kicker' }, 'RONDA TERMINADA'),
        h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
        h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
      return;
    }
    const got = picked.map((i) => tileEls[i].dataset.sym);
    if (!got.length) { toast('Tocá los símbolos en orden'); return; }
    done = true;
    const ok = got.join('') === answer.join('');
    if (ok) score++;
    const w = round[idx];
    const traps = got.filter((s, i) => s !== answer[i]);
    fb.replaceChildren(...[
      h('b', { style: `color:${ok ? 'var(--accent)' : 'var(--ink)'}` }, ok ? '¡Perfecto!' : 'Casi. La pronunciación es:'),
      h('span', { class: 'ipa', style: 'font-size:20px' }, transcribe(w)),
      !ok && traps.length ? h('span', { class: 'muted small' }, `Revisá: ${[...new Set(traps)].map((t) => { const x = SOUNDS.find((y) => y.s === t); return x ? `[${t}] = ${x.name}` : `[${t}] no se usa en el español porteño`; }).join(' · ')}`) : null].filter(Boolean));
    check.textContent = idx < round.length - 1 ? 'Siguiente' : 'Ver resultado';
  };
  show();
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, readTabs('ipa')));
  const tabs = MODES.map(([k, label]) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(k === mode) }, label));
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  tabs.forEach((b, i) => { b.onclick = () => { mode = MODES[i][0]; tabs.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  main.append(h('div', { class: 'row', role: 'group', 'aria-label': 'Modo' }, tabs), body);
  function draw() {
    body.replaceChildren();
    if (mode === 'simbolos') soundboard(body);
    else if (mode === 'descifrar') decodeGame(body);
    else encodeGame(body);
  }
  draw();
}
