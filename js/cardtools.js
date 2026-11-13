// Card tools: saving an edited note, duplicate detection and merging (FE-03), the AI proofreader (FE-16).
import { db } from './db.js';
import { ensureDeck } from './penumbra.js';
import { transcribe } from './ipa.js';

// --- Comparing fronts: ignores capitals, accents, punctuation and a leading article ("el laburo" = "laburo").
const ARTICLES = /^(el|la|los|las|lo|un|una|unos|unas|al|del)\s+/;
export function key(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(ARTICLES, '');
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// 'same' (identical once normalized) or 'close' (one letter off, or a plural) or null.
export function likeness(a, b) {
  const x = key(a), y = key(b);
  if (!x || !y) return null;
  if (x === y) return 'same';
  if (x.length >= 5 && y.length >= 5 && x.split(' ').length <= 3 && lev(x, y) <= 1) return 'close';
  if (x.replace(/s$/, '') === y.replace(/s$/, '') || x.replace(/es$/, '') === y.replace(/es$/, '')) return 'close';
  return null;
}

// Notes (grouped siblings) as { note, cards, front, deck }.
export async function notes(filter = () => true) {
  const map = new Map();
  for (const c of await db.all('cards')) {
    if (!filter(c)) continue;
    if (!map.has(c.note)) map.set(c.note, []);
    map.get(c.note).push(c);
  }
  return [...map].map(([note, cards]) => ({ note, cards: cards.sort((a, b) => a.created - b.created), front: cards[0].front, deck: cards[0].deck }));
}

// Saved items that look like `front` (any deck), closest first. Skips the note being edited.
export async function similar(front, exceptNote) {
  if (!key(front)) return [];
  const out = [];
  for (const n of await notes((c) => c.note !== exceptNote)) {
    const l = likeness(front, n.front);
    if (l) out.push({ ...n, likeness: l });
  }
  return out.sort((a, b) => (a.likeness === 'same' ? 0 : 1) - (b.likeness === 'same' ? 0 : 1)).slice(0, 5);
}

// Groups of look-alike notes inside one deck, for the batch tool.
export async function duplicateGroups(deckId) {
  const list = await notes((c) => c.deck === deckId);
  const used = new Set(), groups = [];
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    const g = [list[i]];
    for (let j = i + 1; j < list.length; j++) if (!used.has(j) && likeness(list[i].front, list[j].front)) { g.push(list[j]); used.add(j); }
    if (g.length > 1) groups.push(g);
  }
  return groups;
}

// Merges look-alike notes into the one you've practised most; empty fields are filled from the others.
export async function merge(group) {
  const reps = (n) => n.cards.reduce((s, c) => s + (c.reps || 0), 0);
  const [keep, ...rest] = [...group].sort((a, b) => reps(b) - reps(a) || a.cards[0].created - b.cards[0].created);
  const fill = {};
  for (const f of ['meaning', 'hint', 'context', 'image', 'audio', 'source', 'ipa']) {
    if (keep.cards[0][f]) continue;
    const from = rest.find((n) => n.cards[0][f]);
    if (from) fill[f] = from.cards[0][f];
  }
  // Card types the kept note lacks come over with their progress.
  const have = new Set(keep.cards.map((c) => c.type));
  for (const n of rest) for (const c of n.cards) {
    if (have.has(c.type)) { await db.remove('cards', c.id); continue; }
    have.add(c.type);
    await db.put('cards', { ...c, note: keep.note, id: `${keep.note}-m${Date.now().toString(36)}${c.type}`, front: keep.front });
    await db.remove('cards', c.id);
  }
  for (const c of keep.cards) await db.put('cards', { ...c, ...fill, updated: Date.now() });
  return keep;
}

// Saves an edited note: shared fields go to every sibling; added card types become new cards,
// removed ones are deleted, the rest keep their progress.
export async function saveNote(noteId, fields, types, deckName) {
  const sibs = (await db.all('cards')).filter((c) => c.note === noteId);
  const d = await ensureDeck(deckName);
  const base = sibs[0] || {};
  const now = Date.now();
  const ipa = fields.ipaMode === 'off' ? '' : fields.ipaMode === 'manual' ? fields.ipa : transcribe(fields.front);
  const shared = { ...fields, ipa, deck: d.id, updated: now };
  for (const c of sibs) {
    if (!types.includes(c.type)) await db.remove('cards', c.id);
    else await db.put('cards', { ...c, ...shared });
  }
  const have = new Set(sibs.map((c) => c.type));
  let i = sibs.length;
  for (const type of types) {
    if (have.has(type)) continue;
    await db.put('cards', {
      tag: base.tag || '', source: base.source, created: now + i,
      ...shared, id: `${noteId}-${i++}`, note: noteId, type, state: 'new', reps: 0, lapses: 0, passStreak: 0, suspended: null,
    });
  }
  return d;
}

// --- AI proofreader: flags a card that is unclear, too long, has a typo, or tests two things at once.
export async function proofread(f) {
  const { ask } = await import('./gemini.js');
  const r = await ask({
    system: 'Sos un editor de tarjetas de memoria (flashcards) para un estudiante de español rioplatense (Buenos Aires) cuya lengua es el inglés. Respetás el voseo y el lunfardo: no los "corregís" al español neutro. Respondés solo JSON.',
    turns: [{ role: 'user', text: `Tarjeta:
- frente (español): «${f.front}»
- significado (inglés): «${f.meaning || ''}»
- frase de ejemplo: «${f.context || ''}»
- nota: «${f.hint || ''}»

Revisá solo estos problemas: (1) error de ortografía o de tildes, (2) poco clara o ambigua, (3) demasiado larga para recordarla de una vez, (4) pregunta dos cosas a la vez, (5) el significado no corresponde al frente o al contexto, (6) la frase de ejemplo no contiene la palabra del frente.
Si está bien, devolvé {"ok": true, "issues": []}.
Si no, devolvé {"ok": false, "issues": [{"field": "front|meaning|context|hint", "problem": "explicación breve en español", "fix": "el texto completo corregido para ese campo"}]}. Máximo 4 problemas, solo reales.` }],
    json: true, temperature: 0.2, fast: true,
  });
  const fields = ['front', 'meaning', 'context', 'hint'];
  return { ok: !!r.ok, issues: (r.issues || []).filter((x) => fields.includes(x.field) && typeof x.fix === 'string') };
}
