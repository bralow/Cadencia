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
  if (status === 503 || status === 500 || status === 502 || status === 504) return 'Gemini está saturado en este momento (lo intenté con varios modelos). Probá de nuevo en un minuto.';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUSY = (st) => st === 500 || st === 502 || st === 503 || st === 504;
// Busy server: wait a little and try again before giving up on this model.
async function callRetry(model, key, payload) {
  for (let attempt = 0; ; attempt++) {
    try { return await call(model, key, payload); }
    catch (err) { if (BUSY(err.status) && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; } throw err; }
  }
}
// Other models to use when the saved one is overloaded or out of free quota. Each model has its own limits.
const BACKUPS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];
async function callAny(s, makePayload) {
  const models = [s.model, ...BACKUPS.filter((m) => m !== s.model)];
  let last;
  for (const model of models) {
    try { return await callRetry(model, s.key, makePayload(model)); }
    catch (err) {
      last = err;
      if (!(BUSY(err.status) || err.status === 429 || err.status === 404)) throw err;
    }
  }
  throw last;
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
// fast: ask the model to skip most of its "thinking", which is what makes chat replies slow.
export async function ask({ system, turns, json = false, temperature = 0.7, fast = false }) {
  const s = getGemini();
  if (!s.key || !s.model) throw new Error('Falta la clave de Gemini (Perfil → Gemini).');
  const payload = {
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  let text;
  if (fast) {
    const withThinking = (model) => ({ ...payload, generationConfig: { ...payload.generationConfig, thinkingConfig: /gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' } } });
    try { text = await callAny(s, withThinking); }
    catch (err) { if (err.status !== 400) throw err; } // a model that doesn't take that setting: ask normally
  }
  if (text === undefined) text = await callAny(s, () => payload);
  return json ? JSON.parse(text.replace(/^```json\s*|```$/g, '')) : text;
}

// Gemini text-to-speech: returns { samples: Float32Array, rate }. Tries known TTS model names.
const TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-tts'];
export async function geminiSpeech(text, voice = 'Aoede', style = 'Decilo con acento rioplatense de Buenos Aires, natural y cálido') {
  const s = getGemini();
  if (!s.key) throw new Error('Falta la clave de Gemini.');
  const models = s.tts ? [s.tts, ...TTS_MODELS.filter((m) => m !== s.tts)] : TTS_MODELS;
  let last;
  for (const model of models) {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.key.trim() },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${style}: ${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    const body = await res.json().catch(() => null);
    if (res.status === 404 || res.status === 429 || BUSY(res.status)) { last = new Error(explain(res.status, body)); continue; }
    if (!res.ok) { const e = new Error(explain(res.status, body)); e.status = res.status; throw e; }
    const part = body && body.candidates && body.candidates[0] && body.candidates[0].content && (body.candidates[0].content.parts || []).find((p) => p.inlineData);
    if (!part) throw new Error('Gemini no devolvió audio.');
    if (s.tts !== model) setGemini({ tts: model });
    const rate = Number((/rate=(\d+)/.exec(part.inlineData.mimeType || '') || [])[1]) || 24000;
    const bin = atob(part.inlineData.data);
    const n = bin.length >> 1;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 0x8000) v -= 0x10000; samples[i] = v / 0x8000; }
    return { samples, rate };
  }
  throw last || new Error('Sin modelo de voz disponible.');
}
