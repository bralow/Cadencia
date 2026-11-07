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
      rows.get(key).push({ x: it.transform[4], str: it.str, size, w: it.width || 0 });
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
      if (text) lines.push({ text, page: n, y, x: items[0].x, size: Math.max(...items.map((i) => i.size)) });
    }
    if (onProgress) onProgress(n, doc.numPages);
  }
  return { lines, pages: doc.numPages, meta: (await doc.getMetadata().catch(() => null)) };
}

const TERMINAL = /[.!?…:;»"”)]$/;

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

  const isTitle = (l, i) => {
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
      cur = { title: l.text, paragraphs: [''], page: l.page };
      stories.push(cur);
      return;
    }
    if (!cur) { cur = { title: 'Inicio', paragraphs: [''], page: l.page }; stories.push(cur); }
    const prev = body[i - 1];
    const para = cur.paragraphs;
    const newPara = !para[para.length - 1] || (prev && prev.page === l.page && (prev.y - l.y > lineGap * 1.6)) || (l.x > minX + 6 && TERMINAL.test(para[para.length - 1]));
    if (newPara && para[para.length - 1]) para.push('');
    const last = para[para.length - 1];
    if (last.endsWith('-') && /^[a-záéíóúñ]/.test(l.text)) para[para.length - 1] = last.slice(0, -1) + l.text; // re-join hyphenated words
    else para[para.length - 1] = last ? `${last} ${l.text}` : l.text;
  });

  // Merge tiny fragments (index pages, captions) into nothing; keep real stories.
  const words = (s) => s.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  let out = stories.filter((s) => words(s) >= 12).map((s) => ({ ...s, paragraphs: s.paragraphs.filter(Boolean) }));
  // If titles weren't found, fall back to one "story" per page.
  if (out.length < 3) {
    out = [];
    for (let p = 1; p <= pages; p++) {
      const t = body.filter((l) => l.page === p).map((l) => l.text).join(' ').replace(/- ([a-záéíóúñ])/g, '$1');
      if (t.split(' ').length >= 12) out.push({ title: `Página ${p}`, paragraphs: [t], page: p });
    }
  }
  return out;
}

// Some PDFs embed fonts whose letters are mislabeled, so accented letters come out as symbols
// (á → •, ó → Û …). The mix-up is consistent, so it can be undone character by character.
const BROKEN = { '•': 'á', 'É': 'é', 'Í': 'í', 'Û': 'ó', '°': 'ú', 'Ó': 'ñ' };
const BROKEN_RE = /[•ÉÍÛ°Ó]/g;
// Only when the text is clearly affected: these symbols stuck inside words (e.g. "coraz Ûn", "a•o").
export function hasBrokenAccents(text) {
  return (text.match(/[a-z][•Û°Ó]|[•Û°Ó][a-z]/g) || []).length >= 5;
}
export const fixAccents = (t) => t.replace(BROKEN_RE, (c) => BROKEN[c]);
export function repairBook(book) {
  const all = book.stories.map((s) => s.title + ' ' + s.paragraphs.join(' ')).join(' ');
  if (!hasBrokenAccents(all)) return null;
  return { ...book, title: fixAccents(book.title), stories: book.stories.map((s) => ({ ...s, title: fixAccents(s.title), paragraphs: s.paragraphs.map(fixAccents) })) };
}

export async function importPdf(file, onProgress) {
  const { lines, pages, meta } = await pdfLines(file, onProgress);
  if (hasBrokenAccents(lines.map((l) => l.text).join(' '))) lines.forEach((l) => { l.text = fixAccents(l.text); });
  if (!lines.length) throw new Error('Este PDF no tiene texto seleccionable (parece escaneado como imagen).');
  const stories = splitStories(lines, pages);
  const title = (meta && meta.info && meta.info.Title) || file.name.replace(/\.pdf$/i, '');
  return { id: `${Date.now()}`, title, stories, added: Date.now() };
}
