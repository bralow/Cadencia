import { h, toast } from '../ui.js';
import { readTabs } from './leer.js';
import { RECETAS, VERBOS } from '../recetas.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { speak, stopSpeaking } from '../tts.js';

const KEY = 'cadencia.recetario';
const prefs = () => { try { return { units: 'metric', dual: false, favs: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { units: 'metric', dual: false, favs: [] }; } };
const setPref = (patch) => { const p = { ...prefs(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } return p; };
let openId = null, onlyFavs = false;

const nice = (x) => {
  const fr = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [0.33, '⅓'], [0.67, '⅔']];
  const whole = Math.floor(x), rest = x - whole;
  const f = fr.find(([v]) => Math.abs(v - rest) < 0.06);
  if (f) return `${whole || ''}${f[1]}`;
  return (Math.round(x * 10) / 10).toString().replace('.', ',');
};
const UNIT_ES = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', u: '', cda: 'cda.', cdita: 'cdita.', diente: 'diente(s) de', feta: 'feta(s) de', atado: 'atado de' };

function amount([q, unit], units) {
  if (q === null) return 'a gusto';
  if (units === 'metric') return `${nice(q)} ${UNIT_ES[unit]}`.trim();
  switch (unit) {
    case 'g': return q >= 450 ? `${nice(q / 453.6)} lb` : `${nice(q / 28.35)} oz`;
    case 'kg': return `${nice(q * 2.205)} lb`;
    case 'ml': return q >= 60 ? `${nice(q / 240)} cup${q / 240 > 1.05 ? 's' : ''}` : `${nice(q / 15)} tbsp`;
    case 'l': return `${nice(q * 4.23)} cups`;
    case 'cda': return `${nice(q)} tbsp`;
    case 'cdita': return `${nice(q)} tsp`;
    case 'diente': return `${nice(q)} clove(s)`;
    case 'feta': return `${nice(q)} slice(s)`;
    case 'atado': return '1 bunch';
    default: return nice(q);
  }
}
const temps = (text, units) => text.replace(/\[\[(\d+)C\]\]/g, (_, c) => (units === 'metric' ? `${c} °C` : `${Math.round(((c * 9) / 5 + 32) / 25) * 25} °F`));

function stepWithVerbs(text, onVerb) {
  const p = h('p', { style: 'font-size:16px;line-height:1.55', lang: 'es-AR' });
  for (const part of text.split(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/)) {
    if (!part) continue;
    const v = VERBOS[part.toLowerCase()];
    if (v) {
      const b = h('button', { type: 'button', class: 'word', style: 'all:unset;cursor:pointer;color:var(--accent);font-weight:700;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:4px' }, part);
      b.onclick = () => onVerb(part.toLowerCase(), text);
      p.append(b);
    } else p.append(part);
  }
  return p;
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, readTabs('recetas')));
  const r = RECETAS.find((x) => x.id === openId);
  if (r) return detail(main, r);
  return list(main);
}

function list(main) {
  const p = prefs();
  const surprise = h('button', { type: 'button', class: 'btn' }, 'Sorpresa culinaria');
  surprise.onclick = () => { const pool = RECETAS.filter((x) => x.id !== openId); openId = pool[Math.floor(Math.random() * pool.length)].id; window.dispatchEvent(new Event('cadencia:rerender')); };
  const favBtn = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(onlyFavs) }, `★ Favoritas (${p.favs.length})`);
  favBtn.onclick = () => { onlyFavs = !onlyFavs; window.dispatchEvent(new Event('cadencia:rerender')); };
  main.append(h('section', { class: 'hero', style: 'gap:8px' },
    h('span', { class: 'kicker' }, 'RECETARIO'), h('h2', { style: 'font-size:24px' }, 'Cociná en voseo'),
    h('p', { style: 'font-size:14px;line-height:1.45' }, 'Clásicos argentinos con los pasos en imperativo de vos: picá, agregá, horneá. Tocá cada verbo para aprenderlo.'),
    h('div', { class: 'row', style: 'margin-top:4px' }, surprise)));
  main.append(h('div', { class: 'row' }, favBtn));
  const shown = RECETAS.filter((x) => !onlyFavs || p.favs.includes(x.id));
  if (!shown.length) main.append(h('p', { class: 'muted small' }, 'Todavía no marcaste favoritas. Tocá ★ en una receta.'));
  for (const x of shown) {
    const b = h('button', { type: 'button', class: 'card', style: 'text-align:left;cursor:pointer;font:inherit;color:inherit;gap:4px' },
      h('div', { class: 'between' }, h('span', { style: 'font-family:var(--display);font-size:20px;font-weight:600' }, x.name), p.favs.includes(x.id) ? h('span', { style: 'color:var(--accent)', 'aria-label': 'favorita' }, '★') : ''),
      h('span', { class: 'muted small' }, `${x.when} · ${x.time} · ${x.serves}`));
    b.onclick = () => { openId = x.id; window.dispatchEvent(new Event('cadencia:rerender')); };
    main.append(b);
  }
}

