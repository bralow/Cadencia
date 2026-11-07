// The phone's own text-to-speech (for example Vox Sherpa with the Argentine voice "Daniela").
// Free and offline: used wherever text is read aloud, unless the user prefers Flor (Gemini).
import { geminiReady } from './gemini.js';

const KEY = 'cadencia.voz';
export function getVoz() {
  try { return { source: 'phone', voice: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { source: 'phone', voice: '' }; }
}
export function setVoz(patch) {
  const v = { ...getVoz(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
  return v;
}

const has = () => 'speechSynthesis' in window;
// Chrome fills the voice list a moment after the page loads.
export function listVoices() {
  if (!has()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}
if (has()) speechSynthesis.getVoices(); // start loading early

const isAR = (v) => /es[-_]AR/i.test(v.lang) || /argentin|daniela/i.test(v.name);
export const spanish = (voices) => voices.filter((v) => /^es/i.test(v.lang) || /daniela|español|spanish/i.test(v.name));
// The chosen voice, else an Argentine one, else any Spanish voice.
export function pickVoice(voices = has() ? speechSynthesis.getVoices() : []) {
  const want = getVoz().voice;
  return (want && voices.find((v) => v.voiceURI === want || v.name === want))
    || voices.find(isAR) || voices.find((v) => v.lang === 'es-US') || spanish(voices)[0] || null;
}
export const phoneIsArgentine = () => { const v = pickVoice(); return !!v && isAR(v); };

// true: read aloud with Flor (Gemini). false: the phone's voice.
export const useFlor = () => getVoz().source === 'gemini' && geminiReady();

let current = null;
// Speak and resolve when finished (or stopped). rate 1 = normal.
export function phoneSay(text, { rate = 1 } = {}) {
  if (!has()) return Promise.reject(new Error('Este navegador no tiene voces.'));
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-AR';
    u.rate = rate;
    u.onend = u.onerror = () => { if (current === u) current = null; resolve(); };
    current = u;
    speechSynthesis.speak(u);
  });
}
export function stopPhone() { if (has()) speechSynthesis.cancel(); current = null; }
export const phoneSpeaking = () => !!current;
