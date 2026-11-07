// Offline voseo check: finds tú forms and suggests the Rioplatense vos form.
import { VERBS, vosPresent } from './vosdata.js';

const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const PRESENT = new Map(VERBS.filter((v) => v.inf !== 'ir').map((v) => [v.tu, vosPresent(v)])); // tienes -> tenés
const PREP_TI = /\b(para|a|de|por|sin|en|sobre|hacia|contra|entre)\s+ti\b/gi;
const ACC = { a: 'á', e: 'é', i: 'í' };
// Common -ir verbs (tú -es -> vos -ís): escribes -> escribís
const IR = new Set(['escrib', 'viv', 'abr', 'recib', 'decid', 'sub', 'compart', 'sufr', 'permit', 'exist', 'insist', 'part', 'cumpl', 'discut', 'sal', 'ocurr', 'asist', 'describ', 'descubr', 'cubr', 'imprim', 'divid', 'resist', 'aplaud', 'admit', 'consum', 'resum', 'asum', 'interrump', 'confund', 'difund', 'escup', 'un', 'reun', 'conduc', 'produc', 'traduc', 'reduc', 'introduc']);

const keepCase = (orig, s) => (orig[0] === orig[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s);

export function checkVoseo(text) {
  const out = [];
  const add = (index, length, original, suggestion, note) => out.push({ index, length, original, suggestion, note });
  for (const m of text.matchAll(new RegExp(`(^|[^${L}])([${L}]+)(?=[^${L}]|$)`, 'g'))) {
    const word = m[2], lw = word.toLowerCase(), idx = m.index + m[1].length;
    if (lw === 'tú') add(idx, word.length, word, keepCase(word, 'vos'), 'Sujeto: en el Río de la Plata se dice vos.');
    else if (lw === 'eres') add(idx, word.length, word, keepCase(word, 'sos'), 'Ser con vos: sos.');
    else if (lw === 'contigo') add(idx, word.length, word, keepCase(word, 'con vos'), 'Con vos, no contigo.');
    else if (PRESENT.has(lw)) add(idx, word.length, word, keepCase(word, PRESENT.get(lw)), 'Presente de vos: sin cambio de raíz, fuerza al final.');
  }
  for (const m of text.matchAll(PREP_TI)) {
    const at = m.index + m[0].length - 2;
    add(at, 2, 'ti', 'vos', `Después de “${m[1]}”, vos: ${m[1]} vos.`);
  }
  // Regular verbs right after "tú": tú hablas -> (vos) hablás
  for (const m of text.matchAll(new RegExp(`\\btú\\s+([${L}]+?)(as|es)(?=[^${L}]|$)`, 'gi'))) {
    const stem = m[1], end = m[2], verb = stem + end;
    if (PRESENT.has(verb.toLowerCase())) continue;
    const idx = m.index + m[0].length - verb.length;
    const isIr = end === 'es' && IR.has(stem.toLowerCase());
    const vos = isIr ? `${stem}ís` : stem + end.replace(/^([ae])/, (c) => ACC[c]);
    const note = end === 'as' ? 'Presente de vos (-ar): la fuerza va al final, con tilde.' : isIr ? 'Verbo en -ir: con vos termina en -ís.' : `Si el verbo es en -er: ${vos}; si es en -ir, termina en -ís.`;
    add(idx, verb.length, verb, vos, note);
  }
  return out.sort((a, b) => a.index - b.index).filter((x, i, arr) => !i || x.index !== arr[i - 1].index);
}

export function applyVoseo(text, fixes) {
  let s = text;
  for (const f of [...fixes].sort((a, b) => b.index - a.index)) s = s.slice(0, f.index) + f.suggestion + s.slice(f.index + f.length);
  return s;
}
