// Crucigrama (FE-17): built from a deck's words. Doesn't change any due dates.
import { h, toast } from '../ui.js';
import { db } from '../db.js';
import { decks } from '../penumbra.js';
import { build, letters } from '../crossword.js';
import { log } from '../progress.js';

const ARTICLE = /^(el|la|los|las|lo|un|una|unos|unas)\s+/i;

async function entriesFor(deckId) {
  const seen = new Set(), out = [];
  for (const c of await db.all('cards')) {
    if ((deckId && c.deck !== deckId) || seen.has(c.note)) continue;
    const word = c.front.trim().replace(ARTICLE, '');
    if (/\s/.test(word)) continue; // single words only
    const ctx = c.context && new RegExp(word, 'i').test(c.context) ? c.context.replace(new RegExp(word, 'ig'), '___') : '';
    const clue = c.meaning || ctx || c.hint;
    if (!clue) continue;
    seen.add(c.note);
    out.push({ front: word, clue, note: c.note });
  }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export async function render(main) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const ds = await decks();
  let deckId = q.get('deck') || '';
  const sel = h('select', { 'aria-label': 'Mazo', style: 'min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;flex:1' },
    h('option', { value: '' }, 'Todos los mazos'), ...ds.map((d) => h('option', { value: d.id }, d.name)));
  sel.value = deckId;
  const again = h('button', { type: 'button', class: 'pill' }, 'Otro');
  const back = h('a', { href: '#/repaso', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, '← Repaso');
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  main.append(h('div', { class: 'between' }, back, h('span', { class: 'chip' }, 'no cambia fechas')), h('h1', {}, 'Crucigrama'),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, sel, again), body);
  sel.onchange = () => { deckId = sel.value; make(); };
  again.onclick = () => make();
  let cleanup = () => {};

  async function make() {
    cleanup();
    const entries = await entriesFor(deckId);
    let cw = null;
    for (let t = 0; t < 12 && entries.length >= 3; t++) {
      const pool = t ? [...entries].sort(() => Math.random() - 0.5) : entries;
      const c = build(pool, 12);
      const score = (x) => x.words.length * 3 - Math.max(0, x.w - 13) * 4 - Math.max(0, x.h - 16);
      if (c && (!cw || score(c) > score(cw))) cw = c;
    }
    if (!cw || cw.words.length < 3) {
      body.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Hacen falta al menos 3 palabras sueltas con significado en este mazo. Probá con otro mazo o con «Todos los mazos».')));
      return;
    }
    const avail = Math.min(window.innerWidth, 480) - 40;
    const size = Math.max(17, Math.min(36, Math.floor((avail - 2 * (cw.w - 1)) / cw.w)));
    const fill = cw.cells.map((row) => row.map(() => ''));
    const els = cw.cells.map((row) => row.map(() => null));
    let cur = null, pos = 0, wrong = new Set();

    const board = h('div', { role: 'grid', 'aria-label': 'Crucigrama', style: `display:grid;grid-template-columns:repeat(${cw.w},${size}px);gap:2px;width:max-content;margin:0 auto;touch-action:manipulation` });
    cw.cells.forEach((row, y) => row.forEach((c, x) => {
      if (!c) { board.append(h('div', { style: `width:${size}px;height:${size}px` })); return; }
      const el = h('div', { role: 'gridcell', style: `position:relative;width:${size}px;height:${size}px;border-radius:6px;background:var(--surface);border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.52)}px;cursor:pointer;user-select:none` });
      if (c.num) el.append(h('span', { style: `position:absolute;top:1px;left:3px;font-size:${Math.max(8, Math.round(size * 0.27))}px;font-weight:600;color:var(--muted)` }, String(c.num)));
      el.append(h('span', { class: 'l' }, ''));
      el.onclick = () => pick(x, y);
      els[y][x] = el;
      board.append(el);
    }));
    const keyIn = h('input', { type: 'text', 'aria-label': 'Escribí la letra', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', style: 'position:absolute;opacity:0;width:1px;height:1px;left:-10px' });
    const clueBar = h('div', { 'aria-live': 'polite', style: 'background:var(--hero);color:var(--hero-ink);border-radius:14px;padding:10px 14px;min-height:46px;font-weight:600;position:sticky;top:8px;z-index:3' }, 'Tocá una casilla para empezar');
    const lists = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });
    const clueEls = new Map();
    const col = (dir, title) => h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, h('span', { class: 'kicker' }, title),
      ...cw.words.filter((w) => w.dir === dir).map((w) => { const e = h('button', { type: 'button', style: 'text-align:left;background:none;border:none;color:var(--ink);font:inherit;font-size:14px;padding:4px 2px;cursor:pointer;line-height:1.35' }, h('b', {}, `${w.num}. `), w.clue); e.onclick = () => { cur = w; pos = 0; paint(); keyIn.focus(); }; clueEls.set(w, e); return e; }));
    lists.append(col('H', 'HORIZONTALES'), col('V', 'VERTICALES'));

    const cellsOf = (w) => Array.from({ length: w.answer.length }, (_, i) => (w.dir === 'H' ? [w.x + i, w.y] : [w.x, w.y + i]));
    function pick(x, y) {
      const here = cw.words.filter((w) => cellsOf(w).some(([a, b]) => a === x && b === y));
      if (!here.length) return;
      const same = cur && here.includes(cur) && cellsOf(cur)[pos] && cellsOf(cur)[pos][0] === x && cellsOf(cur)[pos][1] === y;
      cur = same && here.length > 1 ? here.find((w) => w !== cur) : (here.includes(cur) ? cur : here[0]);
      pos = cellsOf(cur).findIndex(([a, b]) => a === x && b === y);
      paint(); keyIn.focus();
    }
    function paint() {
      const active = cur ? new Set(cellsOf(cur).map(([a, b]) => `${a},${b}`)) : new Set();
      const [px, py] = cur ? cellsOf(cur)[pos] || [] : [];
      cw.cells.forEach((row, y) => row.forEach((c, x) => {
        const el = els[y][x]; if (!el) return;
        el.querySelector('.l').textContent = fill[y][x];
        const k = `${x},${y}`;
        el.style.background = x === px && y === py ? 'var(--accent)' : active.has(k) ? 'var(--accent-ring)' : 'var(--surface)';
        el.style.color = x === px && y === py ? 'var(--accent-ink)' : wrong.has(k) ? '#c0392b' : 'var(--ink)';
      }));
      for (const [w, e] of clueEls) e.style.background = w === cur ? 'var(--soft)' : 'none';
      clueBar.textContent = cur ? `${cur.num} ${cur.dir === 'H' ? '→' : '↓'}  ${cur.clue}  (${cur.answer.length})` : 'Tocá una casilla para empezar';
    }
    function type(ch) {
      if (!cur) return;
      const [x, y] = cellsOf(cur)[pos];
      fill[y][x] = ch; wrong.delete(`${x},${y}`);
      if (pos < cur.answer.length - 1) pos++;
      paint(); checkDone();
    }
    function erase() {
      if (!cur) return;
      let [x, y] = cellsOf(cur)[pos];
      if (!fill[y][x] && pos > 0) { pos--; [x, y] = cellsOf(cur)[pos]; }
      fill[y][x] = ''; paint();
    }
    keyIn.value = ' ';
    keyIn.addEventListener('input', () => {
      const v = keyIn.value;
      if (v.length === 0) erase();
      else { const ch = letters(v.slice(-1)) || (v.slice(-1).toUpperCase() === 'Ñ' ? 'Ñ' : ''); if (ch) type(ch[0]); }
      keyIn.value = ' ';
    });
    keyIn.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && keyIn.value === ' ') { e.preventDefault(); erase(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (cur && pos < cur.answer.length - 1) { pos++; paint(); } }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (cur && pos > 0) { pos--; paint(); } }
    });

    let finished = false;
    function checkDone() {
      if (finished) return;
      const ok = cw.cells.every((row, y) => row.every((c, x) => !c || fill[y][x] === c.ch));
      if (!ok) return;
      finished = true; keyIn.blur();
      log('crucigrama', { words: cw.words.length });
      toast('¡Crucigrama completo!');
      clueBar.textContent = `¡Completo! ${cw.words.length} palabras.`;
    }
    const check = h('button', { type: 'button', class: 'pill' }, 'Comprobar');
    check.onclick = () => {
      wrong = new Set();
      cw.cells.forEach((row, y) => row.forEach((c, x) => { if (c && fill[y][x] && fill[y][x] !== c.ch) wrong.add(`${x},${y}`); }));
      paint(); toast(wrong.size ? `${wrong.size} letra${wrong.size > 1 ? 's' : ''} mal` : 'Todo bien hasta ahora');
    };
    const reveal = h('button', { type: 'button', class: 'pill' }, 'Revelar palabra');
    reveal.onclick = () => { if (!cur) return toast('Elegí una palabra primero'); cellsOf(cur).forEach(([x, y], i) => { fill[y][x] = cur.answer[i]; }); paint(); checkDone(); };
    body.replaceChildren(clueBar, h('div', { style: 'overflow-x:auto;padding:4px 0' }, board), keyIn, h('div', { class: 'row wrap', style: 'gap:8px;justify-content:center' }, check, reveal), lists);
    paint();
    cleanup = () => {};
  }
  await make();
  return () => cleanup();
}
