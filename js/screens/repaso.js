// Repaso: today's review, decks, the vault, settings and creating cards by hand.
import { h, toast } from '../ui.js';
import { db } from '../db.js';
import { buildQueue, decks, deckStats, settings, saveSettings, TYPES, updateCard } from '../penumbra.js';
import { human } from '../fsrs.js';
import { duplicateGroups, merge } from '../cardtools.js';
import { ACTIONS, keys, setKey, resetKeys, comboOf, label } from '../hotkeys.js';

let openDeck = null;
const field = 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px;width:100%';
const rerender = () => window.dispatchEvent(new Event('cadencia:rerender'));

export async function render(main) {
  const [q, ds, stats] = await Promise.all([buildQueue(), decks(), deckStats()]);
  if (openDeck) { const d = ds.find((x) => x.id === openDeck); if (d) return deckView(main, d); openDeck = null; }
  const total = q.reviews.length + q.fresh.length;
  const mins = Math.max(1, Math.round((total + q.counts.learning) * 8 / 60));

  main.append(h('div', { class: 'between' }, h('h1', {}, 'Penumbra'), newCardButton()));
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
    const s = stats.get(d.id) || { total: 0, notes: 0, due: 0, fresh: 0, leech: 0 };
    const b = h('button', { type: 'button', class: 'card', style: 'flex-direction:row;align-items:center;gap:12px;text-align:left;cursor:pointer;font:inherit;color:inherit;padding:12px 14px' },
      h('span', { style: `width:8px;height:34px;border-radius:4px;background:${d.color}` }),
      h('span', { style: 'flex:1;display:flex;flex-direction:column;gap:2px' }, h('b', {}, d.name), h('span', { class: 'muted small' }, `${s.notes} ${s.notes === 1 ? 'guardada' : 'guardadas'}${s.leech ? ` · ${s.leech} en la bóveda` : ''}`)),
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
        const edit = h('a', { href: `#/tarjeta?note=${encodeURIComponent(c.note)}`, class: 'pill', style: 'min-height:34px;font-size:12px;display:inline-flex;align-items:center;text-decoration:none' }, 'Mejorar');
        return h('div', { class: 'between', style: 'gap:8px' }, h('span', {}, c.front, h('span', { class: 'muted small' }, ` · ${TYPES[c.type]}`)), h('span', { class: 'row', style: 'gap:6px' }, edit, back));
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
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' }, newSel, timerSel, hotkeyPanel(),
      h('p', { class: 'muted small', style: 'line-height:1.4' }, `Una tarjeta pasa a la bóveda después de ${st.leech} fallas y se retira como dominada después de ${st.mastery} aciertos seguidos. El máximo entre repasos es de 6 meses.`))));
  main.append(h('a', { href: '#/mazo', class: 'muted small', style: 'text-align:center;padding:10px' }, 'Mazo antiguo y exportar a Anki →'));
  return () => {};
}

function newCardButton(deckId) {
  return h('a', { href: `#/tarjeta?new=1${deckId ? `&deck=${encodeURIComponent(deckId)}` : ''}`, class: 'pill', style: 'min-height:42px;display:inline-flex;align-items:center;text-decoration:none' }, '+ Nueva tarjeta');
}

