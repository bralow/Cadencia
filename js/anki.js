import { zipStore } from './zip.js';
// Builds an Anki .apkg (legacy collection.anki2 + media) entirely on the phone.
const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

// Fixed ids so re-exports update the same note type and deck in Anki instead of duplicating.
const MODEL_ID = 1730000000001;
const DECK_ID = 1730000000002;
const FIELDS = ['Frente', 'Dorso', 'IPA', 'Audio', 'Fuente'];

const CSS = `.card{font-family:Georgia,serif;font-size:24px;text-align:center;color:#1C2541;background:#F5EDE0;padding:16px}
.ipa{font-family:"Noto Sans",sans-serif;font-size:18px;color:#3B4565;margin-top:10px}
.back{font-family:sans-serif;font-size:17px;color:#5A6072;margin-top:10px}
.src{font-family:sans-serif;font-size:12px;color:#B5482A;margin-top:14px;letter-spacing:.08em}
.nightMode.card,.night_mode .card{color:#F3EAD9;background:#14182A}.nightMode .ipa,.night_mode .ipa{color:#E2B95A}.nightMode .back,.night_mode .back{color:#AEB3C4}`;

let sqlPromise;
function loadSql() {
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/sqljs/sql-wasm.js';
      s.onload = () => window.initSqlJs({ locateFile: (f) => `vendor/sqljs/${f}` }).then(resolve, reject);
      s.onerror = () => reject(new Error('No pude cargar SQLite'));
      document.head.append(s);
    });
  }
  return sqlPromise;
}

async function sha1Hex(text) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const stripHtml = (s) => s.replace(/<[^>]*>/g, '').replace(/\[sound:[^\]]*\]/g, '').trim();
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function modelJson(now) {
  return {
    [MODEL_ID]: {
      id: MODEL_ID, name: 'Cadencia', type: 0, mod: now, usn: -1, sortf: 0, did: DECK_ID,
      tmpls: [{
        name: 'Tarjeta 1', ord: 0, did: null, bqfmt: '', bafmt: '', bfont: '', bsize: 0,
        qfmt: '<div lang="es-AR">{{Frente}}</div>\n{{Audio}}',
        afmt: '{{FrontSide}}\n<hr id="answer">\n<div class="ipa">{{IPA}}</div>\n{{#Dorso}}<div class="back">{{Dorso}}</div>{{/Dorso}}\n<div class="src">{{Fuente}}</div>',
      }],
      flds: FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
      css: CSS, latexPre: '', latexPost: '', latexsvg: false, req: [[0, 'any', [0]]], tags: [], vers: [],
    },
  };
}

function deckJson(id, name, now) {
  return { id, name, mod: now, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 0, extendRev: 0 };
}

const DCONF = { 1: { id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
  new: { delays: [1, 10], ints: [1, 4, 0], initialFactor: 2500, order: 1, perDay: 20, bury: false },
  rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500, bury: false, hardFactor: 1.2 },
  lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 1 } } };

const EXT = { 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

export async function buildApkg(items) {
  const SQL = await loadSql();
  const db = new SQL.Database();
  db.run(SCHEMA);
  const nowMs = Date.now(), now = Math.floor(nowMs / 1000);
  const decks = { 1: deckJson(1, 'Default', now), [DECK_ID]: deckJson(DECK_ID, 'Cadencia', now) };
  const conf = { nextPos: items.length + 1, estTimes: true, activeDecks: [DECK_ID], sortType: 'noteFld', timeLim: 0, sortBackwards: false, addToCur: true, curDeck: DECK_ID, newBust: false, newSpread: 0, dueCounts: true, curModel: MODEL_ID, collapseTime: 1200 };
  db.run('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)',
    [now, nowMs, nowMs, JSON.stringify(conf), JSON.stringify(modelJson(now)), JSON.stringify(decks), JSON.stringify(DCONF), '{}']);

  const media = {}; const files = [];
  const noteStmt = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const cardStmt = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let pos = 0;
  for (const it of items) {
    pos++;
    const hash = await sha1Hex(`${it.tag}|${it.front}`);
    let audioField = '';
    if (it.audio) {
      const name = `cadencia_${hash.slice(0, 12)}.${EXT[(it.audio.type || '').split(';')[0]] || 'ogg'}`;
      media[String(files.length)] = name;
      files.push(new Uint8Array(await it.audio.arrayBuffer()));
      audioField = `[sound:${name}]`;
    }
    const tag = (it.tag || '').replace(/^#/, '');
    const flds = [esc(it.front), esc(it.back), esc(it.ipa), audioField, esc(it.tag)].join('\x1f');
    const sfld = stripHtml(esc(it.front));
    const csum = parseInt((await sha1Hex(sfld)).slice(0, 8), 16);
    const nid = nowMs + pos, cid = nowMs + pos;
    noteStmt.run([nid, 'cad' + hash.slice(0, 10), MODEL_ID, now, -1, ` cadencia ${tag} `, flds, sfld, csum, 0, '']);
    cardStmt.run([cid, nid, DECK_ID, 0, now, -1, 0, 0, pos, 0, 0, 0, 0, 0, 0, 0, 0, '']);
  }
  noteStmt.free(); cardStmt.free();
  const collection = db.export();
  db.close();

  const entries = [
    { name: 'collection.anki2', data: collection },
    { name: 'media', data: new TextEncoder().encode(JSON.stringify(media)) },
    ...files.map((data, i) => ({ name: String(i), data })),
  ];
  return new Blob([zipStore(entries)], { type: 'application/octet-stream' });
}


