// Argentine voice via Azure AI Speech (free F0 tier), with the phone's voice as fallback.
// Audio is cached per voice+text on the phone, so each word is only fetched once.
import { db } from './db.js';
import { Player } from './audio.js';

const KEY = 'cadencia.tts';
export const VOICES = [
  { id: 'es-AR-ElenaNeural', label: 'Elena' },
  { id: 'es-AR-TomasNeural', label: 'Tomás' },
];

export function getTts() {
  try { return { key: '', region: '', voice: VOICES[0].id, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { key: '', region: '', voice: VOICES[0].id }; }
}
export function setTts(patch) {
  const s = { ...getTts(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}
export const ttsReady = () => { const s = getTts(); return !!(s.key && s.region); };

const xml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function fetchAzure(text, s) {
  const region = s.region.trim().toLowerCase().replace(/\s+/g, '');
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': s.key.trim(),
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: `<speak version="1.0" xml:lang="es-AR"><voice name="${s.voice}">${xml(text)}</voice></speak>`,
  });
  if (res.status === 401 || res.status === 403) throw new Error('La clave o la región no son correctas');
  if (res.status === 429) throw new Error('Llegaste al límite gratis por ahora; probá en un rato');
  if (!res.ok) throw new Error(`Azure respondió ${res.status}`);
  return new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' });
}

// Returns an audio Blob in the Argentine voice (cached), or throws.
export async function argentineAudio(text, { force = false } = {}) {
  const s = getTts();
  if (!s.key || !s.region) throw new Error('Falta configurar la voz argentina en Perfil');
  const id = `${s.voice}|${text.toLowerCase().trim()}`;
  if (!force) {
    const hit = await db.get('tts', id);
    if (hit) return hit.blob;
  }
  const blob = await fetchAzure(text, s);
  await db.put('tts', { id, blob });
  return blob;
}

export async function cachedArgentineAudio(text) {
  const s = getTts();
  const hit = await db.get('tts', `${s.voice}|${text.toLowerCase().trim()}`);
  return hit ? hit.blob : null;
}

function phoneVoice(text) {
  if (!('speechSynthesis' in window)) return false;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === 'es-AR') || voices.find((v) => v.lang === 'es-US') || voices.find((v) => v.lang.startsWith('es'));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : 'es-AR';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

const player = new Player();

// Speak text: Argentine voice when configured, else the phone's voice.
// Returns 'ar' | 'phone' | 'none', and the error if the Argentine voice failed.
export async function speak(text) {
  if (ttsReady()) {
    try {
      player.load(await argentineAudio(text));
      await player.play();
      return { used: 'ar' };
    } catch (err) {
      return { used: phoneVoice(text) ? 'phone' : 'none', error: err };
    }
  }
  return { used: phoneVoice(text) ? 'phone' : 'none' };
}

export function stopSpeaking() {
  player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
