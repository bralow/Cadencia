// Sync and backup (FE-01). One merge engine for both:
//  - a backup file (.zip) you download and restore on any device, and
//  - Google Drive: a hidden app folder in your own Drive that keeps the phone and the PC identical.
// Merging, not overwriting: every record carries the time it last changed (_u); the newer version wins,
// review history from both devices is combined, and deletions travel as tombstones.
// Packs (clips, podcast, songs) never sync: they are imported once on each device.
import { db, SYNCED, syncKey, tombstones, saveTombstones } from './db.js';
import { zipStore } from './zip.js';
import { readZip } from './clippack.js';

// --- Settings and other small things kept in localStorage that should travel too.
// Not synced: the Gemini key and the phone voice (device-specific), the sync state itself.
const LS_SYNC = ['cadencia.settings', 'penumbra.settings', 'penumbra.keys', 'cadencia.log', 'cadencia.seen', 'cadencia.read', 'cadencia.notes',
  'cadencia.libros.tr', 'cadencia.recetario', 'cadencia.escribir', 'cadencia.charla', 'cadencia.podcast.pos', 'cadencia.podcast.prefs',
  'cadencia.cultura.start', 'cadencia.leer'];
const LS_META = 'penumbra.lsmeta', BLOB_CACHE = 'penumbra.blobhash', STATE = 'penumbra.sync';
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };
export const syncState = () => readJSON(STATE, {});
const setState = (patch) => { const s = { ...syncState(), ...patch }; writeJSON(STATE, s); window.dispatchEvent(new Event('penumbra:sync')); return s; };

const timeOf = (r) => r._u || r.updated || r.created || r.ts || r.at || r.added || 0;
const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
async function sha(blob) {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Local snapshot: every synced record, keyed the same way on every device.
async function snapshot() {
  const items = new Map();
  for (const store of SYNCED) {
    for (const r of await db.all(store)) items.set(syncKey(store, r), { s: store, u: timeOf(r), r, localId: r.id });
  }
  // localStorage: a key counts as changed now if its value differs from what the last sync saw.
  const meta = readJSON(LS_META, {});
  const ls = {};
  for (const k of LS_SYNC) {
    const v = localStorage.getItem(k);
    if (v === null) continue;
    const h = fnv(v);
    if (!meta[k] || meta[k].h !== h) meta[k] = { h, u: Date.now() };
    ls[k] = { u: meta[k].u, v };
  }
  writeJSON(LS_META, meta);
  return { items, tomb: tombstones(), ls };
}

// Blob fields become {$blob: hash} in the shared copy; hashes are cached so big files aren't re-read each time.
async function serialize(key, item, blobsOut) {
  const cache = readJSON(BLOB_CACHE, {});
  const c = cache[key] && cache[key].u === item.u ? cache[key].f : {};
  const out = {}, f = {};
  for (const [k, v] of Object.entries(item.r)) {
    if (v instanceof Blob) {
      const h = c[k] || await sha(v);
      f[k] = h; blobsOut.set(h, v);
      out[k] = { $blob: h, type: v.type || '' };
    } else out[k] = v;
  }
  if (Object.keys(f).length) { cache[key] = { u: item.u, f }; writeJSON(BLOB_CACHE, cache); }
  return out;
}
async function revive(rec, getBlob, local) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === 'object' && v.$blob) {
      // Same content already here? Reuse it instead of downloading.
      const mine = local && local.r[k] instanceof Blob ? local.r[k] : null;
      let blob = null;
      if (mine) { const cache = readJSON(BLOB_CACHE, {}); const h = (cache[syncKey(local.s, local.r)] || {}).f?.[k] || await sha(mine); if (h === v.$blob) blob = mine; }
      if (!blob) { const b = await getBlob(v.$blob); if (b) blob = new Blob([b], { type: v.type || b.type || '' }); }
      if (blob) out[k] = blob;
    } else out[k] = v;
  }
  return out;
}

