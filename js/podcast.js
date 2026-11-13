// Podcast packs (tools/prepare_podcast.py): podcast.json + audio/*.ogg, with word-timed transcripts.
// Also the one "Importar paquete" entry point: a pack is either podcast episodes or OpenSLR clips.
import { db } from './db.js';
import { readZip, importClipPack } from './clippack.js';

export async function importPack(file, onProgress = () => {}) {
  const zip = await readZip(file);
  if (zip.names.includes('canciones.json')) return importSongs(zip, onProgress);
  if (!zip.names.includes('podcast.json')) return { kind: 'clips', n: await importClipPack(file, onProgress) };
  const m = JSON.parse(new TextDecoder().decode(await zip.get('podcast.json')));
  const eps = m.episodes || [];
  let done = 0;
  for (const e of eps) {
    const bytes = await zip.get(e.file);
    if (!bytes) continue;
    const id = `${m.show || 'podcast'}|${e.id}`;
    await db.put('epaudio', { id, blob: new Blob([bytes.slice()], { type: 'audio/ogg' }) });
    await db.put('episodes', { id, show: m.show || 'Podcast', title: e.title, n: e.n, duration: e.duration, segments: e.segments || [] });
    onProgress(++done, eps.length);
  }
  return { kind: 'podcast', n: done, show: m.show, pack: m.pack, packs: m.packs };
}

// Song packs (tools/prepare_songs.py): canciones.json + audio/*.ogg.
async function importSongs(zip, onProgress) {
  const m = JSON.parse(new TextDecoder().decode(await zip.get('canciones.json')));
  const list = m.songs || [];
  let done = 0;
  for (const s of list) {
    const bytes = await zip.get(s.file);
    if (!bytes) continue;
    await db.put('songs', { id: `${m.show || 'Canciones'}|${s.id}`, show: m.show || 'Canciones', title: s.title, n: s.n, duration: s.duration,
      lines: s.lines || [], blob: new Blob([bytes.slice()], { type: 'audio/ogg' }) });
    onProgress(++done, list.length);
  }
  return { kind: 'songs', n: done, show: m.show, pack: m.pack, packs: m.packs };
}

// Where you stopped in each episode, and which ones you finished.
const POS = 'cadencia.podcast.pos';
export const positions = () => { try { return JSON.parse(localStorage.getItem(POS) || '{}'); } catch { return {}; } };
export function savePosition(id, t, duration) {
  const p = positions();
  p[id] = { t: Math.round(t), done: (p[id] && p[id].done) || (duration > 0 && t / duration > 0.95) };
  try { localStorage.setItem(POS, JSON.stringify(p)); } catch { /* ignore */ }
}

// Index of the segment playing at time t (segments are in time order).
export function segmentAt(segs, t) {
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (segs[mid].s <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}
