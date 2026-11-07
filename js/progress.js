// Private practice log on the phone, and the scores built from it.
const LOG = 'cadencia.log', SEEN = 'cadencia.seen', MAX = 3000;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export function log(type, data = {}) {
  const all = read(LOG, []);
  all.push({ t: Date.now(), type, ...data });
  write(LOG, all.slice(-MAX));
}
export const events = (type) => read(LOG, []).filter((e) => !type || e.type === type);

// Sounds the learner has met (in the word panel or the IPA board).
export function discover(ipa) {
  const seen = new Set(read(SEEN, []));
  for (const s of TRACKED) if (s.match(ipa)) seen.add(s.id);
  write(SEEN, [...seen]);
}

const pct = (list) => (list.length ? list.filter(Boolean).length / list.length : 0);
const recent = (list, n) => list.slice(-n);
const ramp = (n, full) => Math.min(1, n / full); // little data -> smaller score

export function skills() {
  const oido = events('oido'), vos = events('vos'), ipa = events('ipa'), sombra = events('sombra'), traba = events('traba');
  const lookups = events('lookup').length, cog = events('cognados');
  const storiesRead = Object.values(read('cadencia.read', {})).reduce((n, l) => n + l.length, 0);
  const rhythm = sombra.filter((e) => typeof e.rhythm === 'number').map((e) => e.rhythm);
  const trabaOk = traba.map((e) => e.ok);
  const pron = rhythm.length || trabaOk.length
    ? ((rhythm.length ? recent(rhythm, 20).reduce((a, b) => a + b, 0) / recent(rhythm, 20).length : pct(recent(trabaOk, 20))) * 0.6 + pct(recent(trabaOk, 20)) * 0.4) * ramp(rhythm.length + traba.length, 15)
    : 0;
  return [
    { id: 'escucha', label: 'Escucha', value: pct(recent(oido.map((e) => e.correct), 50)) * ramp(oido.length, 20), n: oido.length },
    { id: 'pron', label: 'Pronunciación', value: pron, n: rhythm.length + traba.length + sombra.filter((e) => e.recorded).length },
    { id: 'ipa', label: 'Fonética e IPA', value: pct(recent(ipa.map((e) => e.correct), 50)) * ramp(ipa.length, 20), n: ipa.length },
    { id: 'lectura', label: 'Lectura y vocabulario', value: Math.min(1, storiesRead * 0.04 + lookups * 0.01 + pct(recent(cog.map((e) => e.correct), 30)) * ramp(cog.length, 20) * 0.4), n: storiesRead + lookups + cog.length },
    { id: 'vos', label: 'Gramática (vos)', value: pct(recent(vos.map((e) => e.correct), 50)) * ramp(vos.length, 20), n: vos.length },
  ];
}

// The porteño sounds, how to recognize them in IPA, and what counts as practice and mastery.
export const TRACKED = [
  { id: 'sh', sym: 'ʃ', name: 'll / y porteña', match: (ipa) => ipa.includes('ʃ'), trabas: ['ll', 'll2'], oido: null },
  { id: 'h', sym: 'h', name: 's aspirada', match: (ipa) => /h/.test(ipa), trabas: ['s'], oido: null, elision: true },
  { id: 'rr', sym: 'r', name: 'rr fuerte', match: (ipa) => /r/.test(ipa.replace(/ɾ/g, '')), trabas: ['rr'], oido: 'rr' },
  { id: 'r', sym: 'ɾ', name: 'r suave', match: (ipa) => ipa.includes('ɾ'), trabas: ['tr', 'ladrillo'], oido: 'rr' },
  { id: 'ene', sym: 'ɲ', name: 'ñ', match: (ipa) => ipa.includes('ɲ'), trabas: ['ene'], oido: 'ene' },
  { id: 'suaves', sym: 'β ð ɣ', name: 'b, d, g suaves', match: (ipa) => /[βðɣ]/.test(ipa), trabas: ['b', 'd'], oido: null },
  { id: 'jota', sym: 'x', name: 'jota', match: (ipa) => ipa.includes('x'), trabas: ['jota'], oido: null },
  { id: 'acento', sym: 'ˈ', name: 'acento (fuerza)', match: (ipa) => ipa.includes('ˈ'), trabas: [], oido: 'acento' },
  { id: 'dipt', sym: 'j w', name: 'diptongos', match: (ipa) => /[jw]/.test(ipa), trabas: [], oido: null },
];

// 0 = not yet, 1 = descubierto, 2 = practicado, 3 = dominado
export function phonemeStatus() {
  const seen = new Set(read(SEEN, []));
  const traba = events('traba'), oido = events('oido'), elision = events('elision'), ipa = events('ipa');
  return TRACKED.map((s) => {
    const tr = traba.filter((e) => s.trabas.includes(e.id));
    const od = s.oido ? oido.filter((e) => e.contrast === s.oido) : [];
    const ip = ipa.filter((e) => e.sounds && e.sounds.includes(s.id));
    const practiced = tr.length >= 1 || od.length >= 5 || (s.elision && elision.length >= 3) || ip.length >= 3;
    const trMastered = tr.some((e) => e.ok && Number(e.speed) >= 1);
    const odMastered = od.length >= 15 && pct(recent(od.map((e) => e.correct), 20)) >= 0.85;
    const ipMastered = ip.length >= 8 && pct(recent(ip.map((e) => e.correct), 10)) >= 0.8;
    const mastered = s.oido ? (odMastered && (s.trabas.length ? trMastered : true)) : s.trabas.length ? trMastered && (!s.elision || elision.length >= 5) : ipMastered;
    const level = mastered ? 3 : practiced ? 2 : seen.has(s.id) || tr.length || od.length ? 1 : 0;
    return { ...s, level };
  });
}

// Days with any practice, ending today.
export function streak() {
  const days = new Set(read(LOG, []).map((e) => new Date(e.t).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not started yet: count up to yesterday
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  const week = [];
  for (let i = 6; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); week.push({ day: x, active: days.has(x.toDateString()) }); }
  return { n, week, today: days.has(new Date().toDateString()) };
}
