import { h } from '../ui.js';
import { skills, phonemeStatus, streak, events } from '../progress.js';
import { db } from '../db.js';

const LEVELS = ['Descubierto', 'Practicado', 'Dominado'];
const TRABA_NAMES = { ll: 'Yeísmo porteño', ll2: 'Llaves y llamadas', s: 'La s aspirada', rr: 'La erre fuerte', tr: 'Tr sin trabarse', ladrillo: 'El cielo enladrillado', ene: 'La eñe', b: 'B fuerte y b suave', d: 'D fuerte y d suave', jota: 'La jota' };
const OIDO_NAMES = { rr: 'r / rr', ene: 'n / ñ', acento: 'Acento' };

function radar(list) {
  const W = 340, H = 300, cx = W / 2, cy = 150, R = 105, n = list.length;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = (f) => list.map((_, i) => pt(i, R * f).join(',')).join(' ');
  const shape = list.map((s, i) => pt(i, R * Math.max(0.03, s.value)).join(',')).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `-70 0 ${W + 140} ${H}`, width: '100%', role: 'img', 'aria-label': 'Radar de habilidades: ' + list.map((s) => `${s.label} ${Math.round(s.value * 100)}%`).join(', ') });
  [0.25, 0.5, 0.75, 1].forEach((f) => svg.append(el('polygon', { points: ring(f), fill: 'none', stroke: 'var(--line)', 'stroke-width': 1 })));
  list.forEach((_, i) => { const [x, y] = pt(i, R); svg.append(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--line)', 'stroke-width': 1 })); });
  svg.append(el('polygon', { points: shape, fill: 'var(--accent)', 'fill-opacity': 0.22, stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  list.forEach((s, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = Math.abs(x - cx) < 10 ? 'middle' : x > cx ? 'start' : 'end';
    const words = s.label.split(' ');
    const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [s.label];
    lines.forEach((ln, k) => svg.append(el('text', { x, y: y + k * 14 - (lines.length - 1) * 7, 'text-anchor': anchor, 'dominant-baseline': 'middle', 'font-size': 12, 'font-weight': 600, fill: 'var(--ink)', 'font-family': 'Inter, sans-serif' }, ln)));
  });
  return svg;
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, h('a', { href: '#/hoy', class: 'pill', style: 'display:flex;align-items:center;text-decoration:none' }, '← Hoy'), h('h1', { style: 'font-size:26px' }, 'Tu progreso')));

  // Streak and the last 7 days
  const st = streak();
  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  main.append(h('section', { class: 'hero', style: 'gap:10px' },
    h('span', { class: 'kicker' }, 'RACHA'),
    h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, st.n === 1 ? '1 día seguido' : `${st.n} días seguidos`),
    h('p', { style: 'font-size:14px' }, st.today ? 'Hoy ya practicaste. ¡Bien ahí!' : 'Hoy todavía no practicaste.'),
    h('div', { style: 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px', 'aria-label': 'Últimos 7 días' },
      st.week.map((d) => h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px' },
        h('span', { style: `width:28px;height:28px;border-radius:999px;display:block;${d.active ? 'background:var(--gold)' : 'border:2px solid var(--hero-muted);opacity:.5'}`, 'aria-label': d.active ? 'practicaste' : 'sin práctica' }),
        h('span', { style: 'font-size:11px;color:var(--hero-muted)' }, dayNames[d.day.getDay()]))))));

  // Skill radar
  const sk = skills();
  const total = sk.reduce((n, s) => n + s.n, 0);
  main.append(h('section', { class: 'card', style: 'gap:6px' },
    h('h2', {}, 'Habilidades'),
    total ? radar(sk) : h('p', { class: 'muted small' }, 'Todavía no hay datos. A medida que practiques en Oído, Vos, Sombra, Trabalenguas e IPA, el radar se va llenando.'),
    h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, sk.map((s) => h('div', { style: 'display:flex;flex-direction:column;gap:3px' },
      h('div', { class: 'between small' }, h('span', { style: 'font-weight:600' }, s.label), h('span', { class: 'muted' }, `${Math.round(s.value * 100)}%`)),
      h('div', { class: 'progress' }, h('div', { style: `width:${Math.round(s.value * 100)}%` }))))),
    h('p', { class: 'muted small', style: 'line-height:1.4;margin-top:4px' }, 'Cada barra mira tus últimos resultados y crece con la cantidad de práctica: diez aciertos de diez cuentan menos que cuarenta de cincuenta.')));

  // Phoneme checklist
  const ph = phonemeStatus();
  main.append(h('section', { class: 'card', style: 'gap:10px' },
    h('h2', {}, 'Sonidos porteños'),
    h('p', { class: 'muted small' }, `${ph.filter((p) => p.level === 3).length} de ${ph.length} dominados`),
    ...ph.map((p) => {
      const how = [];
      if (p.trabas.length) how.push(`Trabalenguas “${TRABA_NAMES[p.trabas[0]]}” en el ritmo a 1.0x o más`);
      if (p.oido) how.push(`85% en Oído (${OIDO_NAMES[p.oido]})`);
      if (p.elision) how.push('grabarte en Elisión');
      if (!p.trabas.length && !p.oido) how.push('acertar palabras con este sonido en IPA → Escribir');
      return h('div', { style: 'display:flex;flex-direction:column;gap:6px;padding:8px 0;border-top:1px solid var(--line)' },
        h('div', { class: 'row', style: 'gap:10px' },
          h('span', { style: 'font-family:var(--ipa-font);font-size:22px;min-width:52px;color:var(--accent)' }, p.sym),
          h('span', { style: 'font-weight:600;flex:1' }, p.name)),
        h('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px' },
          LEVELS.map((l, i) => h('span', { style: `text-align:center;font-size:11px;font-weight:700;padding:5px 0;border-radius:999px;${p.level > i ? 'background:var(--sel);color:var(--sel-ink)' : 'background:var(--chip);color:var(--muted)'}` }, l))),
        p.level < 3 ? h('span', { class: 'muted', style: 'font-size:12px' }, `Para dominarlo: ${how.join(' + ')}.`) : '');
    })));

  // Totals
  const mazo = await db.count('mazo');
  const n = (t) => events(t).length;
  main.append(h('section', { class: 'card', style: 'gap:4px' },
    h('h2', {}, 'En números'),
    ...[['Tarjetas en el Mazo', mazo], ['Tomas en Sombra', events('sombra').filter((e) => e.recorded).length], ['Respuestas en Oído', n('oido')], ['Ejercicios de vos', n('vos')],
      ['Trabalenguas grabados', n('traba')], ['Palabras consultadas', n('lookup')], ['Calentamientos', n('warmup')]]
      .map(([label, v]) => h('div', { class: 'between small', style: 'padding:4px 0' }, h('span', {}, label), h('b', {}, String(v))))));
}
