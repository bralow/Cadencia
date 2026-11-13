import { h, iconEl, toast } from '../ui.js';
import { readTabs } from './leer.js';
import { db, persist } from '../db.js';
import { importPdf , repairBook } from '../book.js';
import { showWordPanel, tappableText, markWord, sentenceWith } from '../wordpanel.js';
import { checkVoseo, applyVoseo } from '../vosfix.js';
import { stopSpeaking } from '../tts.js';
import { translateStory } from '../traducir.js';
import { geminiReady } from '../gemini.js';
import { getSettings } from '../settings.js';

const READ_KEY = 'cadencia.read', NOTES_KEY = 'cadencia.notes', TR_KEY = 'cadencia.libros.tr';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
let openBook = null, openStory = null;

const tagFor = (book) => (/abrazos/i.test(book.title) ? '#LibroDeLosAbrazos' : '#Libro');

export async function render(main) {
  main.append(h('div', { class: 'between' }, readTabs('libros')));
  const books = await db.all('books');
  // Books imported before the accent fix get repaired once, in place.
  for (let i = 0; i < books.length; i++) {
    if (books[i].charFix >= 2) continue;
    const fixed = repairBook(books[i]); books[i] = fixed; await db.put('books', fixed);
    if (fixed.charMap.length) toast(`Arreglé ${fixed.charMap.length} letras mal escritas en «${fixed.title}»`);
  }
  if (openBook && openBook !== '__library__' && !books.some((b) => b.id === openBook)) { openBook = null; openStory = null; }
  if (!openBook && books.length === 1) openBook = books[0].id;
  const book = books.find((b) => b.id === openBook);
  if (book && openStory !== null && book.stories[openStory]) return storyView(main, book, openStory);
  if (book) return bookView(main, book, books.length);
  return libraryView(main, books);
}

// The same book imported before: same title, or mostly the same words (even if the file was renamed).
function sameBook(books, book) {
  const vocab = (b) => new Set(b.stories.flatMap((st) => st.paragraphs.join(' ').toLowerCase().match(/[a-záéíóúñü]{5,}/g) || []).slice(0, 20000));
  const mine = vocab(book);
  return books.find((b) => b.title.toLowerCase() === book.title.toLowerCase())
    || books.find((b) => { const v = vocab(b); let n = 0; for (const w of v) if (mine.has(w)) n++; return n / Math.max(1, Math.min(v.size, mine.size)) > 0.6; });
}

// A re-import of a book already on the phone: keep its id, page range, read marks and notes.
function replaceBook(old, book) {
  const pages = old.stories.map((st) => st.page).filter((x) => typeof x === 'number');
  if (pages.length) {
    const lo = Math.min(...pages), hi = Math.max(...pages);
    book.stories = book.stories.filter((st) => typeof st.page !== 'number' || (st.page >= lo && st.page <= hi));
  }
  const byPage = (list) => { const m = new Map(); list.forEach((i) => { const st = old.stories[i]; if (st && typeof st.page === 'number') m.set(st.page, i); }); return m; };
  const reads = load(READ_KEY), notes = load(NOTES_KEY);
  const readPages = new Set((reads[old.id] || []).map((i) => old.stories[i] && old.stories[i].page));
  const noteFor = byPage(Object.keys(notes[old.id] || {}).map(Number));
  const newReads = [], newNotes = {};
  book.stories.forEach((st, i) => {
    if (readPages.has(st.page)) newReads.push(i);
    if (noteFor.has(st.page)) newNotes[i] = notes[old.id][noteFor.get(st.page)];
  });
  book.id = old.id; book.title = old.title;
  reads[old.id] = newReads; notes[old.id] = newNotes;
  save(READ_KEY, reads); save(NOTES_KEY, notes);
}

