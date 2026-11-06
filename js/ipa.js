// Rioplatense (Buenos Aires) rule-based IPA transcriber.
// Broad transcription: yeísmo rehilado [ʃ], s-aspiration before consonants [h],
// b/d/g lenition [β ð ɣ], nasal place assimilation, resyllabification across words.

const STRONG = new Set(['a', 'e', 'o']);
const ACCENTED = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' };
const VOWEL_CHARS = new Set(['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ü']);
const FRONT = new Set(['e', 'i', 'é', 'í']);
const NASALS = new Set(['m', 'n', 'ɲ', 'ŋ']);
const ONSET_CLUSTERS = new Set(['pl', 'pɾ', 'bl', 'bɾ', 'fl', 'fɾ', 'kl', 'kɾ', 'gl', 'gɾ', 'tɾ', 'dɾ']);
const LENITE = { b: 'β', d: 'ð', g: 'ɣ' };

const isVowelChar = (c) => VOWEL_CHARS.has(c);

// Turn one lowercase word into segments: { p, v (vowel), acc (written accent), src (spelling) }.
function segment(word) {
  const out = [];
  let pending = '';
  const push = (p, v, src, acc = false) => { out.push({ p, v, acc, src: pending + src }); pending = ''; };
  for (let i = 0; i < word.length; i++) {
    const c = word[i], n = word[i + 1] || '', nn = word[i + 2] || '';
    const prev = out.length ? out[out.length - 1].p : '';
    if (ACCENTED[c]) { push(ACCENTED[c], true, c, true); continue; }
    if (c === 'ü') { push('u', true, c); continue; }
    if ('aeiou'.includes(c)) { push(c, true, c); continue; }
    switch (c) {
      case 'c':
        if (n === 'h') { push('tʃ', false, 'ch'); i++; }
        else if (FRONT.has(n)) push('s', false, c);
        else push('k', false, c);
        break;
      case 'l':
        if (n === 'l') { push('ʃ', false, 'll'); i++; } else push('l', false, c);
        break;
      case 'r':
        if (n === 'r') { push('r', false, 'rr'); i++; }
        else if (out.length === 0 || prev === 'n' || prev === 'l' || prev === 's') push('r', false, c);
        else push('ɾ', false, c);
        break;
      case 'q':
        if (n === 'u') { push('k', false, 'qu'); i++; } else push('k', false, c);
        break;
      case 'g':
        if (n === 'u' && FRONT.has(nn)) { push('g', false, 'gu'); i++; }
        else if (FRONT.has(n)) push('x', false, c);
        else push('g', false, c);
        break;
      case 'j': push('x', false, c); break;
      case 'h':
        if (i === 0 && n === 'i' && isVowelChar(nn)) { push('ʃ', false, 'hi'); i++; } // hielo, hierba
        else pending += c; // silent
        break;
      case 'ñ': push('ɲ', false, c); break;
      case 'v': case 'b': push('b', false, c); break;
      case 'z': push('s', false, c); break;
      case 'x': push('k', false, ''); push('s', false, c); break;
      case 'y':
        if (word === 'y') push('i', true, c);
        else if (isVowelChar(n)) push('ʃ', false, c);
        else push('i', true, c);
        break;
      case 'w': push('w', false, c); break;
      default:
        if (/[a-zñ]/.test(c)) push(c, false, c);
    }
  }
  if (pending && out.length) out[out.length - 1].src += pending;
  return out;
}

const weakUnacc = (s) => s.v && !s.acc && (s.p === 'i' || s.p === 'u');
const strongish = (s) => STRONG.has(s.p) || s.acc;

// Split a word's segments into syllables: [{ segs, acc }]
function syllabify(segs) {
  // Group vowels into nuclei.
  const nuclei = []; // { start, end } indexes into segs (inclusive)
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i].v) continue;
    const last = nuclei[nuclei.length - 1];
    if (last && last.end === i - 1) {
      const a = segs[i - 1], b = segs[i];
      const join = (weakUnacc(a) || weakUnacc(b)) && !(strongish(a) && strongish(b));
      if (join) { last.end = i; continue; }
    }
    nuclei.push({ start: i, end: i });
  }
  if (!nuclei.length) return [{ segs: segs.slice(), acc: false }];

  // Turn weak vowels next to a peak into glides.
  for (const nu of nuclei) {
    const run = segs.slice(nu.start, nu.end + 1);
    if (run.length < 2) continue;
    let peak = run.findIndex(strongish);
    if (peak < 0) peak = run.length - 1; // ui / iu: second vowel is the peak
    run.forEach((s, k) => {
      if (k !== peak && (s.p === 'i' || s.p === 'u')) { s.glide = true; }
    });
  }

  // Distribute consonants.
  const bounds = []; // syllable start index for each nucleus
  bounds.push(0);
  for (let k = 1; k < nuclei.length; k++) {
    const from = nuclei[k - 1].end + 1, to = nuclei[k].start; // consonants in [from, to)
    const cs = segs.slice(from, to).map((s) => s.p);
    let split; // number of consonants staying in the coda
    if (cs.length === 0) split = 0;
    else if (cs.length === 1) split = 0;
    else if (cs.length === 2) split = ONSET_CLUSTERS.has(cs[0] + cs[1]) ? 0 : 1;
    else split = ONSET_CLUSTERS.has(cs[cs.length - 2] + cs[cs.length - 1]) ? cs.length - 2 : cs.length - 1;
    bounds.push(from + split);
  }
  const syls = [];
  for (let k = 0; k < nuclei.length; k++) {
    const start = bounds[k], end = k + 1 < bounds.length ? bounds[k + 1] : segs.length;
    const part = segs.slice(start, end);
    syls.push({ segs: part, acc: part.some((s) => s.acc) });
  }
  return syls;
}

