// Repaso: today's review, decks, the vault, settings and creating cards by hand.
import { h, toast } from '../ui.js';
import { db } from '../db.js';
import { buildQueue, decks, deckStats, settings, saveSettings, addNote, fillMeaning, TYPES, deleteNote, updateCard } from '../penumbra.js';
import { human } from '../fsrs.js';

let openDeck = null;
const field = 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px;width:100%';
const rerender = () => window.dispatchEvent(new Event('cadencia:rerender'));

export async function render(main) {
  const [q, ds, stats] = await Promise.all([buildQueue(), decks(), deckStats()]);
  if (openDeck) { const d = ds.find((x) => x.id === openDeck); if (d) return deckView(main, d); openDeck = null; }
  const total = q.reviews.length + q.fresh.length;
  const mins = Math.max(1, Math.round((total + q.counts.learning) * 8 / 60));

  main.append(h('div', { class: 'between' }, h('h1', {}, 'Penumbra'), newCardButton(ds)));
  main.append(h('section', { class: 'hero', style: 'gap:10px' },
    h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'REPASO DE HOY'), total ? h('span', { class: 'small', style: 'opacity:.8' }, `≈ ${mins} min`) : ''),
    h('div', { style: 'display:flex;align-items:baseline;gap:10px' },
      h('span', { style: 'font-family:var(--display);font-size:52px;font-weight:700;line-height:1' }, String(total + q.counts.learning)),
      h('span', {}, 'tarjetas para hoy')),
    h('div', { class: 'small', style: 'opacity:.9' }, `${q.reviews.length} repaso · ${q.fresh.length} nuevas · ${q.overdue} vencidas${q.counts.learning ? ` · ${q.counts.learning} aprendiendo` : ''}`),
    h('a', { href: '#/sesion', class: 'btn', style: 'align-self:stretch;justify-content:center' }, total + q.counts.learning ? 'Empezar repaso' : 'Ver')));

  // Decks
  main.append(h('span', { class: 'kicker', style: 'margin-top:6px' }, 'MAZOS'));
  if (!ds.length) main.append(h('section', { class: 'card' }, h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Todavía no hay tarjetas. Tocá «+ Penumbra» o «Guardar» en cualquier módulo (Leer, Podcast, Charla, Lunfardo…) y aparecen acá, cada una en el mazo de donde vino.')));
  for (const d of ds) {
    const s = stats.get(d.id) || { total: 0, due: 0, fresh: 0, leech: 0 };
    const b = h('button', { type: 'button', class: 'card', style: 'flex-direction:row;align-items:center;gap:12px;text-align:left;cursor:pointer;font:inherit;color:inherit;padding:12px 14px' },
      h('span', { style: `width:8px;height:34px;border-radius:4px;background:${d.color}` }),
      h('span', { style: 'flex:1;display:flex;flex-direction:column;gap:2px' }, h('b', {}, d.name), h('span', { class: 'muted small' }, `${s.total} tarjetas${s.leech ? ` · ${s.leech} en la bóveda` : ''}`)),
      h('span', { style: 'display:flex;gap:10px;font-weight:700' }, h('span', { style: 'color:var(--accent)' }, String(s.due)), h('span', {}, String(s.fresh))));
    b.onclick = () => { openDeck = d.id; rerender(); };
    main.append(b);
  }

  // Vault
  const leeches = (await db.all('cards')).filter((c) => c.suspended === 'leech');
  if (leeches.length) {
    main.append(h('section', { class: 'card', style: 'gap:8px' },
      h('span', { class: 'kicker' }, `BÓVEDA · ${leeches.length}`),
      h('p', { class: 'muted small' }, 'Tarjetas que fallaste muchas veces. Revisalas, mejoralas y reintegralas cuando quieras.'),
      ...leeches.slice(0, 20).map((c) => {
        const back = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, 'Reintegrar');
        back.onclick = async () => { await updateCard({ ...c, suspended: null, state: 'new', reps: 0, lapses: 0, passStreak: 0, due: undefined }); toast('Vuelve como nueva'); rerender(); };
        return h('div', { class: 'between', style: 'gap:8px' }, h('span', {}, c.front, h('span', { class: 'muted small' }, ` · ${TYPES[c.type]}`)), back);
      })));
  }

  // Settings
  let st = settings();
  const newSel = h('select', { 'aria-label': 'Nuevas por día', style: field }, [5, 10, 15, 20, 30].map((n) => h('option', { value: n }, `${n} nuevas por día`)));
  newSel.value = String(st.newPerDay);
  const timerSel = h('select', { 'aria-label': 'Temporizador', style: field }, [[0, 'Sin temporizador'], [10, '10 segundos'], [20, '20 segundos'], [30, '30 segundos'], [45, '45 segundos']].map(([v, l]) => h('option', { value: v }, l)));
  timerSel.value = String(st.timer);
  newSel.onchange = () => { st = saveSettings({ newPerDay: Number(newSel.value) }); rerender(); };
  timerSel.onchange = () => { st = saveSettings({ timer: Number(timerSel.value) }); };
  main.append(h('details', { class: 'card', style: 'gap:10px' },
    h('summary', { style: 'font-weight:700;cursor:pointer' }, 'Ajustes de repaso'),
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' }, newSel, timerSel,
      h('p', { class: 'muted small', style: 'line-height:1.4' }, `Una tarjeta pasa a la bóveda después de ${st.leech} fallas y se retira como dominada después de ${st.mastery} aciertos seguidos. El máximo entre repasos es de 6 meses.`))));
  main.append(h('a', { href: '#/mazo', class: 'muted small', style: 'text-align:center;padding:10px' }, 'Mazo antiguo y exportar a Anki →'));
  return () => {};
}

