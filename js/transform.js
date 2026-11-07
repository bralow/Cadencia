// Word Transformer: shows how a word or phrase turns into Buenos Aires pronunciation, one rule at a time.
import { transcribe, analyzeWord } from './ipa.js';

const OFF = { sheismo: false, aspira: false, suaves: false, nasal: false, enlace: false };
export const RULES = [
  { key: null, title: 'Sonidos básicos', explain: 'Cada letra pasa a su sonido. La h no suena; c (ante e, i) y z suenan [s], como en toda América; j y g (ante e, i) son [x]. La sílaba con acento lleva ˈ.' },
  { key: 'sheismo', title: 'Sheísmo', explain: 'La ll y la y ante vocal suenan [ʃ], como "sh". Es la marca más reconocible de Buenos Aires: en casi todo el resto del mundo hispano suenan [ʝ].' },
  { key: 'aspira', title: 'S aspirada', explain: 'La s antes de consonante se suaviza en una [h], un soplido. En el habla relajada porteña es lo normal: "los perros" suena [loh ˈpe.ros].' },
  { key: 'suaves', title: 'B, d y g suaves', explain: 'Entre vocales (y casi siempre fuera de una pausa o una nasal) b, d y g no cierran del todo: suenan [β ð ɣ], con un roce suave.' },
  { key: 'nasal', title: 'La n se adapta', explain: 'La n copia el lugar de la consonante que sigue: [m] ante p, b, m; [ŋ] ante k, g, j; [ɱ] ante f.' },
  { key: 'enlace', title: 'Enlace entre palabras', explain: 'Una consonante final se pega a la vocal de la palabra siguiente: "los otros" se silabea [lo.ˈso.tros]. Por eso el español hablado parece una sola palabra larga.' },
];

// Character diff: marks which characters of b are new compared with a.
export function changed(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const marks = new Array(m).fill(true);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { marks[j] = false; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return marks;
}

export function steps(text) {
  const words = (text.match(/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+/g) || []).map(analyzeWord).filter(Boolean);
  const spelled = words.map((w) => w.spelling.map((s, i) => (w.spelling.length > 1 && i === w.stress ? s.toUpperCase() : s)).join('-')).join(' ');
  const out = [];
  const on = { ...OFF };
  let prev = null;
  for (const r of RULES) {
    if (r.key) on[r.key] = true;
    const ipa = transcribe(text, on);
    out.push({ ...r, ipa, marks: prev === null ? null : changed(prev, ipa), applies: prev === null || ipa !== prev });
    prev = ipa;
  }
  return { spelled, steps: out, final: prev };
}
