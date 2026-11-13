import { h, toast, LEVELS } from '../ui.js';
import { getVoz, setVoz, listVoices, spanish, pickVoice, phoneSay } from '../voz.js';
import { getSettings, setSetting } from '../settings.js';
import { db, persist } from '../db.js';
import { importPack } from '../podcast.js';
import { APP_VERSION } from '../app.js';
import { getTts, setTts, VOICES, argentineAudio } from '../tts.js';
import { Player } from '../audio.js';
import { getGemini, setGemini, testKey } from '../gemini.js';
import { HOY_BLOCKS } from './hoy.js';
import { settings as penSettings, saveSettings as savePen } from '../penumbra.js';

function pillGroup(label, options, value, onPick, { cls = 'grid6', goal = false, fmt = (x) => x } = {}) {
  const btns = options.map((o) => h('button', { type: 'button', class: 'pill' + (goal ? ' goal' : ''), 'aria-pressed': String(o === value) }, fmt(o)));
  btns.forEach((b, i) => { b.onclick = () => { btns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); onPick(options[i]); }; });
  return [h('h3', { style: 'font-size:15px;font-weight:700' }, label), h('div', { class: cls, role: 'group', 'aria-label': label }, btns)];
}

export async function render(main) {
  const s = getSettings();
  main.append(h('h1', {}, 'Perfil'));

  main.append(h('section', { class: 'card' },
    pillGroup('Nivel actual', LEVELS, s.level, (v) => setSetting('level', v)),
    pillGroup('Meta', LEVELS, s.goal, (v) => setSetting('goal', v), { goal: true }),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'Tu nivel elige qué frases te tocan en Sombra: las de tu nivel y las de un nivel arriba o abajo.')));

  main.append(h('section', { class: 'card' },
    pillGroup('Velocidad inicial', ['0.5', '0.75', '1'], s.speed, (v) => setSetting('speed', v), { cls: 'grid3', fmt: (x) => (x === '1' ? '1.0x' : x + 'x') })));

  // Appearance: theme, accent, density, your name, which blocks Hoy shows.
  const ACCENTS = [['azul', 'Azul', '#8FA8FF'], ['menta', 'Menta', '#5EEAD4'], ['ambar', 'Ámbar', '#FFB86B'], ['lila', 'Lila', '#E9A8FF']];
  const swatches = ACCENTS.map(([k, l, c]) => {
    const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String((s.accent || 'azul') === k), style: 'display:flex;align-items:center;gap:6px;justify-content:center;min-width:0;border-radius:12px' },
      h('span', { style: `width:14px;height:14px;border-radius:50%;background:${c};flex:none` }), l);
    b.onclick = () => { setSetting('accent', k); swatches.forEach((x, i) => x.setAttribute('aria-pressed', String(ACCENTS[i][0] === k))); };
    return b;
  });
  const name = h('input', { type: 'text', value: s.name || '', placeholder: 'Para el saludo de Hoy', 'aria-label': 'Tu nombre', autocomplete: 'given-name',
    style: 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:100%' });
  name.onchange = () => setSetting('name', name.value.trim());
  const hiddenSet = new Set(s.hoyHidden || []);
  const blockBoxes = Object.entries(HOY_BLOCKS).map(([k, l]) => {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !hiddenSet.has(k);
    cb.onchange = () => { if (cb.checked) hiddenSet.delete(k); else hiddenSet.add(k); setSetting('hoyHidden', [...hiddenSet]); };
    return h('label', { style: 'display:flex;gap:10px;align-items:center;min-height:36px;cursor:pointer' }, cb, l);
  });
  main.append(h('section', { class: 'card' },
    h('span', { class: 'kicker' }, 'APARIENCIA'),
    pillGroup('Tema', ['dark', 'light', 'system'], s.theme, (v) => setSetting('theme', v), { cls: 'grid3', fmt: (x) => ({ system: 'Del teléfono', light: 'Claro', dark: 'Oscuro' })[x] }),
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Color de acento'), h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px' }, swatches),
    pillGroup('Densidad', ['comoda', 'compacta'], s.density || 'comoda', (v) => setSetting('density', v), { cls: 'grid3', fmt: (x) => ({ comoda: 'Cómoda', compacta: 'Compacta' })[x] }),
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Tu nombre'), name,
    h('details', {}, h('summary', { style: 'font-weight:700;cursor:pointer;font-size:15px' }, 'Qué muestra Hoy'), h('div', { style: 'display:flex;flex-direction:column;margin-top:6px' }, blockBoxes))));

  // Goals (FE-07): shown as meters on Hoy.
  const g = { reviews: 30, streak: 30, ...(s.goals || {}) };
  const pen = penSettings();
  const setGoal = (k, v) => { g[k] = v; setSetting('goals', { ...g }); };
  main.append(h('section', { class: 'card' },
    h('span', { class: 'kicker' }, 'METAS'),
    pillGroup('Repasos por día', ['10', '20', '30', '50', '100'], String(g.reviews), (v) => setGoal('reviews', Number(v)), { cls: 'grid6' }),
    pillGroup('Tarjetas nuevas por día', ['5', '10', '15', '20', '30'], String(pen.newPerDay), (v) => savePen({ newPerDay: Number(v) }), { cls: 'grid6' }),
    pillGroup('Meta de racha (días)', ['7', '30', '100', '365'], String(g.streak), (v) => setGoal('streak', Number(v)), { cls: 'grid6' }),
    pillGroup('Retención buscada', ['0.85', '0.9', '0.95'], String(pen.retention), (v) => savePen({ retention: Number(v) }), { cls: 'grid3', fmt: (x) => `${Math.round(Number(x) * 100)}%` }),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'La retención es cuánto querés recordar al repasar. Más alta = repasos más seguidos (más trabajo, menos olvidos). 90% es el equilibrio habitual.')));

  // Argentine voice (Azure)
  const tts = getTts();
  const field = (label, id, value, attrs = {}) => [
    h('label', { for: id, class: 'small', style: 'font-weight:600' }, label),
    h('input', { id, value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs,
      style: 'min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:100%' })];
  const keyField = field('Clave (Key 1)', 'ttskey', tts.key, { type: 'password' });
  const regionField = field('Región (Location/Region)', 'ttsregion', tts.region, { placeholder: 'por ejemplo: eastus' });
  const ttsStatus = h('p', { class: 'small', role: 'status' });
  const voicePills = pillGroup('Voz', VOICES.map((v) => v.id), tts.voice, (v) => setTts({ voice: v }), { cls: 'grid3', fmt: (id) => VOICES.find((v) => v.id === id).label });
  const testPlayer = new Player();
  const testBtn = h('button', { type: 'button', class: 'btn' }, 'Guardar y probar');
  testBtn.onclick = async () => {
    setTts({ key: keyField[1].value.trim(), region: regionField[1].value.trim() });
    ttsStatus.textContent = 'Probando…';
    try {
      testPlayer.load(await argentineAudio('¡Hola, che! ¿Todo bien?', { force: true }));
      await testPlayer.play();
      ttsStatus.textContent = '¡Funciona! Escuchar en Leer ya usa la voz argentina.';
    } catch (err) {
      ttsStatus.textContent = 'No funcionó: ' + (err.message || err);
    }
  };
  const SHOW_VOICE = false; // Azure voice setup is parked until the user wants it
  if (SHOW_VOICE) main.append(h('section', { class: 'card' },
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Voz argentina'),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'Para que Escuchar hable con acento argentino. Usa Azure (gratis hasta 500.000 caracteres por mes). Sin clave, usa la voz del teléfono.'),
    keyField, regionField, voicePills, testBtn, ttsStatus));

  // Voice for reading aloud: the phone's own (e.g. Vox Sherpa · Daniela) or Flor (Gemini).
  const vz = getVoz();
  const vSel = h('select', { 'aria-label': 'Voz del teléfono', style: 'width:100%;min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 10px;font-size:15px' });
  const vStatus = h('p', { class: 'small', role: 'status', style: 'line-height:1.4' });
  const vTry = h('button', { type: 'button', class: 'btn' }, 'Probar');
  const vAll = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;font-size:12px' }, 'Ver todas las voces');
  const srcBtns = [['phone', 'Voz del teléfono'], ['gemini', 'Flor (Gemini)']].map(([k, l]) => h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(vz.source === k) }, l));
  let showAll = false;
  async function fillVoices() {
    const all = await listVoices();
    const list = showAll ? all : spanish(all);
    const chosen = pickVoice(all);
    vSel.replaceChildren(...(list.length ? list : all).map((v) => h('option', { value: v.voiceURI }, `${v.name} (${v.lang})`)));
    if (chosen) vSel.value = chosen.voiceURI;
    if (!all.length) vStatus.textContent = 'Chrome no muestra ninguna voz. Revisá el motor de texto a voz del teléfono.';
    else if (!all.some((v) => /es[-_]AR/i.test(v.lang) || /daniela|argentin/i.test(v.name))) vStatus.textContent = 'No veo una voz argentina. Si usás Vox Sherpa, ponela como motor preferido en Ajustes del teléfono (buscá «texto a voz»: suele estar en Administración general → Salida de texto a voz → Motor preferido), y después cerrá Chrome del todo y volvé a abrir la app.';
    else vStatus.textContent = chosen ? `Usando: ${chosen.name} (${chosen.lang}).` : '';
  }
  vSel.onchange = () => { setVoz({ voice: vSel.value }); fillVoices(); };
  vAll.onclick = () => { showAll = !showAll; vAll.textContent = showAll ? 'Solo voces en español' : 'Ver todas las voces'; fillVoices(); };
  vTry.onclick = () => { phoneSay('¡Hola, che! ¿Cómo andás? Yo te voy a leer en voz alta.'); };
  srcBtns.forEach((b, i) => { b.onclick = () => { setVoz({ source: i ? 'gemini' : 'phone' }); srcBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); }; });
  main.append(h('section', { class: 'card' },
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Voz para leer en voz alta'),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'La voz del teléfono es gratis, instantánea y funciona sin internet. Se usa en Escuchar, Trabalenguas, la tarjeta del día, Escribir, Diario y las respuestas escritas de Flor. La charla en vivo siempre usa la voz de Gemini.'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Voz para leer' }, srcBtns),
    h('label', { class: 'small', style: 'font-weight:600' }, 'Voz del teléfono'), vSel,
    h('div', { class: 'row wrap' }, vTry, vAll), vStatus));
  fillVoices();

  // Gemini (AI features)
  const gm = getGemini();
  const gKey = h('input', { id: 'gkey', type: 'password', value: gm.key, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'AQ.… o AIza…',
    style: 'min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:100%' });
  const gStatus = h('p', { class: 'small', role: 'status' }, gm.key && gm.model ? `Conectado (${gm.model}).` : '');
  const gTest = h('button', { type: 'button', class: 'btn' }, 'Guardar y probar');
  const gRemove = h('button', { type: 'button', class: 'btn ghost', hidden: !gm.key }, 'Quitar clave');
  gTest.onclick = async () => {
    const k = gKey.value.trim();
    if (!k) { gStatus.textContent = 'Pegá tu clave primero.'; return; }
    gStatus.textContent = 'Probando con Google…';
    try {
      const r = await testKey(k);
      gStatus.textContent = `¡Funciona! Modelo: ${r.model}. Gemini dijo: “${r.text}”.`;
      gRemove.hidden = false;
    } catch (err) { gStatus.textContent = 'No funcionó: ' + (err.message || err); }
  };
  gRemove.onclick = () => { setGemini({ key: '', model: '' }); gKey.value = ''; gStatus.textContent = 'Clave quitada del teléfono.'; gRemove.hidden = true; };
  main.append(h('section', { class: 'card' },
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Gemini (funciones con IA)'),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'Pegá tu clave de Google AI Studio. Queda guardada solo en este teléfono y se envía únicamente a Google. En el plan gratis, Google puede usar lo que escribas para mejorar sus productos: no compartas datos privados.'),
    h('label', { for: 'gkey', class: 'small', style: 'font-weight:600' }, 'Clave de Gemini'), gKey,
    h('div', { class: 'row wrap' }, gTest, gRemove), gStatus));

  // Clip pack import
  const count = h('span', { class: 'muted small' });
  const status = h('p', { class: 'small', role: 'status' });
  const refresh = async () => { const n = await db.count('clips'); count.textContent = n ? `${n} clips en el teléfono` : 'Todavía no hay clips'; };
  const input = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed,application/x-zip,application/octet-stream', id: 'pack' });
  const importBtn = h('label', { for: 'pack', class: 'btn', role: 'button', tabindex: '0' }, 'Importar paquete');
  importBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    importBtn.setAttribute('aria-disabled', 'true');
    status.textContent = 'Leyendo el paquete…';
    try {
      await persist();
      const r = await importPack(file, (d, t) => { status.textContent = `Importando… ${d} de ${t}`; });
      if (r.kind === 'podcast') { status.textContent = `Listo: ${r.n} episodios de ${r.show}${r.packs > 1 ? ` (paquete ${r.pack} de ${r.packs})` : ''}. Están en Leer → Podcast.`; toast('Episodios importados'); }
      else if (r.kind === 'songs') { status.textContent = `Listo: ${r.n} canciones de ${r.show}. Están en Leer → Canciones.`; toast('Canciones importadas'); }
      else { status.textContent = `Listo: ${r.n} clips importados.`; toast('Clips importados'); }
    } catch (err) {
      status.textContent = 'No se pudo importar: ' + (err.message || err);
    }
    importBtn.removeAttribute('aria-disabled');
    input.value = '';
    refresh();
  };
  const clearBtn = h('button', { type: 'button', class: 'btn ghost' }, 'Borrar clips');
  clearBtn.onclick = async () => {
    if (!(await db.count('clips'))) return;
    if (!window.confirm('¿Borrar todos los clips del teléfono? Tu Mazo no se toca.')) return;
    await db.clear('clips'); await db.clear('audio'); refresh(); toast('Clips borrados');
  };
  main.append(h('section', { class: 'card' },
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Clips de audio'), count,
    h('div', { class: 'row wrap' }, importBtn, input, clearBtn), status));
  refresh();

  main.append(h('section', { style: 'padding:4px 4px 0;display:flex;flex-direction:column;gap:6px' },
    h('h3', { class: 'muted', style: 'font-size:13px;font-weight:700;letter-spacing:.08em' }, 'CRÉDITOS'),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Audio: corpus de español argentino de OpenSLR (Google), con licencia ',
      h('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/', target: '_blank', rel: 'noopener' }, 'CC BY-SA 4.0'), '.'),
    h('p', { class: 'muted small' }, `Versión ${APP_VERSION}`)));
}
