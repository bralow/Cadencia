// Reads a clip pack (.zip) made by tools/prepare_openslr.py and stores it in IndexedDB.
// The zip holds clips.json + audio files. Entries may be stored or deflated.
import { db } from './db.js';

function u16(v, o) { return v.getUint16(o, true); }
function u32(v, o) { return v.getUint32(o, true); }

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

export async function readZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const v = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No es un archivo .zip válido');
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('Zip dañado');
    const method = u16(v, p + 10), csize = u32(v, p + 20);
    const nlen = u16(v, p + 28), xlen = u16(v, p + 30), clen = u16(v, p + 32), lho = u32(v, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    const lnlen = u16(v, lho + 26), lxlen = u16(v, lho + 28);
    const start = lho + 30 + lnlen + lxlen;
    entries.set(name, { method, data: buf.subarray(start, start + csize) });
  }
  const get = async (name) => {
    const e = entries.get(name);
    if (!e) return null;
    if (e.method === 0) return e.data;
    if (e.method === 8) return inflate(e.data);
    throw new Error('Formato de compresión no soportado');
  };
  return { names: [...entries.keys()], get };
}

const MIME = { ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' };

export async function importClipPack(file, onProgress = () => {}) {
  const zip = await readZip(file);
  const manifestBytes = await zip.get('clips.json');
  if (!manifestBytes) throw new Error('Falta clips.json en el paquete');
  const list = JSON.parse(new TextDecoder().decode(manifestBytes));
  const BATCH = 50;
  let done = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    const meta = [], audio = [];
    for (const c of list.slice(i, i + BATCH)) {
      const bytes = await zip.get(c.file);
      if (!bytes) continue;
      const ext = c.file.split('.').pop().toLowerCase();
      meta.push({ id: c.id, text: c.text, level: c.level, speaker: c.speaker || '' });
      audio.push({ id: c.id, blob: new Blob([bytes.slice()], { type: MIME[ext] || 'audio/ogg' }) });
    }
    await db.putMany('audio', audio);
    await db.putMany('clips', meta);
    done += meta.length;
    onProgress(done, list.length);
  }
  return done;
}
