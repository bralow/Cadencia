// Writing practice: prompts, a Gemini review through several "lenses", and a word-level diff.
import { ask } from './gemini.js';

export const LENSES = [
  { id: 'gramática', label: 'Gramática', color: 'var(--native-fast)' },
  { id: 'voseo', label: 'Voseo', color: 'var(--accent)' },
  { id: 'porteño', label: 'Porteño', color: 'var(--gold-text)' },
  { id: 'vocabulario', label: 'Vocabulario', color: 'var(--native)' },
  { id: 'ortografía', label: 'Ortografía', color: 'var(--muted)' },
];

// Writing prompts, roughly by level. Short, everyday, Buenos Aires flavoured.
export const PROMPTS = {
  A1: ['Presentate: ¿cómo te llamás, de dónde sos y qué te gusta hacer?', 'Contá qué comés en un día normal.', 'Describí tu casa o tu departamento.', 'Escribile a un amigo para invitarlo a tomar un café.'],
  A2: ['Contá qué hiciste el fin de semana pasado.', 'Escribile un mensaje a tu jefe porque vas a llegar tarde.', 'Describí a una persona importante en tu vida.', 'Contá cómo es un viaje que te gustaría hacer a la Argentina.'],
  B1: ['Contá una vez que te perdiste en una ciudad que no conocías.', '¿Qué extrañarías de tu país si te mudaras a Buenos Aires?', 'Escribí una reseña corta de un restaurante (real o inventado).', 'Contale a un amigo porteño por qué estás aprendiendo español.'],
  B2: ['¿Es mejor vivir en una ciudad grande o en un pueblo? Argumentá.', 'Escribí una carta de queja a una empresa por un producto que salió mal.', 'Contá un recuerdo de tu infancia con todos los detalles que puedas.', '¿Qué opinás del mate como costumbre social? Imaginá tu primera ronda.'],
  C1: ['Escribí un relato breve que empiece con: «Esa noche, en el colectivo 60…».', 'Analizá una costumbre de tu país como si se la explicaras a un argentino.', 'Escribí un abrazo al estilo de Galeano: una escena chica que diga algo grande.', '¿Qué se pierde y qué se gana al aprender un idioma de adulto?'],
  C2: ['Escribí un monólogo de un tachero porteño que opina de todo.', 'Reescribí una noticia del día con tono irónico, bien rioplatense.', 'Escribí una carta a alguien que ya no está.', 'Defendé una idea impopular con argumentos convincentes.'],
};
export function promptFor(level, skip = -1) {
  const list = PROMPTS[level] || PROMPTS.B1;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === skip) i = (i + 1) % list.length;
  return { text: list[i], index: i };
}

// One request returns everything the screen shows.
export async function review(text, level, promptText) {
  const r = await ask({
    system: 'Sos una profesora porteña de español que corrige textos escritos por estudiantes. Sos cálida, clara y precisa. Respondés solo en JSON.',
    turns: [{ role: 'user', text: `Nivel del estudiante: ${level}.${promptText ? `\nConsigna: «${promptText}»` : ''}
Texto del estudiante:
"""${text}"""

Devolvé un objeto JSON con:
- "corrected": el texto corregido, lo más parecido posible al original (mismas ideas y orden), solo con los cambios necesarios, usando voseo rioplatense (vos tenés, vos sos, imperativo tené/vení).
- "porteno": cómo lo diría naturalmente un porteño de Buenos Aires en una charla informal (puede usar lunfardo común si queda natural).
- "changes": lista de cambios entre el original y "corrected", cada uno {"original": fragmento exacto del texto del estudiante, "better": cómo queda, "lens": "gramática" | "voseo" | "porteño" | "vocabulario" | "ortografía", "why": explicación corta y simple en español}.
  · "voseo": tú/ti/contigo o formas de tú en lugar de vos.
  · "porteño": es correcto pero en Buenos Aires se diría distinto.
  · "ortografía": tildes, letras, mayúsculas.
- "praise": una frase corta y concreta sobre algo que hizo bien.
- "tip": un consejo breve para su próximo texto.
- "level": nivel MCER estimado del texto (A1 a C2).
Si el texto ya está perfecto, "changes" es [] y "corrected" es igual al original.` }],
    json: true,
    temperature: 0.2,
  });
  return {
    corrected: String(r.corrected || text),
    porteno: String(r.porteno || ''),
    changes: Array.isArray(r.changes) ? r.changes.filter((c) => c && c.better !== undefined) : [],
    praise: String(r.praise || ''),
    tip: String(r.tip || ''),
    level: String(r.level || ''),
  };
}

// Word-level diff (longest common subsequence). Punctuation stays attached to its word.
export function diffWords(a, b) {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += ' ' + text; else out.push({ type, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', A[i]); i++; }
    else { push('ins', B[j]); j++; }
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('ins', B[j++]);
  return out;
}
