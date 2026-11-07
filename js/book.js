import { inferFix } from './fixtext.js';
// Turns a PDF the user owns into a list of stories, entirely on the phone.
// Titles are found by font size when the PDF has it, else by "short line, no final period".
let pdfjs;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

async function pdfLines(file, onProgress) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const size = Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10 || it.height || 0;
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: it.transform[4], str: it.str, size, w: it.width || 0, font: it.fontName, eol: !!it.hasEOL });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const items = rows.get(y).sort((a, b) => a.x - b.x);
      let text = '';
      items.forEach((it, i) => {
        const prev = items[i - 1];
        const gap = prev ? it.x - (prev.x + prev.w) : 0;
        text += (prev && gap > 1 && !text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      });
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      // Font that covers most of the line (titles often have their own font).
      const fc = new Map();
      items.forEach((it) => fc.set(it.font, (fc.get(it.font) || 0) + it.str.length));
      const font = [...fc.entries()].sort((a, b) => b[1] - a[1])[0][0];
      // A word split across lines: ends in "letter-" exactly where the PDF ends the line.
      // ("—dijo—" at a line end is a closing dash, not a split word.)
      const hyph = !!items[items.length - 1].eol && /\S-$/.test(text) && !/(^|\s)-\S+-$/.test(text);
      lines.push({ text, page: n, y, x: items[0].x, size: Math.max(...items.map((i) => i.size)), font, hyph });
    }
    if (onProgress) onProgress(n, doc.numPages);
  }
  return { lines, pages: doc.numPages, meta: (await doc.getMetadata().catch(() => null)) };
}

const TERMINAL = /[.!?…:;»"”)]$/;

// Adds a line to a paragraph, re-joining a word split across lines ("Co-" + "lombia").
function joinLine(acc, prevLine, text) {
  if (!acc) return text;
  const split = prevLine && prevLine.hyph !== undefined ? prevLine.hyph : /[a-záéíóúñ]-$/i.test(acc) && /^[a-záéíóúñ]/.test(text);
  return split && acc.endsWith('-') ? acc.slice(0, -1) + text : `${acc} ${text}`;
}

// Dialogue dashes stored as plain hyphens: a "-" without letters on both sides is a dash (—),
// except the hyphen of a word split at the end of the line.
export function fixDashes(line) {
  const t = line.text;
  if (!t.includes('-')) return;
  const letter = (c) => !!c && /[^\s\-—.,;:!?¿¡«»"'()\[\]]/.test(c);
  let out = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '-') { out += t[i]; continue; }
    const isEnd = i === t.length - 1;
    out += (letter(t[i - 1]) && letter(t[i + 1])) || (isEnd && line.hyph) ? '-' : '—';
  }
  line.text = out.replace(/^— (?=\S)/, '—');
}