// Merges a remote copy ({items, tomb, ls}) into this device and returns the merged copy to store remotely,
// plus the blobs it references (so missing ones can be uploaded).
async function merge(remote, getBlob, onProgress = () => {}) {
  const local = await snapshot();
  const rItems = remote.items || {}, rTomb = remote.tomb || {}, rLs = remote.ls || {};
  const keys = new Set([...local.items.keys(), ...Object.keys(rItems), ...Object.keys(local.tomb), ...Object.keys(rTomb)]);
  const out = { v: 1, app: 'penumbra', at: Date.now(), items: {}, tomb: {}, ls: {} };
  const blobs = new Map();
  const stats = { in: 0, out: 0, deleted: 0 };
  let i = 0;
  for (const k of keys) {
    if (++i % 200 === 0) onProgress(i, keys.size);
    const L = local.items.get(k), R = rItems[k];
    const t = Math.max(local.tomb[k] || 0, rTomb[k] || 0);
    const lu = L ? L.u : -1, ru = R ? R.u : -1;
    const newest = Math.max(lu, ru);
    if (t && t >= newest) { // deleted after its last change
      out.tomb[k] = t;
      if (L) { await db.rawRemove(L.s, L.localId); stats.deleted++; }
      continue;
    }
    if (L && lu >= ru) { out.items[k] = { s: L.s, u: lu, r: await serialize(k, L, blobs) }; if (!R || lu > ru) stats.out++; continue; }
    // Remote is newer (or only exists there): bring it here.
    const rec = await revive(R.r, getBlob, L);
    if (L) rec.id = L.localId; else if (R.s === 'revlog' || R.s === 'mazo') delete rec.id; // per-device auto ids
    rec._u = ru;
    await db.rawPut(R.s, rec);
    out.items[k] = R;
    stats.in++;
  }
  // localStorage: the practice log and seen-sounds are combined; everything else, newer wins.
  const meta = readJSON(LS_META, {});
  const lsChanged = [];
  for (const k of new Set([...Object.keys(local.ls), ...Object.keys(rLs)])) {
    const L = local.ls[k], R = rLs[k];
    let v, u;
    if (k === 'cadencia.log' && L && R) {
      const seen = new Set(), all = [];
      for (const e of [...JSON.parse(L.v), ...JSON.parse(R.v)]) { const id = `${e.t}|${e.type}`; if (!seen.has(id)) { seen.add(id); all.push(e); } }
      v = JSON.stringify(all.sort((a, b) => a.t - b.t).slice(-3000)); u = Math.max(L.u, R.u);
    } else if (k === 'cadencia.seen' && L && R) {
      v = JSON.stringify([...new Set([...JSON.parse(L.v), ...JSON.parse(R.v)])]); u = Math.max(L.u, R.u);
    } else if (!R || (L && L.u >= R.u)) { v = L.v; u = L.u; } else { v = R.v; u = R.u; }
    out.ls[k] = { u, v };
    if (!L || L.v !== v) { localStorage.setItem(k, v); lsChanged.push(k); }
    meta[k] = { h: fnv(v), u };
  }
  writeJSON(LS_META, meta);
  saveTombstones(out.tomb);
  if (lsChanged.includes('cadencia.settings')) { const { applyTheme } = await import('./settings.js'); applyTheme(); }
  return { out, blobs, stats };
}

// ===================== Backup file =====================
export async function backupFile(onProgress = () => {}) {
  const { out, blobs } = await merge({}, async () => null, onProgress);
  const enc = new TextEncoder();
  const entries = [{ name: 'penumbra-backup.json', data: enc.encode(JSON.stringify(out)) }];
  for (const [h, b] of blobs) entries.push({ name: `blobs/${h}`, data: new Uint8Array(await b.arrayBuffer()) });
  const d = new Date();
  const name = `penumbra-copia-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.zip`;
  setState({ lastBackup: Date.now() });
  return { blob: zipStore(entries), name, items: Object.keys(out.items).length, blobs: blobs.size };
}
// Restoring merges: nothing on this device is lost; newer changes in the file win.
export async function restoreFile(file, onProgress = () => {}) {
  const zip = await readZip(file);
  const bytes = await zip.get('penumbra-backup.json');
  if (!bytes) throw new Error('Este archivo no es una copia de Penumbra.');
  const remote = JSON.parse(new TextDecoder().decode(bytes));
  const { stats } = await merge(remote, async (h) => { const b = await zip.get(`blobs/${h}`); return b ? new Blob([b.slice()]) : null; }, onProgress);
  const { mergeSameNameDecks } = await import('./penumbra.js');
  await mergeSameNameDecks();
  return stats;
}

// ===================== Google Drive =====================
// A free Google Cloud "OAuth client ID" (web application, origin https://bralow.github.io) lets the app use
// a hidden folder in your Drive (scope drive.appdata: it can't see any of your other files).
const DRIVE = 'penumbra.drive';
export const BUILT_IN_CLIENT_ID = '362565861212-pdrliulid7ml6t06ho5cl0vj01n68f4d.apps.googleusercontent.com';
// The built-in id wins over an empty one saved on the device by an earlier version.
export const driveConfig = () => { const c = readJSON(DRIVE, {}); return { ...c, clientId: c.clientId || BUILT_IN_CLIENT_ID }; };
export const setDriveConfig = (patch) => { const v = { ...readJSON(DRIVE, {}), ...patch }; writeJSON(DRIVE, v); return v; };
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DATA_NAME = 'penumbra-data.json';

