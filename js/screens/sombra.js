import { h, iconEl, toast, LEVELS, shuffle } from '../ui.js';
import { db } from '../db.js';
import { getSettings } from '../settings.js';
import { transcribe } from '../ipa.js';
import { Player, Recorder, decode, peaks } from '../audio.js';
import { Waveform } from '../waveform.js';

const SESSION = 10;
let session = null; // survives tab switches: { ids, index, level }

export function practiceTabs(active) {
  return h('div', { class: 'seg', role: 'navigation', 'aria-label': 'Modo de práctica' },
    active === 'sombra' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Sombra') : h('a', { href: '#/sombra' }, 'Sombra'),
    active === 'vos' ? h('span', { class: 'on', 'aria-current': 'page' }, 'Vos') : h('a', { href: '#/vos' }, 'Vos'));
}

export async function render(main) {
  const settings = getSettings();
  const all = await db.all('clips');
  const counter = h('span', { class: 'muted', style: 'font-size:14px;font-weight:600' });
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Frase anterior' }, iconEl('prev'));
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Siguiente frase' }, iconEl('next'));
  main.append(h('div', { class: 'between' }, practiceTabs('sombra'), h('div', { class: 'row', style: 'gap:0' }, prevBtn, counter, nextBtn)));

  if (!all.length) {
    prevBtn.disabled = nextBtn.disabled = true;
    main.append(h('section', { class: 'card empty' },
      h('h2', {}, 'Todavía no hay clips'),
      h('p', { class: 'muted small' }, 'Prepará el paquete de audios de OpenSLR en tu compu y después importalo desde Perfil.'),
      h('a', { class: 'btn', href: '#/perfil', style: 'align-self:center' }, 'Ir a Perfil')));
    return () => {};
  }

  // Pick a session of clips near the current level.
  const li = LEVELS.indexOf(settings.level);
  let pool = all.filter((c) => Math.abs(LEVELS.indexOf(c.level) - li) <= 1);
  if (pool.length < SESSION) pool = all;
  if (!session || session.level !== settings.level || !session.ids.every((id) => all.some((c) => c.id === id))) {
    session = { ids: shuffle(pool).slice(0, SESSION).map((c) => c.id), index: 0, level: settings.level };
  }
  const byId = new Map(all.map((c) => [c.id, c]));

  // --- Sentence card
  const levelChip = h('span', { class: 'chip solid' });
  const speakerChip = h('span', { class: 'chip' });
  const sentence = h('p', { class: 'sentence', lang: 'es-AR' });
  const ipaLine = h('p', { class: 'ipa' });
  main.append(h('section', { class: 'card' }, h('div', { class: 'row', style: 'gap:6px' }, levelChip, speakerChip), sentence, ipaLine));

  // --- Waveform card
  const canvas = h('canvas', { class: 'wave', role: 'img', 'aria-label': 'Ondas de la voz nativa y la tuya' });
  const overlayBtn = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', style: 'min-height:40px' }, 'Superponer');
  const timeEnd = h('span');
  main.append(h('section', { class: 'card', 'aria-label': 'Ondas de audio', style: 'gap:8px;padding:14px 16px' },
    h('div', { class: 'between' },
      h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--native)' }), 'Nativa'), h('span', {}, h('i', { style: 'background:var(--user)' }), 'Vos')),
      overlayBtn),
    canvas,
    h('div', { class: 'between muted', style: 'font-size:11px' }, h('span', {}, '0,0 s'), timeEnd)));
  const wave = new Waveform(canvas);

  // --- Speed
  const speeds = ['0.5', '0.75', '1'];
  let speed = speeds.includes(settings.speed) ? settings.speed : '1';
  const speedBtns = speeds.map((v) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(v === speed), onclick: () => setSpeed(v) }, v === '1' ? '1.0x' : v + 'x'));
  main.append(h('div', { class: 'between' }, h('span', { class: 'muted small', style: 'font-weight:600' }, 'Velocidad'), h('div', { class: 'row', role: 'group', 'aria-label': 'Velocidad', style: 'gap:6px' }, speedBtns)));

  // --- Controls
  const playBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Escuchar la nativa' }, iconEl('play'));
  const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabar tu voz' }, iconEl('mic'));
  const recLabel = h('span', { style: 'font-weight:700;color:var(--accent)' }, 'Grabar');
  const mineBtn = h('button', { type: 'button', class: 'round user', 'aria-label': 'Escuchar mi voz', disabled: true }, iconEl('play'));
  main.append(h('div', { class: 'controls' },
    h('div', { class: 'control' }, playBtn, h('span', {}, 'Escuchar')),
    h('div', { class: 'control' }, recBtn, recLabel),
    h('div', { class: 'control' }, mineBtn, h('span', {}, 'Mi voz'))));

  const loopBtn = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false' }, 'Bucle');
  const mixBtn = h('button', { type: 'button', class: 'pill', disabled: true }, 'Mezcla 50/50');
  const saveBtn = h('button', { type: 'button', class: 'pill' }, 'Guardar');
  main.append(h('div', { class: 'row', style: 'justify-content:center' }, loopBtn, mixBtn, saveBtn));

  // --- State
  const native = new Player(), mine = new Player(), recorder = new Recorder();
  let nativeBlob = null, current = null, raf = 0, autoStop = 0, mixing = false;

  function setSpeed(v) {
    speed = v;
    speedBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(speeds[i] === v)));
    native.rate = parseFloat(v);
  }
  native.rate = parseFloat(speed);

  function setIcon(btn, name) { btn.replaceChildren(iconEl(name)); }

  function stopAll() {
    native.pause(); mine.pause();
    if (mixing) { native.volume = 1; mine.volume = 1; native.rate = parseFloat(speed); mixing = false; }
    setIcon(playBtn, 'play'); setIcon(mineBtn, 'play');
  }

  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      const src = native.playing ? native : mine.playing ? mine : null;
      wave.playhead = src ? { t: src.time } : null;
      wave.draw();
      if (src) raf = requestAnimationFrame(loop);
      else { setIcon(playBtn, 'play'); setIcon(mineBtn, 'play'); if (mixing) stopAll(); }
    };
    raf = requestAnimationFrame(loop);
  }

  async function loadClip() {
    stopAll();
    if (recorder.recording) await stopRecording(true);
    const id = session.ids[session.index];
    current = byId.get(id);
    counter.textContent = `${session.index + 1} / ${session.ids.length}`;
    prevBtn.disabled = session.index === 0;
    levelChip.textContent = current.level;
    speakerChip.textContent = current.speaker ? `OpenSLR · ${current.speaker}` : 'OpenSLR';
    sentence.textContent = current.text;
    ipaLine.textContent = transcribe(current.text);
    mine.load(null); mineBtn.disabled = true; mixBtn.disabled = true;
    wave.setUser(null);
    nativeBlob = await db.audioFor(id);
    native.load(nativeBlob);
    if (nativeBlob) {
      try {
        const buf = await decode(nativeBlob);
        wave.setNative(peaks(buf), buf.duration);
        timeEnd.textContent = buf.duration.toFixed(1).replace('.', ',') + ' s';
      } catch { wave.setNative(null); }
    }
  }

  async function stopRecording(discard = false) {
    clearTimeout(autoStop);
    const blob = await recorder.stop();
    recBtn.classList.remove('live'); setIcon(recBtn, 'mic'); recLabel.textContent = 'Grabar';
    recBtn.setAttribute('aria-label', 'Grabar tu voz');
    if (discard || !blob || !blob.size) return;
    mine.load(blob); mineBtn.disabled = false; mixBtn.disabled = false;
    try {
      const buf = await decode(blob);
      wave.setUser(peaks(buf), buf.duration);
    } catch { toast('No pude leer la grabación'); }
  }

  playBtn.onclick = () => {
    if (native.playing) { stopAll(); return; }
    stopAll(); native.play(); setIcon(playBtn, 'pause'); tick();
  };
  mineBtn.onclick = () => {
    if (mine.playing) { stopAll(); return; }
    stopAll(); mine.play(); setIcon(mineBtn, 'pause'); tick();
  };
  recBtn.onclick = async () => {
    if (recorder.recording) { await stopRecording(); return; }
    stopAll();
    try { await recorder.start(); }
    catch { toast('Necesito permiso para usar el micrófono'); return; }
    recBtn.classList.add('live'); setIcon(recBtn, 'stop'); recLabel.textContent = 'Detener';
    recBtn.setAttribute('aria-label', 'Detener la grabación');
    const dur = native.el.duration && isFinite(native.el.duration) ? native.el.duration : 5;
    autoStop = setTimeout(() => { if (recorder.recording) stopRecording(); }, Math.min(20000, (dur * 2 + 1.5) * 1000));
  };
  mixBtn.onclick = () => {
    stopAll();
    mixing = true;
    native.rate = 1; native.volume = 0.5; mine.volume = 0.5;
    native.play(); mine.play(); tick();
  };
  loopBtn.onclick = () => {
    const on = loopBtn.getAttribute('aria-pressed') !== 'true';
    loopBtn.setAttribute('aria-pressed', String(on));
    native.loop = on;
  };
  overlayBtn.onclick = () => {
    wave.overlay = !wave.overlay;
    overlayBtn.setAttribute('aria-pressed', String(wave.overlay));
    wave.draw();
  };
  saveBtn.onclick = async () => {
    if (!current) return;
    await db.put('mazo', { front: current.text, ipa: transcribe(current.text), back: '', tag: '#Sombra', audio: nativeBlob || undefined, created: Date.now() });
    toast('Guardado en el Mazo');
  };
  prevBtn.onclick = () => { if (session.index > 0) { session.index--; loadClip(); } };
  nextBtn.onclick = () => {
    if (session.index < session.ids.length - 1) session.index++;
    else { session = null; toast('¡Sesión completa! Arrancamos otra.'); window.dispatchEvent(new Event('cadencia:rerender')); return; }
    loadClip();
  };

  await loadClip();
  requestAnimationFrame(() => wave.draw());

  return () => {
    stopAll(); cancelAnimationFrame(raf); clearTimeout(autoStop);
    if (recorder.recording) recorder.stop();
    native.load(null); mine.load(null); wave.destroy();
  };
}
