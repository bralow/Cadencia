// Minimal IndexedDB wrapper. Stores:
//  clips: { id, text, level, speaker }   (metadata only)
//  audio: { id, blob }                   (clip audio, same id as clips)
//  mazo:  { id (auto), front, ipa, back, tag, audio?: Blob, created }
//  tts:   { id: 'voice|text', blob }      (cached Argentine voice audio)
//  diario: { id, at, blob, seconds, prompt, result }  (voice diary entries)
//  books: { id, title, stories: [{ title, paragraphs }], added }  (imported from the user's own PDFs)
const DB_NAME = 'cadencia';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 4);
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

export const db = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  count: (store) => run(store, 'readonly', (s) => s.count()),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  putMany: (store, values) => run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); }),
  remove: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  audioFor: async (id) => { const r = await run('audio', 'readonly', (s) => s.get(id)); return r ? r.blob : null; },
};

export async function persist() {
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch { /* ignore */ }
  }
}
