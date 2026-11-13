// Crossword from your own cards (FE-17): the answer is the card's Spanish, the clue its meaning.
// build(entries) → { w, h, cells[y][x] = { ch, num? } | null, words: [{ answer, clue, x, y, dir, num, entry }] }

export const letters = (t) => String(t || '').toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'Ñ').replace(/[^A-ZÑ]/g, '');

export function build(entries, max = 14) {
  const N = 40;
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  const placed = [];
  const list = entries.map((e) => ({ ...e, answer: letters(e.front) })).filter((e) => e.answer.length >= 3 && e.answer.length <= 13)
    .sort((a, b) => b.answer.length - a.answer.length);
  const seen = new Set();
  const uniq = list.filter((e) => !seen.has(e.answer) && seen.add(e.answer));

  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? grid[y][x] : null);
  function fits(word, x, y, dir) {
    const dx = dir === 'H' ? 1 : 0, dy = dir === 'H' ? 0 : 1;
    if (at(x - dx, y - dy) || at(x + dx * word.length, y + dy * word.length)) return -1;
    let cross = 0;
    for (let i = 0; i < word.length; i++) {
      const cx = x + dx * i, cy = y + dy * i;
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return -1;
      const c = grid[cy][cx];
      if (c) { if (c !== word[i]) return -1; cross++; continue; }
      // No touching neighbours alongside a new letter.
      if (at(cx + dy, cy + dx) || at(cx - dy, cy - dx)) return -1;
    }
    return cross;
  }
  function put(e, x, y, dir) {
    const dx = dir === 'H' ? 1 : 0, dy = dir === 'H' ? 0 : 1;
    for (let i = 0; i < e.answer.length; i++) grid[y + dy * i][x + dx * i] = e.answer[i];
    placed.push({ entry: e, answer: e.answer, x, y, dir });
  }
  for (const e of uniq) {
    if (placed.length >= max) break;
    if (!placed.length) { put(e, Math.floor((N - e.answer.length) / 2), Math.floor(N / 2), 'H'); continue; }
    let best = null;
    for (const p of placed) for (let i = 0; i < p.answer.length; i++) for (let j = 0; j < e.answer.length; j++) {
      if (p.answer[i] !== e.answer[j]) continue;
      const dir = p.dir === 'H' ? 'V' : 'H';
      const px = p.x + (p.dir === 'H' ? i : 0), py = p.y + (p.dir === 'H' ? 0 : i);
      const x = dir === 'H' ? px - j : px, y = dir === 'H' ? py : py - j;
      const c = fits(e.answer, x, y, dir);
      if (c > 0 && (!best || c > best.c)) best = { x, y, dir, c };
    }
    if (best) put(e, best.x, best.y, best.dir);
  }
  if (!placed.length) return null;
  // Crop and number.
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (const p of placed) {
    const len = p.answer.length;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.dir === 'H' ? p.x + len - 1 : p.x); y1 = Math.max(y1, p.dir === 'V' ? p.y + len - 1 : p.y);
  }
  const w = x1 - x0 + 1, ht = y1 - y0 + 1;
  const cells = Array.from({ length: ht }, (_, y) => Array.from({ length: w }, (_, x) => (grid[y + y0][x + x0] ? { ch: grid[y + y0][x + x0] } : null)));
  for (const p of placed) { p.x -= x0; p.y -= y0; }
  placed.sort((a, b) => a.y - b.y || a.x - b.x);
  let n = 0;
  const nums = new Map();
  for (const p of placed) {
    const k = `${p.x},${p.y}`;
    if (!nums.has(k)) nums.set(k, ++n);
    p.num = nums.get(k);
    cells[p.y][p.x].num = p.num;
    p.clue = p.entry.clue;
  }
  return { w, h: ht, cells, words: placed };
}