// Keyboard shortcuts (FE-04): tap an action, then press the key you want for it.
function hotkeyPanel() {
  const box = h('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-top:6px' });
  const paint = () => {
    const k = keys();
    let group = '';
    box.replaceChildren();
    for (const [a, d] of Object.entries(ACTIONS)) {
      if (d.group !== group) { group = d.group; box.append(h('span', { class: 'kicker', style: 'margin-top:8px' }, group.toUpperCase())); }
      const b = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;min-width:84px;font-size:12px;font-family:ui-monospace,monospace' }, label(k[a]));
      b.onclick = () => {
        b.textContent = 'Presioná…';
        const grab = (e) => {
          const c = comboOf(e); if (!c) return;
          e.preventDefault(); e.stopPropagation(); document.removeEventListener('keydown', grab, true);
          const clash = Object.entries(keys()).find(([x, v]) => x !== a && v === c && ACTIONS[x].group === d.group);
          if (clash) toast(`«${label(c)}» ya es «${ACTIONS[clash[0]].label}»: lo cambié de lugar`), setKey(clash[0], k[a]);
          setKey(a, c); paint();
        };
        document.addEventListener('keydown', grab, true);
      };
      box.append(h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' }, h('span', { class: 'small' }, d.label), b));
    }
    const reset = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px;align-self:flex-start;margin-top:8px' }, 'Volver a los atajos de fábrica');
    reset.onclick = () => { resetKeys(); paint(); };
    box.append(reset);
  };
  paint();
  return h('details', { style: 'margin-top:4px' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Atajos de teclado (en la PC)'), box);
}

async function deckView(main, d) {
  const cards = (await db.all('cards')).filter((c) => c.deck === d.id).sort((a, b) => b.created - a.created);
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Mazos');
  back.onclick = () => { openDeck = null; rerender(); };
  // One row per saved word or sentence; its practice cards (read, listen, type…) are listed inside it.
  const notes = new Map();
  for (const c of cards) { if (!notes.has(c.note)) notes.set(c.note, []); notes.get(c.note).push(c); }
  main.append(h('div', { class: 'between' }, back, newCardButton(d.id)), h('h1', {}, d.name),
    h('span', { class: 'muted small' }, `${notes.size} ${notes.size === 1 ? 'frase o palabra' : 'frases y palabras'} · tocá una para editarla`));

  // Search and duplicates
  const search = h('input', { type: 'search', placeholder: 'Buscar en este mazo…', 'aria-label': 'Buscar en este mazo', style: field });
  const dupBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Buscar duplicados');
  const dupBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  dupBtn.onclick = async () => {
    const groups = await duplicateGroups(d.id);
    if (!groups.length) { dupBox.replaceChildren(h('p', { class: 'small', style: 'color:var(--accent);font-weight:700' }, '✓ No hay duplicados en este mazo.')); return; }
    const all = h('button', { type: 'button', class: 'btn', style: 'min-height:42px' }, `Unir los ${groups.length} grupos`);
    all.onclick = async () => { for (const g of groups) await merge(g); toast('Duplicados unidos'); rerender(); };
    dupBox.replaceChildren(h('p', { class: 'small' }, 'Al unir, queda la que más practicaste; lo que le falte (significado, foto, audio) se toma de las otras.'),
      ...groups.map((g) => {
        const m = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, 'Unir');
        m.onclick = async () => { await merge(g); toast('Unidas'); rerender(); };
        return h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap;background:var(--soft);border-radius:12px;padding:8px 10px' }, h('span', { class: 'small', style: 'flex:1;min-width:0' }, g.map((n) => `«${n.front}»`).join(' · ')), m);
      }), all);
  };
  main.append(h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, search, dupBtn), dupBox);

  const now = Date.now();
  const status = (c) => c.suspended === 'leech' ? 'en la bóveda' : c.suspended === 'mastered' ? 'dominada' : c.state === 'new' ? 'nueva' : c.due <= now ? 'para hoy' : `en ${human(c.due - now)}`;
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  const rows = [...notes].map(([note, sibs]) => {
    sibs.sort((a, b) => a.created - b.created);
    const c = sibs[0];
    const row = h('a', { href: `#/tarjeta?note=${encodeURIComponent(note)}`, class: 'card', style: 'gap:4px;padding:10px 12px;text-decoration:none;color:inherit' },
      h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' }, h('b', { style: 'flex:1;min-width:0' }, c.front),
        h('span', { class: 'muted small', style: 'white-space:nowrap' }, `${c.image ? '🖼 ' : ''}${c.audio || c.source ? '🔊 ' : ''}✎`)),
      c.meaning ? h('span', { class: 'small' }, c.meaning) : '',
      h('span', { class: 'muted small' }, sibs.map((x) => `${TYPES[x.type]}: ${status(x)}`).join(' · ')));
    row.dataset.q = `${c.front} ${c.meaning || ''} ${c.context || ''}`.toLowerCase();
    return row;
  });
  const draw = () => { const t = search.value.trim().toLowerCase(); list.replaceChildren(...rows.filter((r) => !t || r.dataset.q.includes(t)).slice(0, 300)); };
  search.oninput = draw;
  draw();
  main.append(list);
  return () => {};
}
