// Flor's Argentine voice (Gemini text-to-speech) for fixed texts, saved on the phone after the
// first time so each text costs one request ever.
import { geminiSpeech, geminiReady } from './gemini.js';
import { pcmToWav } from './pcm.js';
import { db } from './db.js';

export const florVoice = () => { try { return JSON.parse(localStorage.getItem('cadencia.charla') || '{}').voice || 'Aoede'; } catch { return 'Aoede'; } };
export const florReady = geminiReady;

export async function florClip(text, style) {
  const voice = florVoice();
  const id = `gemini|${voice}|${style || ''}|${text.trim()}`;
  const hit = await db.get('tts', id).catch(() => null);
  if (hit && hit.blob) return hit.blob;
  const { samples, rate } = await geminiSpeech(text, voice, style);
  const blob = pcmToWav(samples, rate);
  await db.put('tts', { id, blob }).catch(() => {});
  return blob;
}
