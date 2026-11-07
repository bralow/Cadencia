import { h, toast, LEVELS } from '../ui.js';
import { getSettings, setSetting } from '../settings.js';
import { db, persist } from '../db.js';
import { importClipPack } from '../clippack.js';
import { APP_VERSION } from '../app.js';
import { getTts, setTts, VOICES, argentineAudio } from '../tts.js';
import { Player } from '../audio.js';
import { getGemini, setGemini, testKey } from '../gemini.js';

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
    pillGroup('Velocidad inicial', ['0.5', '0.75', '1'], s.speed, (v) => setSetting('speed', v), { cls: 'grid3', fmt: (x) => (x === '1' ? '1.0x' : x + 'x') }),
    pillGroup('Apariencia', ['system', 'light', 'dark'], s.theme, (v) => setSetting('theme', v), { cls: 'grid3', fmt: (x) => ({ system: 'Sistema', light: 'Claro', dark: 'Oscuro' })[x] })));

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
  const importBtn = h('label', { for: 'pack', class: 'btn', role: 'button', tabindex: '0' }, 'Importar paquete de clips');
  importBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    importBtn.setAttribute('aria-disabled', 'true');
    status.textContent = 'Leyendo el paquete…';
    try {
      await persist();
      const n = await importClipPack(file, (d, t) => { status.textContent = `Importando… ${d} de ${t}`; });
      status.textContent = `Listo: ${n} clips importados.`;
      toast('Clips importados');
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
