// Story translation for Libros: English under each paragraph, plus short notes on expressions and
// references a learner would miss. One Gemini request per story; the result is saved with the book.
import { ask } from './gemini.js';

export async function translateStory(title, paragraphs, level) {
  const r = await ask({
    system: 'Sos traductora literaria del español rioplatense al inglés y profesora de español. Traducís con fidelidad y naturalidad, respetando el tono del autor. Respondés solo en JSON.',
    turns: [{ role: 'user', text: `Un estudiante de nivel ${level} está leyendo este texto para aprender español. Es de un libro que tiene.
Título: «${title}»
Párrafos (numerados):
${paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n')}

Devolvé un objeto JSON con:
- "title": el título en inglés.
- "paragraphs": lista con la traducción al inglés de cada párrafo, en el mismo orden y la misma cantidad (${paragraphs.length}).
- "notes": hasta 5 notas sobre expresiones, palabras rioplatenses o referencias culturales o históricas que un estudiante no entendería, cada una {"phrase": fragmento exacto del texto en español, "note": explicación corta en español simple}.` }],
    json: true,
    temperature: 0.2,
  });
  const out = Array.isArray(r.paragraphs) ? r.paragraphs.map(String) : [];
  while (out.length < paragraphs.length) out.push('');
  return {
    title: String(r.title || ''),
    paragraphs: out.slice(0, paragraphs.length),
    notes: Array.isArray(r.notes) ? r.notes.filter((n) => n && n.phrase && n.note) : [],
  };
}
