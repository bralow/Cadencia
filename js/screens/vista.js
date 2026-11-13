// Deck preview (FE-02): browse a deck as flip cards or a gallery. Nothing counts as a review.
import { h } from '../ui.js';
import { db } from '../db.js';
import { phoneSay, stopPhone } from '../voz.js';

let mode = 'flip';

async function play(c) {
  stopPhone();
  if (c.audio instanceof Blob) { new Audio(URL.createObjectURL(c.audio)).play().catch(() => {}); return; }
  if (c.source && c.source.kind === 'podcast') {
    const r = await db.get('epaudio', c.source.id);
    if (r) { const a = new Audio(URL.createObjectURL(r.blob)); await new Promise((ok) => { a.onloadedmetadata = ok; setTimeout(ok, 1500); }); a.currentTime = c.source.s; a.play().catch(() => {}); setTimeout(() => a.pause(), (c.source.e - c.source.s) * 1000 + 200); return; }
  }
  phoneSay(c.front);
}

export async function render(main) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const deckId = q.get('deck');
  const deck = await db.get('decks', deckId);
  const seen = new Set(), notes = [];
  for (const c of (await db.all('cards')).filter((x) => x.deck === deckId).sort((a, b) => a.created - b.created)) { if (!seen.has(c.note)) { seen.add(c.note); notes.push(c); } }

  const back = h('a', { href: '#/repaso', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, '← Repaso');
  const segBtns = [['flip', 'Tarjetas'], ['grid', 'Galería']].map(([k, l]) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;border:none', 'aria-pressed': String(mode === k) }, l); b.onclick = () => { mode = k; segBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(['flip', 'grid'][i] === k))); draw(); }; return b; });
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  main.append(h('div', { class: 'between' }, back, h('div', { class: 'seg' }, segBtns)),
    h('h1', {}, deck ? deck.name : 'Mazo'), h('span', { class: 'muted small' }, `${notes.length} · vista previa, no cuenta como repaso`), body);
  if (!notes.length) { body.append(h('p', { class: 'muted' }, 'Este mazo está vacío.')); return () => {}; }

  let i = 0, flipped = false, onKey = null;
  const backSide = (c) => [
    c.image instanceof Blob ? h('img', { src: URL.createObjectURL(c.image), alt: '', style: 'max-width:100%;max-height:26vh;border-radius:12px;object-fit:contain' }) : '',
    h('span', { style: 'font-family:var(--display);font-size:26px;font-weight:700' }, c.front),
    c.ipa ? h('span', { class: 'ipa', style: 'color:var(--gold-text)' }, c.ipa) : '',
    c.meaning ? h('span', { style: 'font-size:19px;font-weight:600' }, c.meaning) : '',
    c.hint ? h('span', { class: 'muted small' }, c.hint) : '',
    c.context ? h('p', { style: 'font-size:15px;line-height:1.5;background:var(--chip);border-radius:12px;padding:10px 12px;text-align:left' }, c.context) : '',
  ];
  function drawFlip() {
    const c = notes[i];
    const face = h('button', { type: 'button', 'aria-label': flipped ? 'Ver el frente' : 'Dar vuelta', class: 'card', style: 'min-height:48vh;align-items:center;justify-content:center;text-align:center;gap:12px;cursor:pointer;font:inherit;color:inherit;padding:22px' },
      ...(flipped ? backSide(c) : [
        c.image instanceof Blob ? h('img', { src: URL.createObjectURL(c.image), alt: '', style: 'max-width:100%;max-height:26vh;border-radius:12px;object-fit:contain' }) : '',
        h('span', { style: `font-family:var(--display);font-size:${c.front.length > 30 ? 24 : 38}px;font-weight:700;line-height:1.25` }, c.front),
        h('span', { class: 'muted small' }, 'tocá para dar vuelta')]));
    face.onclick = () => { flipped = !flipped; drawFlip(); };
    let x0 = null;
    face.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    face.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) { e.preventDefault(); go(dx < 0 ? 1 : -1); } });
    const prev = h('button', { type: 'button', class: 'pill', 'aria-label': 'Anterior' }, '←');
    const next = h('button', { type: 'button', class: 'pill', 'aria-label': 'Siguiente' }, '→');
    const listen = h('button', { type: 'button', class: 'pill' }, '▶ Escuchar');
    const edit = h('a', { href: `#/tarjeta?note=${encodeURIComponent(c.note)}`, class: 'pill', style: 'display:inline-flex;align-items:center;text-decoration:none' }, '✎ Editar');
    prev.onclick = () => go(-1); next.onclick = () => go(1); listen.onclick = () => play(c);
    body.replaceChildren(face, h('div', { class: 'between', style: 'flex-wrap:nowrap' }, prev, h('span', { class: 'small', style: 'font-variant-numeric:tabular-nums' }, `${i + 1} / ${notes.length}`), next),
      h('div', { class: 'row', style: 'gap:8px;justify-content:center' }, listen, edit));
  }
  function go(d) { i = (i + d + notes.length) % notes.length; flipped = false; drawFlip(); }
  function drawGrid() {
    body.replaceChildren(h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px' },
      ...notes.map((c, k) => {
        const t = h('button', { type: 'button', class: 'card', style: 'padding:10px;gap:6px;text-align:left;cursor:pointer;font:inherit;color:inherit;min-height:110px' },
          c.image instanceof Blob ? h('img', { src: URL.createObjectURL(c.image), alt: '', style: 'width:100%;height:80px;object-fit:cover;border-radius:10px' }) : '',
          h('b', { style: 'font-size:15px;line-height:1.25' }, c.front),
          c.meaning ? h('span', { class: 'muted small' }, c.meaning) : '');
        t.onclick = () => { i = k; flipped = true; mode = 'flip'; segBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === 0))); draw(); };
        return t;
      })));
  }
  function draw() { if (mode === 'flip') drawFlip(); else drawGrid(); }
  onKey = (e) => { if (mode !== 'flip') return; if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); flipped = !flipped; drawFlip(); } };
  document.addEventListener('keydown', onKey);
  draw();
  return () => { document.removeEventListener('keydown', onKey); stopPhone(); };
}
