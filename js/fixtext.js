// Repairs text from PDFs whose fonts mislabel Spanish letters (á → some symbol, ¿ → another...).
// Each broken symbol stands for one real character all through the book, so we work out which
// one by trying every candidate and keeping the one that turns the most words into real Spanish.

// Common Spanish words that contain á é í ó ú ü ñ. Enough to recognise each letter in a whole book.
const WORDS = `más está están estás qué él sí así también había habían habías después aquí allí ahí allá acá
todavía además quizás jamás detrás atrás según aún algún ningún común tú mí sé dé café pie país países
día días tenía tenían decía decían sabía sabían quería querían podía podían vivía venía hacía hacían
estaría sería serían habría podría querría tendría diría haría vería miraba había
río frío mío mía tío tía mías míos fría vacío policía alegría poesía energía filosofía economía
cómo dónde cuándo quién quiénes cuál cuáles cuánto cuánta qué
sólo último última últimos únicas única único árbol árboles ángel ánimo época éxito música
número números página páginas pájaro pájaros médico lágrima lágrimas lámpara máquina sábado
teléfono público pública política histórico rápido rápida pálido pálida tímido mágico
corazón razón canción nación acción relación situación revolución cárcel fácil difícil
mamá papá jamás sofá ojalá está dará será hará podrá tendrá vendrá
fue dijo miró llegó salió murió nació pasó quedó contó habló pensó entró tomó encontró sintió pidió
volvió escribió preguntó respondió explicó empezó comenzó cayó oyó creyó leyó huyó
después través inglés francés interés mes vez cortés
años año niño niños niña niñas mañana mañanas señor señora señores sueño sueños pequeño pequeña
pequeños dueño dueña compañero compañera compañeros españa español española montaña montañas
extraño extraña daño baño otoño caña araña enseñar enseña soñar soñaba sueña muñeca leña uña
cariño puño viña peña año ñandú enseñó soñó
pingüino vergüenza lingüística bilingüe agüero cigüeña
través sostén también jóvenes joven orígenes imágenes exámenes
cárcel útil árabe órgano ómnibus índice índios íntimo única única`.split(/\s+/).filter(Boolean);
const DICT = new Set(WORDS);
const TARGETS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü'];
const UPPER = { 'á': 'Á', 'é': 'É', 'í': 'Í', 'ó': 'Ó', 'ú': 'Ú', 'ñ': 'Ñ', 'ü': 'Ü' };
const ASCII_LETTER = /[A-Za-z]/;
const isLetterish = (c) => ASCII_LETTER.test(c);
const lowerAscii = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
// Characters that are normal around words and never need repairing.
const NORMAL = /[A-Za-z0-9\s.,;:!?"'()\[\]«»\/]/;

// Words as written, trimmed of ordinary punctuation at the edges.
const tokens = (text) => text.split(/\s+/).map((t) => t.replace(/^[.,;:!?"'()«»\-]+|[.,;:!?"'()«»\-]+$/g, '')).filter(Boolean);

// Replace character c by r only where it touches a letter, so a broken symbol that is also normal
// punctuation (a dash, an apostrophe) keeps its normal meaning between words.
// startOnly: capitals, ¿ and ¡ only at the start of a word (so "dijo…" keeps its dots).
function swapInWords(text, c, r, letters, startOnly) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === c) {
      const a = text[i - 1] || ' ', b = text[i + 1] || ' ';
      if (startOnly ? !letters(a) && letters(b) : letters(a) || letters(b)) { out += r; continue; }
    }
    out += ch;
  }
  return out;
}

// A common case with an exact answer: text typed in Windows (cp1252) and stored in a PDF font
// that reads it as Mac Roman. Then á shows as ·, ó as Û, ñ as Ò, ¿ as ø, the long dash as ó, the
// quotes as ì î, "…" as Ö. Each symbol maps back exactly.
const MAC_TO_WIN = {"Ä": "€", "Ç": "‚", "É": "ƒ", "Ñ": "„", "Ö": "…", "Ü": "†", "á": "‡", "à": "ˆ", "â": "‰", "ä": "Š", "ã": "‹", "å": "Œ", "é": "Ž", "ë": "‘", "í": "’", "ì": "“", "î": "”", "ï": "•", "ñ": "–", "ó": "—", "ò": "˜", "ô": "™", "ö": "š", "õ": "›", "ú": "œ", "û": "ž", "ü": "Ÿ", "†": " ", "°": "¡", "§": "¤", "•": "¥", "¶": "¦", "ß": "§", "®": "¨", "™": "ª", "´": "«", "¨": "¬", "≠": "­", "Æ": "®", "Ø": "¯", "∞": "°", "≤": "²", "≥": "³", "¥": "´", "∂": "¶", "∑": "·", "∏": "¸", "π": "¹", "∫": "º", "ª": "»", "º": "¼", "Ω": "½", "æ": "¾", "ø": "¿", "¿": "À", "¡": "Á", "¬": "Â", "√": "Ã", "ƒ": "Ä", "≈": "Å", "∆": "Æ", "«": "Ç", "»": "È", "…": "É", " ": "Ê", "À": "Ë", "Ã": "Ì", "Õ": "Í", "Œ": "Î", "œ": "Ï", "–": "Ð", "—": "Ñ", "“": "Ò", "”": "Ó", "‘": "Ô", "’": "Õ", "÷": "Ö", "◊": "×", "ÿ": "Ø", "Ÿ": "Ù", "⁄": "Ú", "€": "Û", "‹": "Ü", "›": "Ý", "ﬁ": "Þ", "ﬂ": "ß", "‡": "à", "·": "á", "‚": "â", "„": "ã", "‰": "ä", "Â": "å", "Ê": "æ", "Á": "ç", "Ë": "è", "È": "é", "Í": "ê", "Î": "ë", "Ï": "ì", "Ì": "í", "Ó": "î", "Ô": "ï", "": "ð", "Ò": "ñ", "Ú": "ò", "Û": "ó", "Ù": "ô", "ı": "õ", "ˆ": "ö", "˜": "÷", "¯": "ø", "˘": "ù", "˙": "ú", "˚": "û", "¸": "ü", "˝": "ý", "˛": "þ", "ˇ": "ÿ"};
const SPANISH = /[áéíóúñüÁÉÍÓÚÑÜ¿¡“”‘’…—–«»\u00a0]/;
function macRomanFix(text) {
  const odd = [...text].filter((c) => c.charCodeAt(0) > 127);
  if (odd.length < 20) return null;
  const share = (chars) => chars.filter((c) => SPANISH.test(c)).length / chars.length;
  const after = odd.map((c) => MAC_TO_WIN[c] || c);
  const before = share(odd), now = share(after);
  if (!(now >= 0.9 && now - before >= 0.3)) return null;
  const counts = new Map();
  for (const c of odd) if (MAC_TO_WIN[c]) counts.set(c, (counts.get(c) || 0) + 1);
  const map = [...counts.entries()].sort((a, b) => b[1] - a[1])
    .map(([from, count]) => ({ from, to: MAC_TO_WIN[from] === '\u00a0' ? '(espacio)' : MAC_TO_WIN[from], count }));
  const fix = (t) => t.replace(/[^\x00-\x7f]/g, (c) => MAC_TO_WIN[c] || c).replace(/\u00a0/g, ' ').replace(/ {2,}/g, ' ');
  return { map, fix };
}

export function inferFix(text) {
  const exact = macRomanFix(text);
  if (exact) return exact;

  // 1. Candidates: unusual characters that sit right next to letters.
  const touching = new Map();
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (NORMAL.test(c)) continue;
    const a = text[i - 1] || ' ', b = text[i + 1] || ' ';
    if (isLetterish(a) || isLetterish(b)) touching.set(c, (touching.get(c) || 0) + 1);
  }
  const suspects = [...touching.entries()].filter(([, n]) => n >= 3).map(([c]) => c);
  if (!suspects.length) return { map: [], fix: (t) => t };

  const map = new Map(); // broken char → real char
  // 2. ¿ and ¡: a symbol that opens a phrase that ends in ? (or !).
  for (const c of suspects) {
    let q = 0, e = 0, total = 0;
    for (let i = text.indexOf(c); i !== -1; i = text.indexOf(c, i + 1)) {
      const before = text[i - 1] || ' ', after = text[i + 1] || ' ';
      if (isLetterish(before) || !/[A-Za-zÀ-ɏ]/.test(after) && !suspects.includes(after)) continue;
      total++;
      const m = /[.?!]/.exec(text.slice(i + 1, i + 300));
      if (m && m[0] === '?') q++; else if (m && m[0] === '!') e++;
    }
    if (total >= 3 && (q + e) / total >= 0.6) map.set(c, q >= e ? '¿' : '¡');
  }

  // 3. Letters: score each candidate by how many words it turns into known Spanish words.
  const words = tokens(text);
  for (let round = 0; round < 3; round++) {
    const left = suspects.filter((c) => !map.has(c));
    if (!left.length) break;
    const score = new Map(left.map((c) => [c, new Map()]));
    const startOnly = new Map(left.map((c) => [c, { start: 0, mid: 0 }]));
    for (const raw of words) {
      // Apply what we already know, so words with two broken letters get a chance.
      let w = raw;
      for (const [c, r] of map) if (!'¿¡'.includes(r)) w = w.split(c).join(r);
      const here = left.filter((c) => w.includes(c));
      if (here.length !== 1) continue;
      const c = here[0];
      const pos = startOnly.get(c);
      for (let i = 0; i < w.length; i++) if (w[i] === c) { if (i === 0) pos.start++; else pos.mid++; }
      for (const t of TARGETS) {
        const cand = lowerAscii(w.split(c).join(t));
        let s = DICT.has(cand) ? 1 : 0;
        if (!s && t === 'ó' && /ci[óo]n$|si[óo]n$/.test(cand) && cand.endsWith('ón')) s = 1; // -ción, -sión
        if (!s && t === 'í' && /[bcdfghjlmnprstvz]ía(s|n|mos)?$/.test(cand)) s = 0.5; // había, tenían...
        if (s) score.get(c).set(t, (score.get(c).get(t) || 0) + s);
      }
    }
    // Take the clearest winners this round; the rest get another try with them in place.
    const picks = [];
    for (const c of left) {
      const ranked = [...score.get(c).entries()].sort((a, b) => b[1] - a[1]);
      if (!ranked.length) continue;
      const [best, s1] = ranked[0];
      const s2 = ranked[1] ? ranked[1][1] : 0;
      if (s1 >= 2 && s1 >= s2 * 2) picks.push([c, best, s1]);
    }
    if (!picks.length) break;
    // One real letter per broken symbol: if two symbols want the same letter, the one seen
    // mostly at the start of words is the capital.
    for (const [c, best] of picks) {
      const pos = startOnly.get(c);
      const capital = pos.start >= 3 && pos.mid <= pos.start * 0.1;
      map.set(c, capital ? UPPER[best] : best);
    }
  }

  // Never "fix" a real Spanish letter into itself.
  for (const [c, r] of [...map]) if (c === r) map.delete(c);
  const entries = [...map.entries()];
  const fix = (t) => {
    let out = t;
    for (const [c, r] of entries) {
      const letters = (ch) => /[A-Za-z\u00C0-\u024F]/.test(ch) || entries.some(([k]) => k === ch);
      out = swapInWords(out, c, r, letters, r === '¿' || r === '¡' || r !== r.toLowerCase());
    }
    return out;
  };
  const counts = entries.map(([c, r]) => ({ from: c, to: r, count: text.split(c).length - 1 }));
  return { map: counts, fix };
}
