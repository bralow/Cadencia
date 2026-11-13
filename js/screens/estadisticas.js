// Estadísticas: card counts, reviews per day, what's coming, pass rate, recall speed per deck.
import { h } from '../ui.js';
import { stats } from '../practica.js';
import { TYPES } from '../penumbra.js';

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dayLabel = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${DAYS[d.getDay()]} ${d.getDate()}`; };

// One-series column chart. Thin bars with rounded tops on a quiet baseline; tap or hover a column for its value.
function columns(values, tipFor, { tickEvery = 7, labelFor } = {}) {
  const n = values.length, W = 340, H = 140, pad = 18, gap = 2;
  const bw = (W - gap * (n - 1)) / n, top = Math.max(1, ...values);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + pad}`);
  svg.setAttribute('role', 'img');
  svg.style.cssText = 'width:100%;height:auto;display:block;overflow:visible;stroke:none';
  const tip = h('div', { 'aria-live': 'polite', class: 'small', style: 'min-height:20px;font-weight:600;font-variant-numeric:tabular-nums' }, ' ');
  let html = `<line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)" stroke-width="1"/>`;
  values.forEach((v, i) => {
    const x = i * (bw + gap), bh = v ? Math.max(3, (v / top) * (H - 8)) : 0, r = Math.min(4, bw / 2);
    if (bh) html += `<path d="M${x},${H} v${-(bh - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${bh - r} z" fill="var(--accent)"/>`;
    html += `<rect data-i="${i}" x="${x - gap / 2}" y="0" width="${bw + gap}" height="${H + pad}" fill="transparent" style="cursor:pointer"/>`;
    if (labelFor && i % tickEvery === 0) html += `<text x="${x + bw / 2}" y="${H + 13}" text-anchor="middle" font-size="9" fill="var(--muted)">${labelFor(i)}</text>`;
  });
  html += `<text x="${W}" y="8" text-anchor="end" font-size="9" fill="var(--muted)">máx ${top}</text>`;
  svg.innerHTML = html;
  const show = (e) => { const i = e.target.dataset && e.target.dataset.i; if (i !== undefined) tip.textContent = tipFor(Number(i)); };
  svg.addEventListener('pointerover', show); svg.addEventListener('pointerdown', show);
  return h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, tip, svg);
}

const tile = (big, small) => h('div', { class: 'card', style: 'padding:12px 14px;gap:2px;flex:1;min-width:130px' },
  h('span', { style: 'font-family:var(--display);font-size:28px;font-weight:700;line-height:1.1' }, big), h('span', { class: 'muted small' }, small));

export async function render(main) {
  const s = await stats();
  const back = h('a', { href: '#/repaso', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, '← Repaso');
  main.append(h('div', { class: 'between' }, back), h('h1', {}, 'Estadísticas'));
  if (!s.totalReviews && !s.count.total) { main.append(h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Todavía no hay datos. Hacé tu primer repaso y volvé acá.'))); return () => {}; }

  main.append(h('div', { class: 'row wrap', style: 'gap:10px;align-items:stretch' },
    tile(`${s.streak}`, s.streak === 1 ? 'día seguido' : 'días seguidos'),
    tile(s.week ? `${s.week.pct}%` : '—', `bien en 7 días${s.week ? ` (${s.week.n})` : ''}`),
    tile(s.month ? `${s.month.pct}%` : '—', `bien en 30 días${s.month ? ` (${s.month.n})` : ''}`),
    tile(`${s.totalReviews}`, 'repasos en total')));
  main.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'El porcentaje cuenta solo repasos de tarjetas ya aprendidas. Penumbra apunta a que recuerdes el 90%: si estás muy por debajo, conviene bajar las nuevas por día; muy por encima, podés subirlas.'));

  // Cards by stage
  const c = s.count;
  const stage = (n, l, help) => h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap;padding:4px 0' }, h('span', {}, h('b', {}, l), h('span', { class: 'muted small' }, ` · ${help}`)), h('b', { style: 'font-variant-numeric:tabular-nums' }, String(n)));
  main.append(h('section', { class: 'card', style: 'gap:2px' }, h('span', { class: 'kicker' }, `TARJETAS · ${c.total}`),
    stage(c.fresh, 'Nuevas', 'sin ver'), stage(c.learning, 'Aprendiendo', 'pasos de hoy'), stage(c.young, 'Jóvenes', 'menos de 3 semanas firmes'),
    stage(c.mature, 'Maduras', '3 semanas o más'), stage(c.vault, 'En la bóveda', 'fallidas muchas veces'), stage(c.mastered, 'Dominadas', 'retiradas')));

  // Reviews per day
  const per = s.perDay;
  main.append(h('section', { class: 'card', style: 'gap:6px' }, h('span', { class: 'kicker' }, 'REPASOS POR DÍA · ÚLTIMOS 30'),
    columns(per.map((d) => d.n), (i) => `${dayLabel(i - 29)}: ${per[i].n} repaso${per[i].n === 1 ? '' : 's'}${per[i].n ? ` · ${Math.round((per[i].pass / per[i].n) * 100)}% bien` : ''}`, { labelFor: (i) => dayLabel(i - 29) })));

  // Forecast
  const f = s.forecast;
  main.append(h('section', { class: 'card', style: 'gap:6px' }, h('span', { class: 'kicker' }, 'LO QUE VIENE · PRÓXIMOS 14 DÍAS'),
    columns(f, (i) => `${i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dayLabel(i)}: ${f[i]} tarjeta${f[i] === 1 ? '' : 's'}`, { labelFor: (i) => (i === 0 ? 'hoy' : dayLabel(i)) })));

  // Recall speed per deck
  if (s.speed.length) {
    const top = Math.max(...s.speed.map((x) => x.sec));
    main.append(h('section', { class: 'card', style: 'gap:8px' }, h('span', { class: 'kicker' }, 'VELOCIDAD DE RECUERDO · POR MAZO'),
      h('p', { class: 'muted small' }, 'Segundos que tardás, en promedio (mediana), en las tarjetas que acertaste en los últimos 30 días. Bajar es buena señal: la palabra sale sola.'),
      ...s.speed.map((x) => h('div', { style: 'display:flex;flex-direction:column;gap:3px' },
        h('div', { class: 'between', style: 'flex-wrap:nowrap' }, h('span', { class: 'small' }, x.deck), h('b', { class: 'small', style: 'font-variant-numeric:tabular-nums' }, `${x.sec.toFixed(1)} s · ${x.n}`)),
        h('div', { style: 'height:8px;border-radius:4px;background:var(--chip)' }, h('div', { style: `height:8px;border-radius:4px;background:var(--accent);width:${Math.max(4, (x.sec / top) * 100)}%` }))))));
  }

  // By card type
  const types = Object.entries(s.byType).filter(([, v]) => v.n);
  if (types.length) {
    main.append(h('section', { class: 'card', style: 'gap:2px' }, h('span', { class: 'kicker' }, 'ACIERTO POR TIPO · 30 DÍAS'),
      ...types.map(([t, v]) => h('div', { class: 'between', style: 'flex-wrap:nowrap;padding:4px 0' }, h('span', {}, TYPES[t] || t), h('span', { style: 'font-variant-numeric:tabular-nums' }, h('b', {}, `${Math.round((v.pass / v.n) * 100)}%`), h('span', { class: 'muted small' }, ` · ${v.n}`))))));
  }
  return () => {};
}
