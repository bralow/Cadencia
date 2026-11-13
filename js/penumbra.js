// Penumbra: cards, decks, the daily queue and the review log, on top of fsrs.js.
// A "note" is one saved thing (a word, a sentence); it becomes one or more cards (siblings),
// one per card type, scheduled separately.
import { db } from './db.js';
import { answer as fsrsAnswer, DEFAULTS } from './fsrs.js';
import { transcribe } from './ipa.js';

const SKEY = 'penumbra.settings';
export const TYPES = {
  reconocer: 'Reconocer',
  producir: 'Producir',
  escuchar: 'Escuchar',
  completar: 'Completar',
  pronunciar: 'Pronunciar',
};

export function settings() {
  try { return { newPerDay: 10, timer: 20, leech: 6, mastery: 8, retention: 0.9, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; }
  catch { return { newPerDay: 10, timer: 20, leech: 6, mastery: 8, retention: 0.9 }; }
}
export function saveSettings(patch) {
  const v = { ...settings(), ...patch };
  try { localStorage.setItem(SKEY, JSON.stringify(v)); } catch { /* ignore */ }
  return v;
}
const schedOpts = () => { const s = settings(); return { ...DEFAULTS, retention: s.retention, leech: s.leech, mastery: s.mastery }; };

export const dayStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayEnd = (t = Date.now()) => dayStart(t) + 86400000;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Which deck a saved item goes to, from the tag the module gives it.
const DECK_BY_TAG = {
  '#Lunfardo': 'Lunfardo', '#ArgenTalk': 'ArgenTalk', '#LibroDeLosAbrazos': 'Libros', '#Libro': 'Libros',
  '#Lectura': 'Lectura', '#Charla': 'Charla', '#Escribir': 'Escribir y Diario', '#Diario': 'Escribir y Diario',
  '#Sombra': 'Sombra', '#Vos': 'Vos', '#Oído': 'Pronunciación', '#Oido': 'Pronunciación', '#IPA': 'Pronunciación',
  '#Trabalenguas': 'Pronunciación', '#Cultura': 'Cultura', '#FraseDelDía': 'Frases', '#Recetas': 'Recetas',
  '#Recetario': 'Recetas', '#Cocina': 'Recetas', '#Cognados': 'Cognados',
};
const PRON_TAGS = new Set(['#Oído', '#Oido', '#IPA', '#Trabalenguas']);
const DECK_COLORS = ['#3a6ea5', '#b5462a', '#2e7d6b', '#a0761a', '#7b4fa3', '#c2185b', '#5d6d7e', '#00838f'];

export async function decks() {
  return (await db.all('decks')).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export async function ensureDeck(name) {
  const all = await db.all('decks');
  const found = all.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  const d = { id: uid(), name, color: DECK_COLORS[all.length % DECK_COLORS.length], created: Date.now() };
  await db.put('decks', d);
  return d;
}

const words = (t) => (t || '').trim().split(/\s+/).filter(Boolean);
const strip = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// Creates the cards for one saved item. Returns the cards made (skips if the same front is already in the deck).
export async function addNote({ front, back = '', meaning = '', ipa, tag = '', deck, audio, source, types }) {
  front = (front || '').trim();
  if (!front) return [];
  const d = await ensureDeck(deck || DECK_BY_TAG[tag] || 'General');
  const existing = (await db.all('cards')).filter((c) => c.deck === d.id && strip(c.front) === strip(front));
  if (existing.length) return [];
  const isWord = words(front).length <= 3;
  const context = back && strip(back).includes(strip(front)) && words(back).length > words(front).length ? back : '';
  if (!types) {
    types = ['reconocer'];
    if (isWord && context) types.push('completar');
    else if (isWord && (meaning || back)) types.push('producir');
    if (!isWord && (audio || source)) types.push('escuchar');
    if (PRON_TAGS.has(tag)) types.push('pronunciar');
  }
  const note = uid(), now = Date.now();
  const cards = types.map((type, i) => ({
    id: `${note}-${i}`, note, deck: d.id, type, front, back, meaning, context,
    ipa: ipa || transcribe(front), tag, audio: audio || undefined, source: source || undefined,
    created: now + i, updated: now, state: 'new', reps: 0, lapses: 0, passStreak: 0, suspended: null,
  }));
  for (const c of cards) await db.put('cards', c);
  return cards;
}

// Every existing "Guardar" button writes to the old Mazo; this turns that save into Penumbra cards too.
export async function fromMazo(rec) {
  const cards = await addNote({ front: rec.front, back: rec.back || '', ipa: rec.ipa, tag: rec.tag || '', audio: rec.audio, source: rec.source });
  if (cards.length) fillMeaning(cards).catch(() => {});
  return cards;
}

// --- Step 6: moving the old Mazo into Penumbra. Each Mazo item becomes a note in the deck its tag points to.
// Done items are remembered by id (the Mazo itself stays, for the Anki export).
const MIG = 'penumbra.migrated';
const migrated = () => { try { return new Set(JSON.parse(localStorage.getItem(MIG) || '[]')); } catch { return new Set(); } };
export async function pendingMazo() {
  const done = migrated();
  const have = new Set((await db.all('cards')).map((c) => strip(c.front)));
  const out = [];
  for (const r of await db.all('mazo')) {
    if (done.has(r.id)) continue;
    if (have.has(strip(r.front || ''))) { done.add(r.id); continue; } // already turned into cards when it was saved
    out.push(r);
  }
  try { localStorage.setItem(MIG, JSON.stringify([...done])); } catch { /* ignore */ }
  return out.sort((a, b) => a.created - b.created);
}
export async function migrateMazo(onProgress = () => {}) {
  const items = await pendingMazo();
  const done = migrated();
  const made = [], decksUsed = new Map();
  let skipped = 0;
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const cards = await addNote({ front: r.front, back: r.back || '', ipa: r.ipa, tag: r.tag || '', audio: r.audio, source: r.source });
    if (cards.length) { made.push(cards); decksUsed.set(cards[0].deck, (decksUsed.get(cards[0].deck) || 0) + 1); } else skipped++;
    done.add(r.id);
    if (i % 10 === 9 || i === items.length - 1) { try { localStorage.setItem(MIG, JSON.stringify([...done])); } catch { /* ignore */ } onProgress(i + 1, items.length); }
  }
  return { total: items.length, created: made.length, skipped, decks: decksUsed, notes: made.map((c) => c[0].note) };
}

// Meanings for many notes at once: one Gemini request per 20, instead of one per card.
export async function fillMeanings(noteIds, onProgress = () => {}) {
  const { geminiReady, ask } = await import('./gemini.js');
  if (!geminiReady()) return 0;
  const all = await db.all('cards');
  const byNote = new Map();
  for (const c of all) if (noteIds.includes(c.note)) { if (!byNote.has(c.note)) byNote.set(c.note, []); byNote.get(c.note).push(c); }
  const todo = [...byNote].filter(([, cs]) => !cs[0].meaning);
  let done = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const list = batch.map(([, cs], k) => `${k + 1}. «${cs[0].front}»${cs[0].back ? ` — nota: «${cs[0].back.slice(0, 160)}»` : ''}`).join('\n');
    try {
      const r = await ask({
        system: 'Sos un diccionario rioplatense-inglés para un estudiante cuya lengua es el inglés. Respondés solo JSON.',
        turns: [{ role: 'user', text: `Para cada ítem (palabra o frase en español rioplatense), dame el significado en inglés: breve para palabras (2 a 6 palabras), una traducción natural para frases. Usá la nota si ayuda a entender el sentido. "hint": nota muy corta en español sobre registro o uso rioplatense, o vacío.\n${list}\nDevolvé {"items": [{"n": 1, "meaning": "...", "hint": "..."}]}` }],
        json: true, temperature: 0.2, fast: true,
      });
      for (const it of r.items || []) {
        const entry = batch[Number(it.n) - 1];
        if (!entry || !it.meaning) continue;
        for (const c of entry[1]) { const cur = await db.get('cards', c.id); if (cur && !cur.meaning) await db.put('cards', { ...cur, meaning: String(it.meaning), hint: cur.hint || String(it.hint || '') }); }
        done++;
      }
    } catch (e) { if (i === 0) throw e; } // first batch failing (no key, quota) stops; later hiccups are skipped
    onProgress(Math.min(todo.length, i + 20), todo.length);
  }
  return done;
}

