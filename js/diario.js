// Voice diary: speak, then Gemini transcribes exactly what you said, corrects it, and comments on
// how porteño it sounded. Recordings stay on the phone.
import { ask } from './gemini.js';
import { decode, peaks } from './audio.js';
import { onset, speechEnd } from './waveform.js';
import { pcmToWav } from './pcm.js';

export const SPEAK_PROMPTS = [
  'Contá cómo fue tu día: qué hiciste, con quién y cómo te sentiste.',
  '¿Qué comiste hoy? Contalo con detalles.',
  'Contá algo que te hizo reír esta semana.',
  '¿Qué planes tenés para el fin de semana?',
  'Describí el lugar donde estás ahora mismo.',
  'Contá algo que aprendiste hoy.',
  '¿Qué te preocupa o te entusiasma esta semana?',
  'Contale a un amigo porteño una película o serie que viste.',
  'Contá un recuerdo lindo de tu infancia.',
  '¿Qué harías si mañana te mudaras a Buenos Aires?',
  'Describí a alguien con quien hablaste hoy.',
  'Contá algo que te salió mal y cómo lo resolviste.',
];
export const promptOfDay = (d = new Date()) => SPEAK_PROMPTS[Math.floor(d.getTime() / 86400000) % SPEAK_PROMPTS.length];

// Gemini reliably takes WAV; the phone records WebM. Convert to 16 kHz mono (small, fine for speech).
async function toWav16k(blob) {
  const buf = await decode(blob);
  const len = Math.ceil(buf.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return { wav: pcmToWav(out.getChannelData(0), 16000), buf };
}
const b64 = async (blob) => {
  const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function analyze(blob, level, prompt) {
  const { wav, buf } = await toWav16k(blob);
  const track = { peaks: peaks(buf), duration: buf.duration };
  const speaking = Math.max(1, speechEnd(track) - onset(track));
  const r = await ask({
    system: 'Sos una profesora porteña de español. Escuchás grabaciones de un estudiante y lo ayudás a hablar como en Buenos Aires. Sos cálida, clara y precisa. Respondés solo en JSON.',
    turns: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'audio/wav', data: await b64(wav) } },
      { text: `Nivel del estudiante: ${level}. Consigna: «${prompt}».
Escuchá la grabación y devolvé un objeto JSON con:
- "transcript": lo que dijo, palabra por palabra, TAL CUAL (con sus errores, sin corregir; podés omitir "eh", "em").
- "corrected": la misma transcripción con solo los cambios necesarios, con voseo rioplatense.
- "porteno": cómo lo diría naturalmente un porteño en una charla.
- "changes": lista {"original": fragmento exacto de "transcript", "better": cómo queda, "lens": "gramática" | "voseo" | "porteño" | "vocabulario", "why": explicación corta en español simple}.
- "sounds": hasta 4 observaciones de pronunciación, cada una {"word": palabra, "note": qué escuchaste y cómo suena en Buenos Aires}. Fijate sobre todo en: ll/y como [ʃ] (sheísmo), la s antes de consonante aspirada [h], la r y la rr, vocales puras y la entonación porteña. Si algo ya suena porteño, decilo.
- "praise": una frase corta y concreta sobre algo que hizo bien.
- "tip": un consejo breve para la próxima grabación.
- "level": nivel MCER estimado (A1 a C2).
Si la grabación está vacía o no se entiende, devolvé "transcript": "".` },
    ] }],
    json: true,
    temperature: 0.2,
  });
  const transcript = String(r.transcript || '').trim();
  const words = transcript ? transcript.split(/\s+/).length : 0;
  const changes = Array.isArray(r.changes) ? r.changes.filter((c) => c && c.better !== undefined) : [];
  return {
    transcript,
    corrected: String(r.corrected || transcript),
    porteno: String(r.porteno || ''),
    changes,
    sounds: Array.isArray(r.sounds) ? r.sounds.filter((s) => s && s.note) : [],
    praise: String(r.praise || ''),
    tip: String(r.tip || ''),
    level: String(r.level || ''),
    wpm: words ? Math.round(words / (speaking / 60)) : 0,
    errorRate: words ? Math.round((changes.length / words) * 1000) / 10 : 0, // per 100 words
    words,
  };
}