export function splitStories(lines, pages) {
  // Drop page numbers and running headers/footers (same text on many pages).
  const norm = (t) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
  const pagesOf = new Map();
  for (const l of lines) { const k = norm(l.text); if (!pagesOf.has(k)) pagesOf.set(k, new Set()); pagesOf.get(k).add(l.page); }
  const body = lines.filter((l) => !/^[\divxlc]+$/i.test(l.text) && !(pagesOf.get(norm(l.text)).size >= Math.min(3, pages) && pagesOf.get(norm(l.text)).size > pages * 0.2));
  if (!body.length) return [];

  // Typical body font size and left margin.
  const count = new Map();
  body.forEach((l) => count.set(l.size, (count.get(l.size) || 0) + l.text.length));
  const bodySize = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sizes = new Set(body.map((l) => l.size));

  // Titles in their own font: a font other than the body's, on short lines that stand alone.
  const headFont = (() => {
    const st = new Map();
    body.forEach((l, i) => {
      const s = st.get(l.font) || { n: 0, words: 0, alone: 0, chars: 0 };
      const prev = body[i - 1], next = body[i + 1];
      s.n++; s.chars += l.text.length; s.words += l.text.split(' ').length;
      if ((!prev || prev.page !== l.page || prev.font !== l.font) && (!next || next.page !== l.page || next.font !== l.font)) s.alone++;
      st.set(l.font, s);
    });
    const bodyFont = [...st.entries()].sort((a, b) => b[1].chars - a[1].chars)[0][0];
    const cands = [...st.entries()].filter(([f, s]) => f && f !== bodyFont && s.n >= 5 && s.alone / s.n >= 0.85 && s.words / s.n <= 8);
    return cands.length ? cands.sort((a, b) => b[1].n - a[1].n)[0][0] : null;
  })();

  const isTitle = (l, i) => {
    if (headFont) return l.font === headFont && l.text.length >= 2;
    const words = l.text.split(' ').length;
    if (words > 9 || l.text.length < 2) return false;
    const next = body[i + 1];
    if (!next) return false;
    if (sizes.size > 1 && bodySize) return l.size >= bodySize * 1.12 && !TERMINAL.test(l.text);
    const prev = body[i - 1];
    const prevEnds = !prev || TERMINAL.test(prev.text) || prev.page !== l.page;
    return prevEnds && !TERMINAL.test(l.text) && !l.text.endsWith('-') && /^[A-ZÁÉÍÓÚÑ¿¡"«]/.test(l.text);
  };

  const stories = [];
  let cur = null;
  const lineGap = (() => {
    const gaps = [];
    for (let i = 1; i < body.length; i++) if (body[i].page === body[i - 1].page) gaps.push(body[i - 1].y - body[i].y);
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] || 12;
  })();
  const minX = Math.min(...body.map((l) => l.x));

  body.forEach((l, i) => {
    if (isTitle(l, i)) {
      const prev = body[i - 1];
      // A title that runs over two lines.
      if (cur && prev && prev.page === l.page && isTitle(prev, i - 1) && !cur.paragraphs.join('')) { cur.title += ` ${l.text}`; return; }
      cur = { title: l.text, paragraphs: [''], page: l.page };
      stories.push(cur);
      return;
    }
    if (!cur) { cur = { title: 'Inicio', paragraphs: [''], page: l.page }; stories.push(cur); }
    const prev = body[i - 1];
    const para = cur.paragraphs;
    const newPara = !para[para.length - 1] || (prev && prev.page === l.page && (prev.y - l.y > lineGap * 1.6)) || (l.x > minX + 6 && TERMINAL.test(para[para.length - 1]));
    if (newPara && para[para.length - 1]) para.push('');
    para[para.length - 1] = joinLine(para[para.length - 1], prev, l.text);
  });

  // Merge tiny fragments (index pages, captions) into nothing; keep real stories.
  const words = (s) => s.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  let out = stories.filter((s) => words(s) >= 12).map((s) => ({ ...s, title: s.title.trim(), paragraphs: s.paragraphs.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean) }));
  // If titles weren't found, fall back to one "story" per page.
  if (out.length < 3) {
    out = [];
    for (let p = 1; p <= pages; p++) {
      const ls = body.filter((l) => l.page === p);
      const t = ls.reduce((acc, l, k) => joinLine(acc, ls[k - 1], l.text), '');
      if (t.split(' ').length >= 12) out.push({ title: `Página ${p}`, paragraphs: [t], page: p });
    }
  }
  return out;
}

// Some PDFs embed fonts that mislabel letters (á, ñ, ¿ come out as other symbols). fixtext.js works
// out the mix-up from the book itself.
export function repairBook(book) {
  const all = [book.title, ...book.stories.flatMap((s) => [s.title, ...s.paragraphs])].join('\n');
  const { map, fix } = inferFix(all);
  const done = { ...book, charFix: 2, charMap: [...(book.charMap || []), ...map] };
  if (!map.length) return done;
  return { ...done, title: fix(book.title), stories: book.stories.map((s) => ({ ...s, title: fix(s.title), paragraphs: s.paragraphs.map(fix) })) };
}

export async function importPdf(file, onProgress) {
  const { lines, pages, meta } = await pdfLines(file, onProgress);
  const { map, fix } = inferFix(lines.map((l) => l.text).join('\n'));
  if (map.length) lines.forEach((l) => { l.text = fix(l.text); });
  lines.forEach(fixDashes);
  if (!lines.length) throw new Error('Este PDF no tiene texto seleccionable (parece escaneado como imagen).');
  const stories = splitStories(lines, pages);
  const title = (meta && meta.info && meta.info.Title) || file.name.replace(/\.pdf$/i, '');
  return { id: `${Date.now()}`, title, stories, added: Date.now(), charFix: 2, charMap: map };
}