function importCard(main) {
  const status = h('p', { class: 'small', role: 'status' });
  const input = h('input', { type: 'file', accept: '.pdf,application/pdf', id: 'pdf' });
  const btn = h('label', { for: 'pdf', class: 'btn', role: 'button', tabindex: '0' }, 'Importar un PDF');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Leyendo el PDF…';
    try {
      await persist();
      const book = await importPdf(file, (n, t) => { status.textContent = `Leyendo página ${n} de ${t}…`; });
      if (!book.stories.length) throw new Error('No encontré texto para leer.');
      const old = sameBook(await db.all('books'), book);
      if (old && window.confirm(`Ya tenés «${old.title}». ¿Reemplazarlo por esta versión? Se conservan el recorte de páginas, los relatos leídos y tus notas.`)) {
        replaceBook(old, book);
      }
      await db.put('books', book);
      openBook = book.id; openStory = null;
      toast(`${book.stories.length} relatos importados`);
      window.dispatchEvent(new Event('cadencia:rerender'));
    } catch (err) { status.textContent = 'No se pudo importar: ' + (err.message || err); }
    input.value = '';
  };
  main.append(h('section', { class: 'card' },
    h('h2', {}, 'Tus libros'),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Importá un PDF tuyo (por ejemplo, El libro de los abrazos). Penumbra separa los relatos y los guarda solo en este teléfono: no se suben a ningún lado.'),
    btn, input, status));
}

function libraryView(main, books) {
  importCard(main);
  for (const b of books) {
    const read = (load(READ_KEY)[b.id] || []).length;
    const open = h('button', { type: 'button', class: 'card', style: 'text-align:left;cursor:pointer;font:inherit;color:inherit' },
      h('h2', {}, b.title), h('span', { class: 'muted small' }, `${read} de ${b.stories.length} relatos leídos`));
    open.onclick = () => { openBook = b.id; openStory = null; window.dispatchEvent(new Event('cadencia:rerender')); };
    main.append(open);
  }
}

function bookView(main, book, count) {
  const read = new Set(load(READ_KEY)[book.id] || []);
  const header = h('div', { style: 'display:flex;flex-direction:column;gap:4px' },
    h('h1', { style: 'font-size:26px' }, book.title),
    h('span', { class: 'muted small' }, `${read.size} de ${book.stories.length} relatos leídos`),
    book.charMap && book.charMap.length ? h('span', { class: 'muted small' }, 'Letras arregladas: ' + book.charMap.slice(0, 6).map((m) => `${m.from} → ${m.to}`).join(' · ') + (book.charMap.length > 6 ? ` y ${book.charMap.length - 6} más` : '')) : '');
  const progress = h('div', { class: 'progress' }, h('div', { style: `width:${(read.size / book.stories.length) * 100}%` }));
  const search = h('input', { type: 'search', placeholder: 'Buscar un relato…', 'aria-label': 'Buscar un relato', autocomplete: 'off',
    style: 'min-height:48px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:16px;width:100%' });
  const list = h('div', { class: 'list' });
  main.append(header, progress, search, list);

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...book.stories.map((s, i) => ({ s, i })).filter(({ s }) => !q || s.title.toLowerCase().includes(q) || s.paragraphs.join(' ').toLowerCase().includes(q)).map(({ s, i }) => {
      const b = h('button', { type: 'button', class: 'card item', style: 'flex-direction:row;align-items:center;text-align:left;cursor:pointer;font:inherit;color:inherit;padding:12px 14px' },
        h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px' },
          h('span', { style: 'font-family:var(--display);font-size:17px;font-weight:600' }, s.title),
          h('span', { class: 'muted small', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, s.paragraphs[0])),
        read.has(i) ? h('span', { 'aria-label': 'leído', style: 'color:var(--accent);font-weight:700;font-size:18px' }, '✓') : '');
      b.onclick = () => { openStory = i; window.dispatchEvent(new Event('cadencia:rerender')); };
      return b;
    }));
  };
  search.oninput = draw;
  draw();

  const del = h('button', { type: 'button', class: 'btn ghost' }, 'Borrar este libro del teléfono');
  del.onclick = async () => {
    if (!window.confirm(`¿Borrar “${book.title}” del teléfono? Tus notas también se borran.`)) return;
    await db.remove('books', book.id);
    const r = load(READ_KEY); delete r[book.id]; save(READ_KEY, r);
    const n = load(NOTES_KEY); delete n[book.id]; save(NOTES_KEY, n);
    openBook = null; window.dispatchEvent(new Event('cadencia:rerender'));
  };
  // Keep only a page range (drops front matter, index, back matter).
  const pageOf = (st) => st.page ?? (Number((st.title.match(/^Página (\d+)$/) || [])[1]) || null);
  const pages = book.stories.map(pageOf).filter((x) => x !== null);
  if (pages.length) {
    const from = h('input', { type: 'number', inputmode: 'numeric', id: 'pfrom', value: String(Math.min(...pages)), min: '1', style: 'width:90px;min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 10px;font-size:16px' });
    const to = h('input', { type: 'number', inputmode: 'numeric', id: 'pto', value: String(Math.max(...pages)), min: '1', style: 'width:90px;min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 10px;font-size:16px' });
    const apply = h('button', { type: 'button', class: 'btn' }, 'Recortar');
    apply.onclick = async () => {
      const a = Number(from.value), z = Number(to.value);
      if (!a || !z || a > z) { toast('Revisá las páginas'); return; }
      const kept = book.stories.filter((st) => { const pg = pageOf(st); return pg === null || (pg >= a && pg <= z); });
      if (!kept.length) { toast('No queda ningún relato en ese rango'); return; }
      if (!window.confirm(`¿Quedarte con las páginas ${a} a ${z}? Se quitan ${book.stories.length - kept.length} partes del libro en el teléfono.`)) return;
      // Re-key read marks and notes to the new positions.
      const map = new Map(kept.map((st, i) => [book.stories.indexOf(st), i]));
      const r = load(READ_KEY); r[book.id] = (r[book.id] || []).filter((i) => map.has(i)).map((i) => map.get(i)); save(READ_KEY, r);
      const n = load(NOTES_KEY); const old = n[book.id] || {}; n[book.id] = Object.fromEntries(Object.entries(old).filter(([i]) => map.has(Number(i))).map(([i, v]) => [map.get(Number(i)), v])); save(NOTES_KEY, n);
      await db.put('books', { ...book, stories: kept });
      toast(`Listo: ${kept.length} partes`);
      window.dispatchEvent(new Event('cadencia:rerender'));
    };
    main.append(h('section', { class: 'card', style: 'gap:8px' },
      h('h2', { style: 'font-size:18px' }, 'Recortar el libro'),
      h('p', { class: 'muted small' }, 'Quedate solo con las páginas de los relatos (sin índice, prólogo ni contratapa).'),
      h('div', { class: 'row wrap', style: 'gap:10px' },
        h('label', { for: 'pfrom', class: 'small', style: 'font-weight:600' }, 'Desde'), from,
        h('label', { for: 'pto', class: 'small', style: 'font-weight:600' }, 'hasta'), to, apply)));
  }
  const others = h('button', { type: 'button', class: 'btn ghost' }, count > 1 ? 'Ver todos los libros' : 'Importar otro PDF');
  others.onclick = () => { openBook = '__library__'; window.dispatchEvent(new Event('cadencia:rerender')); };
  main.append(h('div', { class: 'row wrap' }, others, del));
}

