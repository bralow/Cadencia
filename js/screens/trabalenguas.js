import { h, iconEl, toast } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { TRABAS, PACE } from '../trabadata.js';
import { analyzeWord, transcribe } from '../ipa.js';
import { Player, Recorder, decode, peaks } from '../audio.js';
import { onset, speechEnd } from '../waveform.js';
import { log } from '../progress.js';

let current = 0, speedKey = '1';
const WORD = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/;

// Split text into syllable spans (with the target letters marked) and plain punctuation/spaces.
function layout(t) {
  const marked = new Set();
  for (const m of t.text.matchAll(t.mark)) for (let i = 0; i < m[0].length; i++) marked.add(m.index + i);
  const parts = []; let pos = 0; let syllables = 0;
  for (const tok of t.text.split(WORD)) {
    if (!tok) continue;
    if (WORD.test(tok)) {
      const a = analyzeWord(tok);
      let off = 0;
      for (const syl of a.spelling) {
        const chars = [...tok.slice(off, off + syl.length)].map((ch, k) => ({ ch, mark: marked.has(pos + off + k) }));
        parts.push({ syl: syllables++, chars, pause: false });
        off += syl.length;
      }
    } else {
      parts.push({ text: tok, pause: /[,.;:?!]/.test(tok) });
    }
    pos += tok.length;
  }
  return { parts, syllables };
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, practiceTabs('traba')));

  const select = h('select', { 'aria-label': 'Elegí un trabalenguas', style: 'min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:0 12px;font-size:15px;width:100%' },
    TRABAS.map((t, i) => h('option', { value: String(i) }, `${t.title} · ${t.sound}`)));
  select.value = String(current);
  main.append(select);

  const kicker = h('span', { class: 'kicker' });
  const textEl = h('p', { style: 'font-family:var(--display);font-size:22px;line-height:1.6;font-weight:600', lang: 'es-AR' });
  const ipaEl = h('p', { class: 'ipa', hidden: true, style: 'line-height:1.6' });
  const ipaBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Ver IPA');
  const srcEl = h('span', { class: 'muted', style: 'font-size:12px' });
  main.append(h('section', { class: 'card', style: 'gap:10px' }, h('div', { class: 'between' }, kicker, srcEl), textEl, ipaEl, h('div', { class: 'row' }, ipaBtn)));

  const speeds = ['0.6', '1', '1.25'];
  const speedBtns = speeds.map((k) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(k === speedKey) }, k === '1' ? '1.0x' : `${k}x`));
  speedBtns.forEach((b, i) => { b.onclick = () => { speedKey = speeds[i]; speedBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); stopPacer(); }; });
  main.append(h('div', { class: 'between' }, h('span', { class: 'muted small', style: 'font-weight:600' }, 'Velocidad'), h('div', { class: 'row', role: 'group', 'aria-label': 'Velocidad', style: 'gap:6px' }, speedBtns)));

  const paceBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Seguir el ritmo' }, iconEl('play'));
  const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabarme con el ritmo' }, iconEl('mic'));
  const recLabel = h('span', { style: 'font-weight:700;color:var(--accent)' }, 'Grabar');
  const mineBtn = h('button', { type: 'button', class: 'round user', 'aria-label': 'Escuchar mi voz', disabled: true }, iconEl('play'));
  main.append(h('div', { class: 'controls' },
    h('div', { class: 'control' }, paceBtn, h('span', {}, 'Ritmo')),
    h('div', { class: 'control' }, recBtn, recLabel),
    h('div', { class: 'control' }, mineBtn, h('span', {}, 'Mi voz'))));
  const result = h('section', { class: 'card', hidden: true, 'aria-live': 'polite', style: 'gap:6px' });
  main.append(result);
  main.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Ritmo resalta cada sílaba a la velocidad elegida. Grabar arranca el ritmo y te graba: al terminar te digo a cuántas sílabas por segundo fuiste.'));

  let lay, spans = [], timer = 0, k = 0;
  const player = new Player(), recorder = new Recorder();

  function show() {
    stopPacer();
    const t = TRABAS[current];
    lay = layout(t);
    kicker.replaceChildren(t.title.toUpperCase(), h('span', { style: 'text-transform:none;letter-spacing:0;font-family:var(--ipa-font);margin-left:6px' }, t.sound));
    srcEl.textContent = t.src === 'trad' ? 'tradicional' : 'de Cadencia';
    spans = [];
    textEl.replaceChildren(...lay.parts.map((p) => {
      if (p.text !== undefined) return document.createTextNode(p.text);
      const s = h('span', { style: 'border-radius:6px;padding:0 1px;transition:background .08s' },
        ...p.chars.map((c) => (c.mark ? h('span', { style: 'color:var(--accent);text-decoration:underline;text-underline-offset:4px' }, c.ch) : c.ch)));
      spans.push(s);
      return s;
    }));
    ipaEl.textContent = transcribe(t.text);
    result.hidden = true; mineBtn.disabled = true; player.load(null);
  }

  function stopPacer() {
    clearTimeout(timer); timer = 0;
    spans.forEach((s) => { s.style.background = ''; s.style.color = ''; });
    paceBtn.replaceChildren(iconEl('play'));
  }

  // Walk through syllables at the target pace; a comma or period costs one extra beat.
  function startPacer(onDone) {
    stopPacer();
    const beat = 1000 / PACE[speedKey];
    const seq = [];
    lay.parts.forEach((p) => { if (p.text === undefined) seq.push(p.syl); else if (p.pause) seq.push(-1); });
    k = 0;
    paceBtn.replaceChildren(iconEl('stop'));
    const step = () => {
      spans.forEach((s) => { s.style.background = ''; s.style.color = ''; });
      if (k >= seq.length) { stopPacer(); if (onDone) onDone(); return; }
      const idx = seq[k++];
      if (idx >= 0) { spans[idx].style.background = 'var(--sel)'; spans[idx].style.color = 'var(--sel-ink)'; }
      timer = setTimeout(step, beat);
    };
    timer = setTimeout(step, 400);
  }

  paceBtn.onclick = () => (timer ? stopPacer() : startPacer());

  async function stopRecording() {
    stopPacer();
    const blob = await recorder.stop();
    recBtn.classList.remove('live'); recBtn.replaceChildren(iconEl('mic')); recLabel.textContent = 'Grabar';
    if (!blob || !blob.size) return;
    player.load(blob); mineBtn.disabled = false;
    try {
      const buf = await decode(blob);
      const track = { peaks: peaks(buf), duration: buf.duration };
      const secs = Math.max(0.3, speechEnd(track) - onset(track));
      const rate = lay.syllables / secs, target = PACE[speedKey];
      const diff = rate / target;
      log('traba', { id: TRABAS[current].id, speed: speedKey, rate, ok: diff >= 0.88 && diff <= 1.12 });
      const verdict = diff > 1.12 ? 'Fuiste más rápido que la meta. Bajá un cambio y cuidá cada sonido.' : diff < 0.88 ? 'Un poco lento todavía. Repetilo hasta que salga de corrido.' : '¡En el ritmo justo!';
      const fmt = (x) => x.toFixed(1).replace('.', ',');
      result.replaceChildren(
        h('span', { class: 'kicker' }, 'TU VELOCIDAD'),
        h('p', { style: 'font-family:var(--display);font-size:26px;font-weight:700' }, `${fmt(rate)} sílabas/s`),
        h('p', { class: 'muted small' }, `Meta a ${speedKey === '1' ? '1.0' : speedKey}x: ${fmt(target)} sílabas/s · ${lay.syllables} sílabas en ${fmt(secs)} s`),
        h('p', { style: 'font-size:15px' }, verdict));
      result.hidden = false;
    } catch { toast('No pude medir la grabación'); }
  }

  recBtn.onclick = async () => {
    if (recorder.recording) { await stopRecording(); return; }
    player.pause();
    try { await recorder.start(); } catch { toast('Necesito permiso para usar el micrófono'); return; }
    recBtn.classList.add('live'); recBtn.replaceChildren(iconEl('stop')); recLabel.textContent = 'Detener';
    startPacer(() => setTimeout(() => { if (recorder.recording) stopRecording(); }, 1500));
  };
  mineBtn.onclick = () => (player.playing ? player.pause() : player.play());
  ipaBtn.onclick = () => { ipaEl.hidden = !ipaEl.hidden; ipaBtn.textContent = ipaEl.hidden ? 'Ver IPA' : 'Ocultar IPA'; };
  select.onchange = () => { current = Number(select.value); show(); };

  show();
  return () => { stopPacer(); if (recorder.recording) recorder.stop(); player.load(null); };
}