// Short English meaning for word cards, from Gemini when a key is set (best effort, in the background).
export async function fillMeaning(cards) {
  const word = cards[0];
  if (!word || word.meaning || words(word.front).length > 3) return;
  const { geminiReady, ask } = await import('./gemini.js');
  if (!geminiReady()) return;
  const r = await ask({
    system: 'Sos un diccionario rioplatense-inglés. Respondés solo JSON.',
    turns: [{ role: 'user', text: `Palabra o expresión: «${word.front}».${word.context ? ` Contexto: «${word.context}».` : ''}\nDevolvé {"meaning": "significado breve en inglés (2 a 6 palabras), el del contexto si hay", "note": "nota muy corta en español: registro o uso rioplatense, o vacío"}` }],
    json: true, temperature: 0.2, fast: true,
  });
  for (const c of cards) {
    const cur = await db.get('cards', c.id);
    if (cur && !cur.meaning) await db.put('cards', { ...cur, meaning: String(r.meaning || ''), hint: String(r.note || '') });
  }
}

export async function updateCard(c) { await db.put('cards', { ...c, updated: Date.now() }); }
export async function deleteNote(note) { for (const c of (await db.all('cards')).filter((x) => x.note === note)) await db.remove('cards', c.id); }

async function todaysLog() { const s = dayStart(); return (await db.all('revlog')).filter((r) => r.ts >= s); }

