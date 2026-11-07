// Gemini API (free tier) called straight from the phone with the user's own key.
// Works with the new "AQ." auth keys and the older "AIza" keys, sent in the x-goog-api-key header.
const KEY = 'cadencia.gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Tried in order the first time; the first one that answers is remembered.
const CANDIDATES = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

export function getGemini() {
  try { return { key: '', model: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { key: '', model: '' }; }
}
export function setGemini(patch) {
  const s = { ...getGemini(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}
export const geminiReady = () => { const s = getGemini(); return !!(s.key && s.model); };

function explain(status, body) {
  const msg = (body && body.error && body.error.message) || '';
  if (status === 400 && /API key not valid/i.test(msg)) return 'La clave no es válida. Copiala de nuevo desde AI Studio.';
  if (status === 401 || status === 403) return `Google rechazó la clave (${status}). ${msg}`.trim();
  if (status === 429) return 'Llegaste al límite gratis por ahora. Probá en un rato.';
  if (status === 404) return 'Ese modelo no está disponible.';
  return `Gemini respondió ${status}. ${msg}`.trim();
}

async function call(model, key, payload) {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(explain(res.status, body)); e.status = res.status; throw e; }
  const cand = body && body.candidates && body.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('') : '';
  if (!text) {
    const why = (cand && cand.finishReason) || (body && body.promptFeedback && body.promptFeedback.blockReason) || 'sin motivo';
    const e = new Error(why === 'MAX_TOKENS' ? 'Gemini se quedó sin espacio para responder (MAX_TOKENS).' : `Gemini no devolvió texto (motivo: ${why}).`);
    e.status = 200; throw e;
  }
  return text;
}

// Finds a model that works with this key and saves both.
export async function testKey(key) {
  let last = null;
  for (const model of CANDIDATES) {
    try {
      const text = await call(model, key, { contents: [{ role: 'user', parts: [{ text: 'Respondé solo con la palabra: listo' }] }] });
      setGemini({ key: key.trim(), model });
      return { model, text: text.trim() };
    } catch (err) {
      last = err;
      if (err.status !== 404 && err.status !== 200) break; // a key problem won't be fixed by another model
    }
  }
  throw last || new Error('No pude conectar con Gemini.');
}

// One request. system: instructions; turns: [{ role: 'user'|'model', text }]; json: ask for JSON output.
export async function ask({ system, turns, json = false, temperature = 0.7 }) {
  const s = getGemini();
  if (!s.key || !s.model) throw new Error('Falta la clave de Gemini (Perfil → Gemini).');
  const payload = {
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  const text = await call(s.model, s.key, payload);
  return json ? JSON.parse(text.replace(/^```json\s*|```$/g, '')) : text;
}