let gisReady = null;
function loadGis() {
  if (!gisReady) gisReady = new Promise((ok, fail) => {
    if (window.google && window.google.accounts) { ok(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => { gisReady = null; fail(new Error('No pude cargar el inicio de sesión de Google (¿sin conexión?).')); };
    document.head.append(s);
  });
  return gisReady;
}
const tokenValid = () => { const c = readJSON(DRIVE, {}); return !!(c.token && c.exp && c.exp > Date.now() + 60000); };
export const driveConnected = () => !!readJSON(DRIVE, {}).connected;
export const canSyncSilently = () => driveConnected() && tokenValid();

// Must be called from a tap (Google opens a small window; browsers block it otherwise).
export async function signIn(first = false) {
  const { clientId } = driveConfig();
  if (!clientId) throw new Error('Falta el Client ID de Google (Perfil → Sincronización).');
  await loadGis();
  return new Promise((ok, fail) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: (r) => {
        if (r.error) { fail(new Error(r.error_description || r.error)); return; }
        setDriveConfig({ token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, connected: true });
        ok();
      },
      error_callback: (e) => fail(new Error(e && e.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : (e && e.message) || 'Google no respondió.')),
    });
    client.requestAccessToken({ prompt: first ? 'consent' : '' });
  });
}
export function disconnect() {
  const c = readJSON(DRIVE, {});
  if (c.token && window.google && window.google.accounts) try { window.google.accounts.oauth2.revoke(c.token, () => {}); } catch { /* ignore */ }
  setDriveConfig({ token: '', exp: 0, connected: false });
  setState({ lastSync: 0, error: '' });
}

async function api(url, opts = {}) {
  const { token } = readJSON(DRIVE, {});
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (r.status === 401) { setDriveConfig({ token: '', exp: 0 }); throw new Error('La sesión de Google venció. Tocá «Sincronizar» de nuevo.'); }
  if (!r.ok) throw new Error(`Google Drive respondió ${r.status}`);
  return r;
}
async function listFiles() {
  const files = new Map();
  let page = '';
  do {
    const r = await (await api(`${API}?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name)${page ? `&pageToken=${page}` : ''}`)).json();
    for (const f of r.files || []) files.set(f.name, f.id);
    page = r.nextPageToken || '';
  } while (page);
  return files;
}
async function upload(name, blob, existingId) {
  if (existingId) { await api(`${UPLOAD}/${existingId}?uploadType=media`, { method: 'PATCH', body: blob }); return existingId; }
  const meta = new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' });
  const form = new FormData();
  form.append('metadata', meta);
  form.append('file', blob);
  const r = await (await api(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', body: form })).json();
  return r.id;
}

let running = null;
// Syncs now. With interactive = true (from a tap) it can ask Google for a fresh session first.
export function syncNow({ interactive = false, onProgress = () => {} } = {}) {
  if (running) return running;
  running = (async () => {
    if (!driveConnected()) throw new Error('Google Drive no está conectado.');
    if (!tokenValid()) { if (!interactive) return null; await signIn(false); }
    setState({ busy: true, error: '' });
    try {
      onProgress('Leyendo tu Drive…');
      const files = await listFiles();
      let remote = {};
      if (files.has(DATA_NAME)) remote = await (await api(`${API}/${files.get(DATA_NAME)}?alt=media`)).json();
      onProgress('Combinando…');
      const getBlob = async (h) => {
        const id = files.get(`b-${h}`);
        return id ? (await api(`${API}/${id}?alt=media`)).blob() : null;
      };
      let { out, blobs, stats } = await merge(remote, getBlob);
      // Same-name decks from two devices become one; that change goes up in this same sync.
      const { mergeSameNameDecks } = await import('./penumbra.js');
      if (await mergeSameNameDecks()) { const again = await merge(out, getBlob); out = again.out; blobs = again.blobs; }
      const missing = [...blobs].filter(([h]) => !files.has(`b-${h}`));
      let n = 0;
      for (const [h, b] of missing) { onProgress(`Subiendo audio e imágenes… ${++n} de ${missing.length}`); files.set(`b-${h}`, await upload(`b-${h}`, b)); }
      onProgress('Guardando…');
      await upload(DATA_NAME, new Blob([JSON.stringify(out)], { type: 'application/json' }), files.get(DATA_NAME));
      setState({ busy: false, lastSync: Date.now(), error: '', last: stats });
      if (stats.in) window.dispatchEvent(new Event('cadencia:rerender'));
      return stats;
    } catch (e) { setState({ busy: false, error: String(e.message || e) }); throw e; }
  })().finally(() => { running = null; });
  return running;
}

// Background: when the app opens and a few seconds after changes, if the Google session is still fresh.
export function startAutoSync() {
  const quiet = () => { if (canSyncSilently()) syncNow().catch(() => {}); };
  setTimeout(quiet, 3000);
  let t = 0;
  window.addEventListener('penumbra:changed', () => { clearTimeout(t); t = setTimeout(quiet, 20000); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') quiet(); });
}
