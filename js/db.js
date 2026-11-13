// Minimal IndexedDB wrapper. Stores:
//  clips: { id, text, level, speaker }   (metadata only)
//  audio: { id, blob }                   (clip audio, same id as clips)
//  mazo:  { id (auto), front, ipa, back, tag, audio?: Blob, created }
//  tts:   { id: 'voice|text', blob }      (cached Argentine voice audio)
//  diario: { id, at, blob, seconds, prompt, result }  (voice diary entries)
//  episodes: { id, show, title, n, duration, segments: [{ s, e, t, w: [[word, start, end]] }] }  (podcast transcripts)
//  epaudio: { id, blob }                (podcast audio)
//  songs: { id, show, title, n, duration, blob }  (songs cut from videos)
//  cards: Penumbra cards (see penumbra.js) · decks: { id, name, color } · revlog: one row per answer
//  books: { id, title, stories: [{ title, paragraphs }], added }  (imported from the user's own PDFs)
const DB_NAME = 'cadencia';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 7);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('clips')) {
          const s = db.createObjectStore('clips', { keyPath: 'id' });
          s.createIndex('level', 'level');
        }
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tts')) db.createObjectStore('tts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('diario')) db.createObjectStore('diario', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('episodes')) db.createObjectStore('episodes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('epaudio')) db.createObjectStore('epaudio', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('revlog')) db.createObjectStore('revlog', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('mazo')) db.createObjectStore('mazo', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Stores that sync to Google Drive and go into backups. Every save stamps the time (_u) so the newer
// version wins when two devices changed the same thing; every delete leaves a tombstone so it syncs too.
// The packs (clips, audio, episodes, epaudio, songs) and the voice cache (tts) are not synced.
export const SYNCED = ['cards', 'decks', 'revlog', 'mazo', 'books', 'diario'];
const SYNCED_SET = new Set(SYNCED);
// One stable key per record, the same on every device (revlog and mazo have per-device auto ids).
export function syncKey(store, r) {
  if (store === 'revlog') return `revlog|${r.ts}|${r.card}`;
  if (store === 'mazo') return `mazo|${r.created}|${r.front}`;
  return `${store}|${r.id}`;
}
const TOMB = 'penumbra.tomb';
export function tombstones() { try { return JSON.parse(localStorage.getItem(TOMB) || '{}'); } catch { return {}; } }
export function saveTombstones(t) { try { localStorage.setItem(TOMB, JSON.stringify(t)); } catch { /* ignore */ } }
const stamp = (store, v) => { if (SYNCED_SET.has(store) && v && typeof v === 'object') v._u = Date.now(); return v; };
// Tells the sync module that something changed (it decides whether and when to sync).
let changeTimer = 0;
function changed() { clearTimeout(changeTimer); changeTimer = setTimeout(() => window.dispatchEvent(new Event('penumbra:changed')), 1500); }

export const db = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  count: (store) => run(store, 'readonly', (s) => s.count()),
  put: async (store, value) => {
    stamp(store, value);
    const r = await run(store, 'readwrite', (s) => s.put(value));
    if (SYNCED_SET.has(store)) changed();
    // Every save to the old Mazo also becomes Penumbra cards.
    if (store === 'mazo') import('./penumbra.js').then((m) => m.fromMazo(value)).catch(() => {});
    return r;
  },
  putMany: (store, values) => { values.forEach((v) => stamp(store, v)); if (SYNCED_SET.has(store)) changed(); return run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); }); },
  remove: async (store, key) => {
    if (SYNCED_SET.has(store)) {
      const old = await run(store, 'readonly', (s) => s.get(key));
      if (old) { const t = tombstones(); t[syncKey(store, old)] = Date.now(); saveTombstones(t); changed(); }
    }
    return run(store, 'readwrite', (s) => s.delete(key));
  },
  // For sync and restore only: no time stamp, no tombstone, no Mazo hook.
  rawPut: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  rawRemove: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  audioFor: async (id) => { const r = await run('audio', 'readonly', (s) => s.get(id)); return r ? r.blob : null; },
};

export async function persist() {
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch { /* ignore */ }
  }
}
