import { h, toast, LEVELS } from '../ui.js';
import { getSettings, setSetting } from '../settings.js';
import { db, persist } from '../db.js';
import { importClipPack } from '../clippack.js';

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
      h('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/', target: '_blank', rel: 'noopener' }, 'CC BY-SA 4.0'), '.')));
}