// The day's work: due reviews (overdue first), learning steps, and new cards up to the daily limit.
// Siblings: only one card of a note per day, so one direction doesn't give the other away.
export async function buildQueue(now = Date.now()) {
  const st = settings();
  const all = (await db.all('cards')).filter((c) => !c.suspended);
  const log = await todaysLog();
  const seenNotes = new Set(log.map((r) => r.note));
  const seenCards = new Set(log.map((r) => r.card));
  const newToday = new Set(log.filter((r) => r.wasNew).map((r) => r.card)).size;
  const sod = dayStart(now), eod = dayEnd(now);

  const learning = all.filter((c) => c.state === 'learn' || c.state === 'relearn').sort((a, b) => a.due - b.due);
  const usedNotes = new Set(learning.map((c) => c.note));
  const reviews = [];
  for (const c of all.filter((x) => x.state === 'review' && x.due < eod).sort((a, b) => a.due - b.due)) {
    if (usedNotes.has(c.note) || (seenNotes.has(c.note) && !seenCards.has(c.id))) continue; // sibling buried until tomorrow
    usedNotes.add(c.note); reviews.push(c);
  }
  const fresh = [];
  for (const c of all.filter((x) => x.state === 'new').sort((a, b) => a.created - b.created)) {
    if (fresh.length >= Math.max(0, st.newPerDay - newToday)) break;
    if (usedNotes.has(c.note) || seenNotes.has(c.note)) continue;
    usedNotes.add(c.note); fresh.push(c);
  }
  return {
    learning, reviews, fresh,
    overdue: reviews.filter((c) => c.due < sod).length,
    counts: { review: reviews.length, fresh: fresh.length, learning: learning.filter((c) => c.due < eod).length, overdue: reviews.filter((c) => c.due < sod).length },
  };
}

// Picks what to show next. Learning steps that are due come first; new cards are mixed in
// one after every four reviews; a learning card up to 20 minutes early when nothing else is left.
export function nextCard(q, done, now = Date.now()) {
  const dueLearn = q.learning.find((c) => c.due <= now);
  if (dueLearn) return dueLearn;
  const mixNew = q.fresh.length && (done % 5 === 4 || !q.reviews.length);
  if (mixNew) return q.fresh[0];
  if (q.reviews.length) return q.reviews[0];
  if (q.fresh.length) return q.fresh[0];
  const soon = q.learning.find((c) => c.due <= now + 20 * 60000);
  return soon || null;
}

// Records an answer and moves the card in the queue. Returns the updated card.
export async function answerCard(q, card, pass, ms) {
  const now = Date.now();
  const updated = fsrsAnswer(card, pass, now, schedOpts());
  await db.put('cards', updated);
  await db.put('revlog', { ts: now, card: card.id, note: card.note, deck: card.deck, type: card.type, pass, ms: Math.round(ms || 0), state: card.state, wasNew: card.state === 'new' });
  q.reviews = q.reviews.filter((c) => c.id !== card.id);
  q.fresh = q.fresh.filter((c) => c.id !== card.id);
  q.learning = q.learning.filter((c) => c.id !== card.id);
  if (!updated.suspended && (updated.state === 'learn' || updated.state === 'relearn') && updated.due < dayEnd(now)) {
    q.learning.push(updated); q.learning.sort((a, b) => a.due - b.due);
  }
  return updated;
}

export async function deckStats() {
  const all = await db.all('cards'), eod = dayEnd();
  const out = new Map();
  for (const c of all) {
    const s = out.get(c.deck) || { total: 0, notes: 0, seen: new Set(), due: 0, fresh: 0, leech: 0, mastered: 0 };
    s.total++;
    if (!s.seen.has(c.note)) { s.seen.add(c.note); s.notes++; }
    if (c.suspended === 'leech') s.leech++;
    else if (c.suspended === 'mastered') s.mastered++;
    else if (c.state === 'new') s.fresh++;
    else if (c.due < eod) s.due++;
    out.set(c.deck, s);
  }
  return out;
}

// Answer checking for typed answers: ignores capitals, punctuation and missing accents
// (accents are pointed out but don't fail the answer).
export function checkTyped(typed, expected) {
  const a = strip(typed), b = strip(expected);
  if (!a) return { ok: false, close: false, accentsOnly: false };
  if (a === b) {
    const exact = typed.trim().toLowerCase().replace(/[¿?¡!.,;:]/g, '') === expected.trim().toLowerCase().replace(/[¿?¡!.,;:]/g, '');
    return { ok: true, close: true, accentsOnly: !exact };
  }
  // Word overlap for sentences (listening cards).
  const wa = a.split(' '), wb = b.split(' ');
  const hit = wb.filter((w) => wa.includes(w)).length;
  const score = hit / Math.max(wb.length, wa.length);
  return { ok: wb.length > 3 ? score >= 0.85 : false, close: score >= 0.6, score, accentsOnly: false };
}