function storyView(main, book, i) {
  const s = book.stories[i];
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Relatos');
  back.onclick = () => { openStory = null; window.dispatchEvent(new Event('cadencia:rerender')); };
  const go = (d) => { openStory = i + d; window.dispatchEvent(new Event('cadencia:rerender')); };
  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Relato anterior', disabled: i === 0 }, iconEl('prev'));
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Relato siguiente', disabled: i === book.stories.length - 1 }, iconEl('next'));
  prev.onclick = () => go(-1); next.onclick = () => go(1);
  main.append(h('div', { class: 'between' }, back, h('div', { class: 'row', style: 'gap:0' }, prev, h('span', { class: 'muted small' }, `${i + 1} / ${book.stories.length}`), next)));

  const panel = h('section', { class: 'hero', 'aria-label': 'Palabra seleccionada', 'aria-live': 'polite', hidden: true, style: 'padding:16px 18px;gap:10px' });
  const article = h('article', { class: 'card', style: 'gap:14px;padding:20px' });
  const notesBox = h('div');
  const trBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px', 'aria-pressed': 'false', hidden: !geminiReady() && !s.tr }, 'Traducir');
  let showTr = load(TR_KEY).on === true && !!s.tr;
  const trStyle = 'font-size:15px;line-height:1.5;color:var(--muted);font-style:italic;border-left:3px solid var(--line);padding-left:10px';
  function drawStory() {
    trBtn.setAttribute('aria-pressed', String(showTr));
    trBtn.textContent = showTr ? 'Ocultar traducción' : 'Traducir';
    article.replaceChildren(h('h1', { style: 'font-size:26px' }, s.title), showTr && s.tr.title ? h('p', { style: trStyle }, s.tr.title) : '');
    s.paragraphs.forEach((para, k) => {
      article.append(tappableText(para, (word, b) => { markWord(article, b); showWordPanel(panel, word, { context: sentenceWith(para, word), tag: tagFor(book) }); },
        'font-family:var(--display);font-size:19px;line-height:1.7'));
      if (showTr && s.tr.paragraphs[k]) article.append(h('p', { style: trStyle, lang: 'en' }, s.tr.paragraphs[k]));
    });
    notesBox.replaceChildren(showTr && s.tr.notes.length ? h('section', { class: 'card', style: 'gap:8px' },
      h('span', { class: 'kicker' }, 'PARA ENTENDER'),
      ...s.tr.notes.map((n) => h('p', { class: 'small', style: 'line-height:1.45' }, h('b', {}, n.phrase), ' — ', n.note))) : '');
  }
  trBtn.onclick = async () => {
    if (showTr) { showTr = false; save(TR_KEY, { on: false }); drawStory(); return; }
    if (!s.tr) {
      trBtn.disabled = true; trBtn.textContent = 'Traduciendo…';
      try {
        s.tr = await translateStory(s.title, s.paragraphs, getSettings().level);
        await db.put('books', book); // saved with the book: each story is translated once
      } catch (err) { toast('No pude traducir: ' + (err.message || err)); trBtn.disabled = false; drawStory(); return; }
      trBtn.disabled = false;
    }
    showTr = true; save(TR_KEY, { on: true }); drawStory();
  };
  drawStory();
  main.append(h('div', { class: 'between' }, h('p', { class: 'muted small', style: 'flex:1' }, 'Tocá una palabra para ver sílabas, sonidos, el DLE y guardarla.'), trBtn), article, notesBox, panel);

  const reads = load(READ_KEY);
  const isRead = () => (reads[book.id] || []).includes(i);
  const readBtn = h('button', { type: 'button', class: 'btn' });
  const paintRead = () => { readBtn.textContent = isRead() ? '✓ Leído' : 'Marcar como leído'; readBtn.className = isRead() ? 'btn ghost' : 'btn'; };
  readBtn.onclick = () => {
    const set = new Set(reads[book.id] || []);
    if (set.has(i)) set.delete(i); else set.add(i);
    reads[book.id] = [...set]; save(READ_KEY, reads); paintRead();
  };
  paintRead();
  main.append(readBtn);

  // El Rincón de Escritura: a note per story, with an offline voseo check.
  const notes = load(NOTES_KEY);
  const area = h('textarea', { rows: '5', id: 'rincon', placeholder: '¿Qué te dejó este relato? Escribí con vos…',
    style: 'width:100%;border-radius:14px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:12px 14px;font-family:var(--body);font-size:16px;line-height:1.5;resize:vertical' });
  area.value = ((notes[book.id] || {})[i]) || '';
  let t = 0;
  area.oninput = () => { clearTimeout(t); t = setTimeout(() => { const n = load(NOTES_KEY); n[book.id] = { ...(n[book.id] || {}), [i]: area.value }; save(NOTES_KEY, n); }, 400); };
  const checkBtn = h('button', { type: 'button', class: 'pill' }, 'Revisar voseo');
  const results = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:6px' });
  checkBtn.onclick = () => {
    const fixes = checkVoseo(area.value);
    if (!fixes.length) { results.replaceChildren(h('p', { class: 'small', style: 'font-weight:700;color:var(--accent)' }, area.value.trim() ? '¡Todo en voseo! Nada que corregir.' : 'Escribí algo primero.')); return; }
    const apply = h('button', { type: 'button', class: 'btn', style: 'align-self:flex-start' }, 'Aplicar todo');
    apply.onclick = () => { area.value = applyVoseo(area.value, fixes); area.oninput(); results.replaceChildren(h('p', { class: 'small', style: 'font-weight:700;color:var(--accent)' }, 'Listo, quedó en voseo.')); };
    results.replaceChildren(...fixes.map((f) => h('div', { class: 'small', style: 'line-height:1.4' },
      h('s', { class: 'muted' }, f.original), ' → ', h('b', { style: 'color:var(--accent)' }, f.suggestion), h('span', { class: 'muted' }, ` · ${f.note}`))), apply);
  };
  main.append(h('section', { class: 'card' },
    h('label', { for: 'rincon', style: 'font-family:var(--display);font-size:20px;font-weight:600' }, 'El Rincón de Escritura'),
    area, h('div', { class: 'row' }, checkBtn, h('span', { class: 'muted small' }, 'Se guarda solo.')), results));
  return () => stopSpeaking();
}
