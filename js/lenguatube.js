// Cards from LenguaTube (the Chrome extension). LenguaTube leaves "lenguatube-inbox-….json" files in
// this app's hidden Google Drive folder; sync.js reads them on every sync and hands them here.
// Each saved word or line becomes a Penumbra note (with the video's audio when it has it), then the
// file is deleted. Sending the same word twice is harmless: addNote skips a front already in the deck.
import { addNote } from './penumbra.js';

export const INBOX_PREFIX = 'lenguatube-inbox-';

function dataUrlToBlob(url) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(url || ''));
  if (!m) return null;
  try {
    if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] || 'application/octet-stream' });
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'audio/webm' });
  } catch { return null; }
}

// data: { app: 'LenguaTube', format: 'penumbra-inbox', version: 1, notes: [...] }. Returns how many cards were made.
export async function importInbox(data) {
  if (!data || data.format !== 'penumbra-inbox' || !Array.isArray(data.notes)) return 0;
  let made = 0;
  for (const n of data.notes) {
    const front = String(n.front || '').trim();
    if (!front) continue;
    const ja = n.lang === 'ja';
    const deck = String(n.deck || (ja ? 'LenguaTube · Japonés' : 'LenguaTube')).slice(0, 60);
    // Japanese: reading and rōmaji in the IPA line (Penumbra's IPA is for Rioplatense Spanish).
    const ipa = ja ? (n.ipa || ' ') : (n.ipa || undefined);
    const meaning = [n.meaning, n.extra].filter(Boolean).join(' · ');
    const types = n.kind === 'listening' ? ['escuchar'] : undefined; // otherwise Penumbra picks, as for its own saves
    const cards = await addNote({
      front,
      back: n.back || '',
      meaning,
      ipa,
      tag: ja ? '#LenguaTubeJA' : '#LenguaTube',
      deck,
      audio: n.audio ? dataUrlToBlob(n.audio) : undefined,
      source: { kind: 'video', label: n.label || 'LenguaTube', url: n.url || '', t: n.t || 0 },
      types,
    });
    made += cards.length ? 1 : 0;
  }
  return made;
}
