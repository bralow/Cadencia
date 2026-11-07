// The conversation partner: persona, topics, and the correction pass.
import { ask } from './gemini.js';

export const TOPICS = [
  { id: 'libre', label: 'Charla libre', setup: 'Charla libre: preguntale cómo le va y seguí lo que te cuente.' },
  { id: 'cafe', label: 'En un café', setup: 'Están en un café de Palermo. Vos sos el mozo o la moza; tomale el pedido y charlá un poco.' },
  { id: 'depto', label: 'Alquilar un depto', setup: 'Sos dueña o dueño de un departamento en alquiler en Almagro; la otra persona llama para preguntar.' },
  { id: 'futbol', label: 'Fútbol', setup: 'Hablan de fútbol: Boca, River, la Selección, el último partido.' },
  { id: 'asado', label: 'El asado del domingo', setup: 'Están organizando un asado para el domingo: quién trae qué, a qué hora, dónde.' },
  { id: 'viaje', label: 'Viajar por Argentina', setup: 'La otra persona planea un viaje por Argentina y te pide consejos (Mendoza, Bariloche, Salta, Iguazú...).' },
  { id: 'laburo', label: 'El laburo', setup: 'Hablan del trabajo: qué hace, cómo es su día, colegas, horarios.' },
];

const LEVEL_STYLE = {
  A1: 'Usá frases muy cortas y palabras muy comunes. Hablá despacio y claro. Casi sin lunfardo.',
  A2: 'Usá frases cortas y vocabulario cotidiano. Muy poco lunfardo, y si usás una palabra rara, explicala al pasar.',
  B1: 'Hablá natural pero claro. Un poco de lunfardo común (che, laburo, re, bondi).',
  B2: 'Hablá con naturalidad porteña, con lunfardo común y expresiones típicas.',
  C1: 'Hablá como un porteño de verdad, rápido y con lunfardo, sin simplificar.',
  C2: 'Hablá como un porteño de verdad, rápido, con lunfardo y humor, sin simplificar nada.',
};

export function persona(topicId, level) {
  const t = TOPICS.find((x) => x.id === topicId) || TOPICS[0];
  return [
    'Sos Flor, una porteña de unos 30 años que vive en Buenos Aires. Estás charlando con alguien que aprende español rioplatense.',
    'Hablás SIEMPRE con voseo (vos tenés, vos querés, vení, decime) y con acento y vocabulario del Río de la Plata: yeísmo rehilado (ll e y como "sh"), s aspirada, entonación porteña.',
    'Nunca uses "tú" ni "vosotros".',
    LEVEL_STYLE[level] || LEVEL_STYLE.B1,
    `Situación: ${t.setup}`,
    'Respondé con 1 a 3 frases y casi siempre terminá con una pregunta para que la charla siga.',
    'No corrijas los errores de la otra persona en tu respuesta: de eso se encarga otra parte de la app. Si no entendés algo, preguntá con naturalidad.',
    'Si la persona escribe en inglés, contestá en español simple y animala a seguir en español.',
  ].join('\n');
}

// Corrections for one learner message. Returns [{ original, better, kind, why }]
export async function corrections(text, level) {
  if (!text.trim()) return [];
  const result = await ask({
    system: 'Sos un profesor de español rioplatense. Revisás UNA frase de un estudiante y devolvés solo correcciones necesarias, en JSON.',
    turns: [{ role: 'user', text: `Nivel del estudiante: ${level}.
Frase: """${text}"""
Devolvé un objeto JSON {"corrections": [...]} donde cada corrección es {"original": fragmento exacto de la frase, "better": cómo se diría en Buenos Aires, "kind": "gramática" | "voseo" | "vocabulario" | "natural", "why": explicación muy corta en español simple}.
- "voseo": cuando usa tú/ti/contigo o formas de tú (tienes, eres, puedes) en lugar de vos.
- "natural": es correcto pero un porteño lo diría distinto.
- No corrijas mayúsculas, puntuación ni tildes que falten solo por escribir rápido.
- Si la frase está bien, devolvé {"corrections": []}.` }],
    json: true,
    temperature: 0.2,
  });
  return Array.isArray(result.corrections) ? result.corrections.filter((c) => c && c.original && c.better && c.original !== c.better) : [];
}

// One text turn. history: [{ role: 'user'|'model', text }]
export async function reply(history, topicId, level) {
  return (await ask({ system: persona(topicId, level), turns: history, temperature: 0.9 })).trim();
}