function stressIndex(word, syls) {
  const marked = syls.findIndex((s) => s.acc);
  if (marked >= 0) return marked;
  if (syls.length < 2) return 0;
  const last = word[word.length - 1];
  return ('aeiouns'.includes(last)) ? syls.length - 2 : syls.length - 1;
}

const segIpa = (s) => {
  if (s.glide) return s.p === 'i' ? 'j' : 'w';
  return s.p;
};

// Analyse one word for the word panel: syllables (spelling + IPA) and stress.
export function analyzeWord(raw) {
  const word = raw.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!word) return null;
  const syls = syllabify(segment(word));
  const stress = stressIndex(word, syls);
  return {
    word,
    stress,
    spelling: syls.map((s) => s.segs.map((x) => x.src).join('')),
    ipa: transcribe(word),
  };
}

// Transcribe a phrase or passage.
export function transcribe(text) {
  // Tokenize into words and pause marks.
  const tokens = [];
  const re = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)|([,;:])|([.!?¡¿…])/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) tokens.push({ word: m[1].toLowerCase() });
    else if (m[2]) tokens.push({ pause: '|' });
    else if (m[3] && (m[3] === '.' || m[3] === '!' || m[3] === '?' || m[3] === '…')) tokens.push({ pause: '‖' });
  }

  // Build pause groups of words, each word a list of syllables.
  const groups = [];
  let cur = { words: [], pause: null };
  for (const t of tokens) {
    if (t.word) {
      const syls = syllabify(segment(t.word));
      const st = stressIndex(t.word, syls);
      cur.words.push({ syls, stress: st, n: syls.length });
    } else if (cur.words.length) {
      cur.pause = t.pause; groups.push(cur); cur = { words: [], pause: null };
    } else if (groups.length && t.pause === '‖') {
      groups[groups.length - 1].pause = '‖';
    }
  }
  if (cur.words.length) groups.push(cur);

  const parts = [];
  for (const g of groups) {
    // Flatten to segments with word/syllable positions for allophony.
    const flat = [];
    g.words.forEach((w, wi) => w.syls.forEach((s, si) => s.segs.forEach((seg) => flat.push({ seg, wi, si }))));
    for (let i = 0; i < flat.length; i++) {
      const s = flat[i].seg;
      if (s.v) continue;
      const next = flat[i + 1] ? flat[i + 1].seg : null;
      if (s.p === 'n' && next && !next.v) {
        if (['p', 'b', 'm'].includes(next.p)) s.out = 'm';
        else if (['k', 'g', 'x'].includes(next.p)) s.out = 'ŋ';
        else if (next.p === 'f') s.out = 'ɱ';
      }
      if (s.p === 's' && next && !next.v) s.out = 'h';
    }
    for (let i = 0; i < flat.length; i++) {
      const s = flat[i].seg;
      if (!LENITE[s.p]) continue;
      const prev = i > 0 ? flat[i - 1].seg : null;
      const prevOut = prev ? (prev.out || segIpa(prev)) : null;
      const stop = !prev || NASALS.has(prevOut) || (s.p === 'd' && prevOut === 'l');
      if (!stop) s.out = LENITE[s.p];
    }

    // Resyllabify: final consonant + next word starting with a vowel.
    for (let wi = 0; wi < g.words.length - 1; wi++) {
      const a = g.words[wi], b = g.words[wi + 1];
      const lastSyl = a.syls[a.syls.length - 1];
      const tail = lastSyl.segs[lastSyl.segs.length - 1];
      const head = b.syls[0].segs[0];
      if (tail && !tail.v && head && head.v && lastSyl.segs.length > 1) {
        lastSyl.segs.pop();
        b.syls[0].segs.unshift(tail);
        a.joinNext = true;
      }
    }

    // Render.
    let str = '';
    g.words.forEach((w, wi) => {
      const sylStr = w.syls.map((s, si) => {
        const body = s.segs.map((x) => x.out || segIpa(x)).join('');
        return (w.n > 1 && si === w.stress ? 'ˈ' : '') + body;
      }).join('.');
      str += sylStr;
      if (wi < g.words.length - 1) str += w.joinNext ? '.' : ' ';
    });
    parts.push(str);
    if (g.pause) parts.push(g.pause);
  }
  while (parts.length && (parts[parts.length - 1] === '‖' || parts[parts.length - 1] === '|')) parts.pop();
  return '[' + parts.join(' ') + ']';
}