function detail(main, r) {
  let p = prefs();
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Recetas');
  back.onclick = () => { openId = null; window.dispatchEvent(new Event('cadencia:rerender')); };
  const fav = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(p.favs.includes(r.id)), 'aria-label': 'Favorita', style: 'min-height:40px;font-size:18px' }, '★');
  fav.onclick = () => {
    const favs = new Set(prefs().favs);
    if (favs.has(r.id)) favs.delete(r.id); else favs.add(r.id);
    p = setPref({ favs: [...favs] }); fav.setAttribute('aria-pressed', String(favs.has(r.id)));
    toast(favs.has(r.id) ? 'Guardada en favoritas' : 'Sacada de favoritas');
  };
  main.append(h('div', { class: 'between' }, back, fav));

  const unitsBtns = [['metric', 'Métrico'], ['us', 'EE.UU.']].map(([k, label]) => h('button', { type: 'button', class: 'pill', style: 'min-height:38px;border:none', 'aria-pressed': String(p.units === k) }, label));
  const dualBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px', 'aria-pressed': String(p.dual) }, 'Inglés');
  const ingList = h('ul', { style: 'margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px' });
  const stepsEl = h('ol', { style: 'margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px' });
  const panel = h('section', { class: 'hero', hidden: true, 'aria-live': 'polite', style: 'padding:16px 18px;gap:8px' });

  main.append(h('section', { class: 'card', style: 'gap:8px' },
    h('h1', { style: 'font-size:28px' }, r.name),
    h('span', { class: 'muted small' }, `${r.en} · ${r.when} · ${r.time} · ${r.serves}`),
    h('p', { style: 'font-size:15px;line-height:1.45;font-style:italic', lang: 'es-AR' }, r.intro)));
  main.append(h('div', { class: 'between' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Unidades' }, unitsBtns), dualBtn));
  main.append(h('section', { class: 'card' }, h('h2', {}, 'Ingredientes'), ingList));
  main.append(h('section', { class: 'card', style: 'gap:12px' }, h('h2', {}, 'Preparación'), h('p', { class: 'muted small' }, 'Tocá los verbos subrayados.'), stepsEl), panel);

  function onVerb(word, stepText) {
    const [inf, en, tu] = VERBOS[word];
    const listen = h('button', { type: 'button', class: 'pill', style: 'background:transparent;color:var(--hero-ink);border-color:var(--hero-muted);min-height:40px' }, '▶ Escuchar');
    listen.onclick = () => speak(word);
    const save = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Guardar en Mazo');
    save.onclick = async () => { await db.put('mazo', { front: word, ipa: transcribe(word), back: `${inf} · to ${en} · tú: ${tu} · ${temps(stepText, 'metric')}`, tag: '#Cocina', created: Date.now() }); toast('Guardado en el Mazo'); };
    panel.replaceChildren(
      h('div', { class: 'row wrap', style: 'gap:12px;align-items:baseline' },
        h('span', { style: 'font-family:var(--display);font-size:28px;font-weight:700' }, word),
        h('span', { class: 'ipa', style: 'color:var(--gold-text)' }, transcribe(word))),
      h('p', { style: 'font-size:15px' }, h('b', {}, inf), ` · to ${en}`),
      h('p', { style: 'font-size:14px;color:var(--hero-muted)' }, `Imperativo de vos (tú: ${tu}). Se forma con el infinitivo sin la r, con tilde: ${inf} → ${word}.`),
      h('div', { class: 'row wrap' }, listen, save));
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function draw() {
    ingList.replaceChildren(...r.ing.map((i) => h('li', { class: 'between', style: 'border-bottom:1px solid var(--line);padding:6px 0;flex-wrap:nowrap' },
      h('span', { style: 'display:flex;flex-direction:column' }, h('span', { lang: 'es-AR' }, i[2]), p.dual ? h('span', { class: 'muted small' }, i[3]) : ''),
      h('b', { style: 'white-space:nowrap' }, amount(i, p.units)))));
    stepsEl.replaceChildren(...r.steps.map(([es, en], n) => h('li', { style: 'display:flex;gap:12px' },
      h('span', { style: 'flex:none;width:28px;height:28px;border-radius:999px;background:var(--sel);color:var(--sel-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px' }, String(n + 1)),
      h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, stepWithVerbs(temps(es, p.units), onVerb),
        p.dual ? h('p', { class: 'muted small', lang: 'en', style: 'line-height:1.4' }, temps(en, p.units)) : ''))));
  }
  unitsBtns.forEach((b, i) => { b.onclick = () => { p = setPref({ units: i ? 'us' : 'metric' }); unitsBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  dualBtn.onclick = () => { p = setPref({ dual: !p.dual }); dualBtn.setAttribute('aria-pressed', String(p.dual)); draw(); };
  draw();
  return () => stopSpeaking();
}
