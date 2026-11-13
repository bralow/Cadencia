import { h, toast } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { TOPICS, persona, reply, corrections } from '../charla.js';
import { LiveSession, VOICES } from '../live.js';
import { geminiReady, geminiSpeech } from '../gemini.js';
import { unlockAudio, playPcm, stopPcm, concat } from '../pcm.js';
import { getSettings } from '../settings.js';
import { tappableText, markWord, showWordPanel, sentenceWith } from '../wordpanel.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { log } from '../progress.js';
import { stopSpeaking, speak } from '../tts.js';
import { useFlor, phoneSay, stopPhone } from '../voz.js';

const KEY = 'cadencia.charla';
const prefs = () => { try { return { topic: 'libre', mode: 'texto', voice: 'Aoede', autoVoice: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { topic: 'libre', mode: 'texto', voice: 'Aoede', autoVoice: true }; } };
const setPref = (p) => { const v = { ...prefs(), ...p }; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } return v; };
let msgs = []; // { role: 'user'|'model', text, corr?: [], pending?: bool }
let live = null;
const KIND_COLOR = { voseo: 'var(--accent)', gramática: 'var(--native-fast)', vocabulario: 'var(--gold)', natural: 'var(--muted)' };

export async function render(main) {
  main.append(h('div', { class: 'between' }, practiceTabs('charla')));
  if (!geminiReady()) {
    main.append(h('section', { class: 'card empty' }, h('h2', {}, 'Falta la clave de Gemini'),
      h('p', { class: 'muted small' }, 'La charla usa Gemini. Pegá tu clave en Perfil y tocá “Guardar y probar”.'),
      h('a', { class: 'btn', href: '#/perfil', style: 'align-self:center' }, 'Ir a Perfil')));
    return () => {};
  }
  let p = prefs();
  const level = getSettings().level;

  const topicSel = h('select', { 'aria-label': 'Tema', style: 'flex:1;min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:0 10px;font-size:15px' },
    TOPICS.map((t) => h('option', { value: t.id }, t.label)));
  topicSel.value = p.topic;
  const modeBtns = [['texto', 'Texto'], ['voz', 'Voz en vivo']].map(([k, l]) => h('button', { type: 'button', class: 'pill', style: 'min-height:38px;border:none', 'aria-pressed': String(p.mode === k) }, l));
  const newBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:44px' }, 'Nueva charla');
  const voiceSel = h('select', { 'aria-label': 'Voz de Flor', style: 'min-height:40px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:0 10px;font-size:14px' }, VOICES.map((v) => h('option', { value: v }, v)));
  voiceSel.value = p.voice;
  const autoBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;font-size:12px', 'aria-pressed': String(p.autoVoice) }, 'Voz automática');
  main.append(h('section', { class: 'card', style: 'gap:10px;padding:12px 14px' },
    h('div', { class: 'row' }, topicSel, newBtn),
    h('div', { class: 'between' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo' }, modeBtns), h('span', { class: 'muted small' }, `Nivel ${level} · con Flor`)),
    h('div', { class: 'row wrap', style: 'gap:8px' }, h('span', { class: 'small muted' }, 'Voz'), voiceSel, autoBtn)));

  const list = h('div', { class: 'list', 'aria-live': 'polite', style: 'gap:10px' });
  const panel = h('section', { class: 'hero', 'aria-label': 'Palabra seleccionada', hidden: true, style: 'padding:16px 18px;gap:10px' });
  main.append(list);

  // --- Text composer
  const input = h('textarea', { rows: '2', placeholder: 'Escribí en español…', 'aria-label': 'Tu mensaje', lang: 'es-AR',
    style: 'flex:1;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:10px 12px;font-family:var(--body);font-size:16px;line-height:1.4;resize:none' });
  const send = h('button', { type: 'button', class: 'btn', style: 'padding:0 16px' }, 'Enviar');
  const composer = h('div', { class: 'row', style: 'align-items:flex-end' }, input, send);

  // --- Live controls
  const liveBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Empezar a hablar', style: 'align-self:center' },
    h('span', { html: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>', style: 'display:contents' }));
  const liveStatus = h('p', { class: 'small', role: 'status', style: 'text-align:center;font-weight:600' }, 'Tocá el micrófono y hablá. Flor te contesta con su voz.');
  const liveBox = h('section', { class: 'card', style: 'gap:10px;align-items:stretch' }, liveBtn, liveStatus,
    h('p', { class: 'muted', style: 'font-size:12px;line-height:1.4' }, 'Usá auriculares si podés. El acento depende de Gemini: le pido porteño, pero puede no salirle perfecto.'));

  main.append(composer, liveBox, panel);

  // --- Flor's voice: live audio she already spoke, or Gemini text-to-speech for text replies.
  let warned = false;
  async function sayMsg(m, btn, auto) {
    if (btn) btn.textContent = '…';
    if (!m.live && !useFlor()) { // the phone's voice: no Gemini request, starts right away
      if (btn) btn.textContent = '■ Parar';
      await phoneSay(m.text);
      if (btn) btn.textContent = '▶ Repetir';
      return;
    }
    if (auto) { m.voicing = true; draw(); }
    try {
      if (!m.audio) { const r = await geminiSpeech(m.text, p.voice); m.audio = r.samples; m.rate = r.rate; }
      if (btn) btn.textContent = '■ Parar';
      if (auto) { m.voicing = false; draw(); }
      await playPcm(m.audio, m.rate || 24000);
    } catch (err) {
      if (!warned) { toast(`Sin voz de Gemini (${err.message || err}). Uso la del teléfono.`); warned = true; }
      speak(m.text);
    }
    if (m.voicing) { m.voicing = false; draw(); }
    if (btn) btn.textContent = '▶ Repetir';
  }

  // --- Rendering
  function bubble(m) {
    if (m.role === 'model') {
      const body = m.pending && !m.text ? h('p', { class: 'muted small' }, m.live ? 'Flor está por hablar…' : 'Flor está escribiendo…')
        : tappableText(m.text, (word, b) => { markWord(list, b); showWordPanel(panel, word, { context: sentenceWith(m.text, word), tag: '#Charla' }); }, 'font-size:17px;line-height:1.5');
      const save = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px;align-self:flex-start' }, 'Guardar frase');
      save.onclick = async () => { await db.put('mazo', { front: m.text, ipa: transcribe(m.text), back: '', tag: '#Charla', created: Date.now() }); toast('Guardado en Penumbra'); };
      const again = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, '▶ Repetir');
      again.onclick = () => { unlockAudio(); if (again.textContent.startsWith('■')) { stopPcm(); stopPhone(); again.textContent = '▶ Repetir'; } else sayMsg(m, again); };
      return h('div', { class: 'card', style: 'gap:6px;padding:12px 14px;max-width:88%;align-self:flex-start;border-bottom-left-radius:6px' },
        h('span', { class: 'kicker', style: 'font-size:10px' }, 'FLOR'), body,
        m.voicing ? h('span', { class: 'muted small' }, '🔊 preparando la voz…') : '',
        m.text && !m.pending ? h('div', { class: 'row wrap', style: 'gap:6px' }, again, save) : '');
    }
    const corr = m.corr && m.corr.length
      ? h('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:6px;border-top:1px solid color-mix(in srgb, var(--sel-ink) 25%, transparent)' },
        m.corr.map((c) => h('div', { style: 'font-size:13px;line-height:1.35' },
          h('s', { style: 'opacity:.75' }, c.original), ' → ', h('b', {}, c.better),
          h('span', { style: `margin-left:6px;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--surface);color:${KIND_COLOR[c.kind] || 'var(--ink)'}` }, (c.kind || '').toUpperCase()),
          c.why ? h('div', { style: 'opacity:.85' }, c.why) : '')))
      : m.checking ? h('span', { style: 'font-size:12px;opacity:.75' }, 'revisando…') : m.corr ? h('span', { style: 'font-size:12px;opacity:.8' }, '✓ ¡Bien dicho!') : '';
    return h('div', { class: 'card', style: 'gap:2px;padding:12px 14px;max-width:88%;align-self:flex-end;background:var(--sel);color:var(--sel-ink);border-color:var(--sel);border-bottom-right-radius:6px' },
      h('p', { style: 'font-size:16px;line-height:1.45', lang: 'es-AR' }, m.text || '…'), corr);
  }
  const draw = () => {
    list.replaceChildren(...(msgs.length ? msgs.map(bubble) : [h('p', { class: 'muted small', style: 'text-align:center' }, p.mode === 'texto' ? 'Escribí algo para empezar, o esperá que Flor te salude.' : 'Tocá el micrófono para empezar.')]));
  };
  const scrollEnd = () => requestAnimationFrame(() => list.lastElementChild && list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  function showMode() {
    composer.hidden = p.mode !== 'texto';
    liveBox.hidden = p.mode !== 'voz';
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((i ? 'voz' : 'texto') === p.mode)));
  }

  async function check(m) {
    m.checking = true; draw();
    try { m.corr = await corrections(m.text, level); log('charla', { corrections: m.corr.length, kinds: m.corr.map((c) => c.kind) }); }
    catch { m.corr = []; }
    m.checking = false; draw();
  }

  // --- Text mode
  async function modelTurn() {
    const pending = { role: 'model', text: '', pending: true };
    msgs.push(pending); draw(); scrollEnd();
    const history = msgs.filter((m) => !m.pending && m.text).map((m) => ({ role: m.role, text: m.text }));
    if (!history.length || history[0].role !== 'user') history.unshift({ role: 'user', text: '(Empezá vos la charla: saludá y hacé una pregunta.)' });
    try { pending.text = await reply(history, p.topic, level); }
    catch (err) { pending.text = ''; msgs.splice(msgs.indexOf(pending), 1); toast(err.message || 'No pude hablar con Gemini'); }
    pending.pending = false; draw(); scrollEnd();
    if (pending.text && p.autoVoice && p.mode === 'texto') sayMsg(pending, null, true);
  }

  // Typed message, spoken answer: a live connection with no mic streams Flor's voice as she
  // answers, instead of writing the reply first and then recording it (two slow trips).
  let tlive = null, tconn = null, tcur = null, liveFailed = false;
  const historyOf = (list) => {
    const hist = list.filter((m) => !m.pending && m.text).map((m) => ({ role: m.role, text: m.text }));
    if (hist.length && hist[0].role !== 'user') hist.unshift({ role: 'user', text: '(Empezá vos la charla: saludá y hacé una pregunta.)' });
    return hist;
  };
  function dropText() { if (tlive) { tlive.stop(); } tlive = null; tconn = null; tcur = null; }
  function textLive(prior) {
    if (tlive && tlive.ws && tlive.ws.readyState === 1) return Promise.resolve(tlive);
    if (tconn) return tconn;
    const s = new LiveSession({
      onStatus: () => {}, onSpeaking: () => {}, onUserText: () => {},
      onModelText: (d) => { if (!tcur) return; tcur.text += d; tcur.pending = false; draw(); scrollEnd(); },
      onTurnComplete: (audio) => {
        if (!tcur) return;
        tcur.text = tcur.text.trim(); tcur.pending = false;
        if (audio) { tcur.audio = concat(audio); tcur.rate = s.rate || 24000; }
        tcur = null; draw();
      },
      onError: () => { if (tlive === s) { tlive = null; tconn = null; } },
    });
    tconn = s.start({ system: persona(p.topic, level) + '\nLa otra persona te escribe y vos respondés en voz alta: frases naturales y cortas.', voice: p.voice, mic: false, history: prior })
      .then(() => { tlive = s; tconn = null; return s; }, (err) => { tconn = null; s.stop(); throw err; });
    return tconn;
  }
  async function voiceTurn(text, prior) {
    const pending = { role: 'model', text: '', pending: true, live: true };
    msgs.push(pending); draw(); scrollEnd();
    tcur = pending;
    try {
      const s = await textLive(prior);
      s.sendText(text);
      log('charla', { voiceText: true });
    } catch (err) {
      liveFailed = true; tcur = null;
      msgs.splice(msgs.indexOf(pending), 1);
      toast('La voz rápida no conectó; sigo con la voz normal.');
      return modelTurn();
    }
    // If she says nothing in 15 s, reconnect and answer the slow way instead of leaving you hanging.
    setTimeout(() => {
      if (pending.pending && !pending.text && msgs.includes(pending)) {
        dropText(); msgs.splice(msgs.indexOf(pending), 1); modelTurn();
      }
    }, 15000);
  }

  send.onclick = async () => {
    unlockAudio(); // the tap lets Android play Flor's voice when her answer arrives
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const prior = historyOf(msgs);
    const m = { role: 'user', text };
    msgs.push(m); draw(); scrollEnd();
    check(m);
    if (p.autoVoice && !liveFailed && useFlor()) await voiceTurn(text, prior); // Flor's own streamed voice
    else await modelTurn(); // written reply, read aloud by the phone when Voz automática is on
  };
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click(); } };

  // --- Live mode
  let curUser = null, curModel = null;
  const setLiveBtn = (on) => { liveBtn.classList.toggle('live', on); liveBtn.setAttribute('aria-label', on ? 'Terminar la charla' : 'Empezar a hablar'); };
  async function startLive() {
    stopLive();
    live = new LiveSession({
      onStatus: (t) => { liveStatus.textContent = t; },
      onSpeaking: (on) => { liveStatus.textContent = on ? 'Flor está hablando…' : 'Escuchando…'; },
      onUserText: (d) => {
        if (!curUser) { curUser = { role: 'user', text: '' }; msgs.push(curUser); }
        curUser.text += d; draw(); scrollEnd();
      },
      onModelText: (d) => {
        if (!curModel) { curModel = { role: 'model', text: '', live: true }; msgs.push(curModel); }
        curModel.text += d; draw(); scrollEnd();
      },
      onTurnComplete: (audio) => {
        if (curUser && curUser.text.trim()) { curUser.text = curUser.text.trim(); check(curUser); }
        if (curModel) { curModel.text = curModel.text.trim(); if (audio) { curModel.audio = concat(audio); curModel.rate = live.rate || 24000; } }
        curUser = null; curModel = null; draw();
      },
      onError: (msg) => { liveStatus.textContent = msg; setLiveBtn(false); },
    });
    try {
      await live.start({ system: persona(p.topic, level) + '\nEstás hablando en voz alta: frases naturales y cortas.', voice: p.voice });
      setLiveBtn(true);
      log('charla', { live: true });
      if (!msgs.length) live.sendText('(Empezá vos la charla: saludá y hacé una pregunta.)');
    } catch (err) {
      liveStatus.textContent = 'No se pudo empezar: ' + (err.message || err);
      setLiveBtn(false); live = null;
    }
  }
  function stopLive() { if (live) { live.stop(); live = null; } setLiveBtn(false); curUser = null; curModel = null; }
  liveBtn.onclick = () => (live ? (stopLive(), liveStatus.textContent = 'Charla en pausa. Tocá para seguir.') : startLive());

  // --- Settings
  topicSel.onchange = () => { p = setPref({ topic: topicSel.value }); stopLive(); dropText(); msgs = []; draw(); if (p.mode === 'texto') modelTurn(); };
  voiceSel.onchange = () => { p = setPref({ voice: voiceSel.value }); msgs.forEach((m) => { if (m.role === 'model' && !m.live) { m.audio = null; } }); dropText(); if (live) startLive(); };
  autoBtn.onclick = () => { unlockAudio(); p = setPref({ autoVoice: !p.autoVoice }); autoBtn.setAttribute('aria-pressed', String(p.autoVoice)); };
  newBtn.onclick = () => { stopLive(); dropText(); msgs = []; draw(); if (p.mode === 'texto') modelTurn(); };
  modeBtns.forEach((b, i) => { b.onclick = () => { p = setPref({ mode: i ? 'voz' : 'texto' }); if (p.mode === 'texto') stopLive(); else dropText(); showMode(); draw(); }; });

  main.addEventListener('pointerdown', unlockAudio, { once: true });
  showMode(); draw();
  if (p.mode === 'texto' && !msgs.length) modelTurn();
  return () => { stopLive(); dropText(); stopSpeaking(); stopPcm(); stopPhone(); };
}
