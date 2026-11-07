// Gemini Live API over a WebSocket: stream the mic up (16 kHz PCM), play native audio back (24 kHz PCM),
// and surface transcripts of both sides.
import { getGemini } from './gemini.js';

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export const LIVE_MODELS = ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-preview-09-2025', 'gemini-live-2.5-flash-preview'];
export const VOICES = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];

const WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch)); this.n += ch.length;
      if (this.n >= 1600) { // ~100 ms at 16 kHz
        const out = new Int16Array(this.n); let o = 0;
        for (const b of this.buf) for (let i = 0; i < b.length; i++) { const s = Math.max(-1, Math.min(1, b[i])); out[o++] = s < 0 ? s * 0x8000 : s * 0x7fff; }
        this.port.postMessage(out.buffer, [out.buffer]); this.buf = []; this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm16', Pcm16);`;

const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

export class LiveSession {
  // handlers: onStatus(text), onUserText(delta), onModelText(delta), onTurnComplete(), onError(msg), onSpeaking(bool)
  constructor(handlers) { this.h = handlers; this.ws = null; this.playing = new Set(); }

  async start({ system, voice }) {
    const { key } = getGemini();
    if (!key) throw new Error('Falta la clave de Gemini (Perfil → Gemini).');
    this.stopped = false;
    // Mic first, so the permission prompt comes before connecting.
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.inCtx = new AudioContext({ sampleRate: 16000 });
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    this.nextAt = 0;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await this.inCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    await this.connect(key, { system, voice }, 0);
  }

  connect(key, cfg, attempt) {
    return new Promise((resolve, reject) => {
      const model = LIVE_MODELS[attempt];
      if (!model) { reject(new Error('Ningún modelo de voz en vivo respondió con esta clave.')); return; }
      this.h.onStatus(`Conectando (${model})…`);
      const ws = new WebSocket(`${WS}?key=${encodeURIComponent(key.trim())}`);
      this.ws = ws;
      let ready = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: {
          model: `models/${model}`,
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice || 'Aoede' } } } },
          systemInstruction: { parts: [{ text: cfg.system }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        } }));
      };
      ws.onmessage = async (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : await ev.data.text();
        let msg; try { msg = JSON.parse(raw); } catch { return; }
        if (msg.setupComplete) { ready = true; this.model = model; this.startMic(); this.h.onStatus('Escuchando…'); resolve(model); return; }
        this.handle(msg);
      };
      ws.onerror = () => {};
      ws.onclose = (ev) => {
        if (this.stopped) return;
        if (!ready) {
          // Model unknown or not allowed for this key: try the next one.
          const reason = ev.reason || '';
          if (/not found|not supported|unsupported|model/i.test(reason) || ev.code === 1008 || ev.code === 1007) { this.connect(key, cfg, attempt + 1).then(resolve, reject); return; }
          reject(new Error(`No se pudo abrir la voz en vivo (${ev.code}${reason ? `: ${reason}` : ''}).`));
          return;
        }
        this.h.onError(`Se cortó la conexión (${ev.code}${ev.reason ? `: ${ev.reason}` : ''}).`);
        this.stop();
      };
    });
  }

  startMic() {
    const src = this.inCtx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.inCtx, 'pcm16');
    this.node.port.onmessage = (e) => {
      if (this.muted || !this.ws || this.ws.readyState !== 1) return;
      this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(e.data), mimeType: 'audio/pcm;rate=16000' } } }));
    };
    src.connect(this.node);
  }

  handle(msg) {
    const sc = msg.serverContent;
    if (!sc) { if (msg.goAway) this.h.onStatus('La sesión está por terminar…'); return; }
    if (sc.interrupted) this.flush();
    if (sc.inputTranscription && sc.inputTranscription.text) this.h.onUserText(sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) this.h.onModelText(sc.outputTranscription.text);
    const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
    for (const p of parts) {
      if (p.inlineData && /audio\/pcm/.test(p.inlineData.mimeType || '')) this.play(p.inlineData.data, p.inlineData.mimeType);
    }
    if (sc.turnComplete) this.h.onTurnComplete();
  }

  play(data, mime) {
    const rate = Number((/rate=(\d+)/.exec(mime) || [])[1]) || 24000;
    const pcm = new Int16Array(unb64(data));
    const buf = this.outCtx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const node = this.outCtx.createBufferSource();
    node.buffer = buf; node.connect(this.outCtx.destination);
    const at = Math.max(this.outCtx.currentTime + 0.03, this.nextAt);
    node.start(at); this.nextAt = at + buf.duration;
    this.playing.add(node);
    this.h.onSpeaking(true);
    node.onended = () => { this.playing.delete(node); if (!this.playing.size) this.h.onSpeaking(false); };
  }

  flush() { for (const n of this.playing) { try { n.stop(); } catch { /* already stopped */ } } this.playing.clear(); this.nextAt = 0; this.h.onSpeaking(false); }

  sendText(text) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
  }

  stop() {
    this.stopped = true;
    this.flush();
    try { if (this.ws) this.ws.close(); } catch { /* ignore */ }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    try { if (this.inCtx) this.inCtx.close(); } catch { /* ignore */ }
    try { if (this.outCtx) this.outCtx.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}