function newCardButton(ds) {
  const b = h('button', { type: 'button', class: 'pill', style: 'min-height:42px' }, '+ Nueva tarjeta');
  b.onclick = () => {
    const dlg = h('section', { class: 'card', style: 'gap:10px' });
    const deckSel = h('select', { 'aria-label': 'Mazo', style: field }, [...ds.map((d) => h('option', { value: d.name }, d.name)), h('option', { value: '__new' }, 'Nuevo mazo…')]);
    if (!ds.length) deckSel.value = '__new';
    const newDeck = h('input', { type: 'text', placeholder: 'Nombre del mazo', 'aria-label': 'Nombre del mazo nuevo', style: field, hidden: !!ds.length });
    deckSel.onchange = () => { newDeck.hidden = deckSel.value !== '__new'; };
    const front = h('input', { type: 'text', placeholder: 'Frente: palabra o frase en español', 'aria-label': 'Frente', lang: 'es-AR', style: field });
    const meaning = h('input', { type: 'text', placeholder: 'Significado (opcional: si falta, lo completa Gemini)', 'aria-label': 'Significado', style: field });
    const ctx = h('input', { type: 'text', placeholder: 'Frase de ejemplo (opcional)', 'aria-label': 'Frase de ejemplo', lang: 'es-AR', style: field });
    const boxes = Object.entries(TYPES).filter(([k]) => k !== 'escuchar').map(([k, l]) => {
      const cb = h('input', { type: 'checkbox', value: k }); cb.checked = k === 'reconocer' || k === 'producir';
      return h('label', { class: 'pill', style: 'min-height:36px;gap:6px;display:inline-flex;align-items:center;font-size:13px' }, cb, l);
    });
    const save = h('button', { type: 'button', class: 'btn' }, 'Guardar tarjeta');
    save.onclick = async () => {
      const deckName = deckSel.value === '__new' ? newDeck.value.trim() : deckSel.value;
      if (!front.value.trim() || !deckName) { toast('Falta el frente o el mazo'); return; }
      const types = boxes.map((l) => l.querySelector('input')).filter((x) => x.checked).map((x) => x.value);
      if (types.includes('completar') && !ctx.value.toLowerCase().includes(front.value.trim().toLowerCase())) { toast('Para «Completar», la frase tiene que incluir la palabra'); return; }
      const cards = await addNote({ front: front.value, meaning: meaning.value.trim(), back: ctx.value.trim(), deck: deckName, types: types.length ? types : ['reconocer'] });
      if (!cards.length) { toast('Ya existe en ese mazo'); return; }
      if (!meaning.value.trim()) fillMeaning(cards).catch(() => {});
      toast(`${cards.length} tarjeta${cards.length > 1 ? 's' : ''} nueva${cards.length > 1 ? 's' : ''}`);
      rerender();
    };
    dlg.append(h('span', { class: 'kicker' }, 'NUEVA TARJETA'), deckSel, newDeck, front, meaning, ctx, h('div', { class: 'row wrap', style: 'gap:6px' }, boxes), save);
    b.closest('div').after(dlg);
    b.disabled = true;
    front.focus();
  };
  return b;
}

async function deckView(main, d) {
  const cards = (await db.all('cards')).filter((c) => c.deck === d.id).sort((a, b) => b.created - a.created);
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Mazos');
  back.onclick = () => { openDeck = null; rerender(); };
  main.append(h('div', { class: 'between' }, back, h('span', { class: 'muted small' }, `${cards.length} tarjetas`)), h('h1', {}, d.name));
  const now = Date.now();
  const status = (c) => c.suspended === 'leech' ? 'en la bóveda' : c.suspended === 'mastered' ? 'dominada' : c.state === 'new' ? 'nueva' : c.due <= now ? 'para hoy' : `en ${human(c.due - now)}`;
  for (const c of cards.slice(0, 300)) {
    const del = h('button', { type: 'button', class: 'pill', style: 'min-height:32px;font-size:11px' }, 'Borrar');
    del.onclick = async () => { if (window.confirm(`¿Borrar «${c.front}» (todas sus tarjetas)?`)) { await deleteNote(c.note); rerender(); } };
    main.append(h('div', { class: 'card', style: 'gap:4px;padding:10px 12px' },
      h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' }, h('b', { style: 'flex:1;min-width:0' }, c.front), del),
      h('span', { class: 'muted small' }, `${TYPES[c.type]} · ${status(c)}${c.meaning ? ` · ${c.meaning}` : ''}`)));
  }
  return () => {};
}
