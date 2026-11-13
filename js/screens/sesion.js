// A Penumbra review session: one card at a time, Pass / Fail, full screen.
import { h, toast, shuffle } from '../ui.js';
import { db } from '../db.js';
import { buildQueue, nextCard, answerCard, settings, decks, checkTyped } from '../penumbra.js';
import { preview, human } from '../fsrs.js';
import { phoneSay, stopPhone } from '../voz.js';
import { Recorder, decode, peaks } from '../audio.js';
import { log } from '../progress.js';
import { actionFor } from '../hotkeys.js';
import { overlay } from '../imgedit.js';
import { practiceSet, SETS } from '../practica.js';
import { updateCard } from '../penumbra.js';

const clean = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Plays a card's sound: its own recording, the exact podcast moment, or the read-aloud voice.
let player = null, stopTimer = 0;
function stopAudio() { if (player) { player.pause(); player = null; } clearTimeout(stopTimer); stopPhone(); }
async function playCard(card, rate = 1) {
  stopAudio();
  const src = card.source;
  if (card.audio instanceof Blob) {
    player = new Audio(URL.createObjectURL(card.audio)); player.playbackRate = rate; player.preservesPitch = true;
    return player.play().catch(() => {});
  }
  if (src && (src.kind === 'podcast' || src.kind === 'song')) {
    const rec = await db.get(src.kind === 'song' ? 'songs' : 'epaudio', src.id);
    if (rec) {
      player = new Audio(URL.createObjectURL(rec.blob)); player.playbackRate = rate; player.preservesPitch = true;
      await new Promise((r) => { player.onloadedmetadata = r; setTimeout(r, 1500); });
      player.currentTime = Math.max(0, src.s - 0.15);
      player.play().catch(() => {});
      stopTimer = setTimeout(() => player && player.pause(), ((src.e - src.s) / rate + 0.4) * 1000);
      return;
    }
  }
  return phoneSay(card.front, { rate });
}
const hasRealAudio = (c) => c.audio instanceof Blob || (c.source && (c.source.kind === 'podcast' || c.source.kind === 'song'));

function drawWave(canvas, buf, color) {
  const ctx = canvas.getContext('2d'), w = canvas.width = canvas.clientWidth * 2, ht = canvas.height = 96;
  const p = peaks(buf, Math.floor(w / 2));
  ctx.clearRect(0, 0, w, ht); ctx.fillStyle = color;
  p.min.forEach((mn, i) => { const y1 = (1 - p.max[i]) * ht / 2, y2 = (1 - mn) * ht / 2; ctx.fillRect(i * 2, y1, 1.5, Math.max(1, y2 - y1)); });
}

export async function render(main) {
  document.body.classList.add('sesion');
  const st = settings();
  // Practice (quiz mode, the vault): #/sesion?modo=practica&set=debiles|olvidar|boveda|todo&deck=<id>&n=20
  // It uses the same screen but never touches due dates.
  const hq = new URLSearchParams(location.hash.split('?')[1] || '');
  const practice = hq.get('modo') === 'practica';
  const set = hq.get('set') || 'debiles';
  const q = practice
    ? { reviews: await practiceSet(set, Number(hq.get('n')) || 20, hq.get('deck') || null), fresh: [], learning: [], overdue: 0, counts: { learning: 0 } }
    : await buildQueue();
  const results = new Map(), requeued = new Set();
  const deckName = new Map((await decks()).map((d) => [d.id, d.name]));
  const total0 = q.reviews.length + q.fresh.length + q.learning.length;
  let done = 0, passed = 0, startedAt = Date.now(), timer = 0, keyHandler = null;

  const counts = h('div', { style: 'display:flex;gap:12px;font-size:13px;font-weight:600' });
  const ring = h('div', { style: 'width:44px;height:44px;position:relative' });
  const bar = h('div', { style: 'height:6px;border-radius:3px;background:var(--line);overflow:hidden' }, h('div', { style: 'height:6px;width:0;background:var(--accent);transition:width .3s' }));
  const close = h('a', { href: practice && set === 'boveda' ? '#/boveda' : '#/repaso', 'aria-label': 'Terminar el repaso', class: 'icon-btn', style: 'font-size:22px;text-decoration:none;color:var(--ink)' }, '×');
  const editBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Editar esta tarjeta', style: 'font-size:18px;background:none;border:none;color:var(--ink)' }, '✎');
  const stage = h('div', { style: 'display:flex;flex-direction:column;gap:14px;flex:1' });
  main.append(h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, h('div', { class: 'between', style: 'flex-wrap:nowrap' }, close, counts, h('div', { class: 'row', style: 'gap:4px' }, editBtn, ring)), bar), stage);
  let current = null, editing = false;

  // Editing the card on screen, without leaving the session: after saving, the card shows again with the changes.
  async function editCurrent() {
    if (!current || editing) return;
    editing = true; stopClock(); stopAudio();
    const { buildEditor } = await import('../editor.js');
    const { sheet, close: shut } = overlay();
    sheet.style.background = 'var(--bg)';
    let clean = null;
    clean = await buildEditor(sheet, { note: current.note, onDone: async (r) => {
      if (clean) clean(); shut(); editing = false;
      if (r === 'saved' || r === 'deleted') {
        const fresh = await db.get('cards', current.id);
        for (const k of ['reviews', 'fresh', 'learning']) {
          const arr = q[k]; const i = arr.findIndex((c) => c.id === current.id);
          if (i < 0) continue;
          if (fresh) arr[i] = fresh; else arr.splice(i, 1);
        }
      }
      show();
    } });
  }
  editBtn.onclick = editCurrent;

  const paintCounts = () => {
    if (practice) {
      counts.replaceChildren(h('span', { style: 'color:var(--accent)' }, `${q.reviews.length} `, h('span', { class: 'muted', style: 'font-weight:500' }, SETS[set] ? SETS[set].name.toLowerCase() : 'práctica')),
        h('span', { class: 'chip' }, 'no cambia fechas'));
      bar.firstChild.style.width = `${Math.min(100, (done / Math.max(1, done + q.reviews.length)) * 100)}%`;
      return;
    }
    const lrn = q.learning.length;
    counts.replaceChildren(
      h('span', { style: 'color:var(--accent)' }, `${q.reviews.length} `, h('span', { class: 'muted', style: 'font-weight:500' }, 'repaso')),
      h('span', {}, `${q.fresh.length} `, h('span', { class: 'muted', style: 'font-weight:500' }, 'nuevas')),
      lrn ? h('span', { style: 'color:var(--gold-text)' }, `${lrn} `, h('span', { class: 'muted', style: 'font-weight:500' }, 'aprendiendo')) : '');
    const left = q.reviews.length + q.fresh.length + q.learning.length;
    bar.firstChild.style.width = `${Math.min(100, (done / Math.max(1, done + left)) * 100)}%`;
  };

  // Countdown ring: at zero the answer is shown; you still choose Pass or Fail.
  let shownAt = 0, onTimeout = null;
  function startTimer(fn) {
    clearInterval(timer); shownAt = Date.now(); onTimeout = fn;
    if (!st.timer) { ring.replaceChildren(); return; }
    const total = st.timer * 1000, C = 113;
    const draw = () => {
      const left = Math.max(0, total - (Date.now() - shownAt));
      ring.innerHTML = `<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - left / total)}" transform="rotate(-90 22 22)"/></svg><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${Math.ceil(left / 1000)}</span>`;
      if (!left) { clearInterval(timer); if (onTimeout) onTimeout(); }
    };
    draw(); timer = setInterval(draw, 200);
  }
  const stopClock = () => { clearInterval(timer); onTimeout = null; ring.replaceChildren(); };

  function finish() {
    stopClock(); stopAudio();
    if (practice) return finishPractice();
    const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    log('repaso', { cards: done, passed });
    stage.replaceChildren(h('section', { class: 'card', style: 'gap:12px;align-items:center;text-align:center;padding:28px 20px' },
      h('span', { class: 'kicker' }, done ? 'LISTO POR HOY' : 'NADA PARA REPASAR'),
      h('h1', { style: 'font-size:30px' }, done ? `${done} tarjetas` : '¡Al día!'),
      done ? h('p', { class: 'muted' }, `${Math.round((passed / done) * 100)}% bien · ${mins} min`) : h('p', { class: 'muted' }, 'Guardá palabras y frases con «+ Penumbra» en cualquier módulo y van a aparecer acá.'),
      q.learning.length ? h('p', { class: 'small' }, `${q.learning.length} tarjeta${q.learning.length > 1 ? 's' : ''} en aprendizaje vuelve${q.learning.length > 1 ? 'n' : ''} más tarde hoy.`) : '',
      h('a', { href: '#/repaso', class: 'btn' }, 'Volver a Repaso'), syncAfter()));
    counts.replaceChildren(); bar.firstChild.style.width = '100%';
  }

  // After a session: sync quietly if the Google session is fresh; otherwise offer one tap.
  function syncAfter() {
    const slot = h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:6px' });
    import('../sync.js').then((m) => {
      if (!m.driveConnected() || !done) return;
      if (m.canSyncSilently()) { m.syncNow().then(() => slot.replaceChildren(h('span', { class: 'muted small' }, '☁ Sincronizado con Drive'))).catch(() => {}); return; }
      const b = h('button', { type: 'button', class: 'btn ghost' }, '☁ Sincronizar con Drive');
      b.onclick = async () => { b.disabled = true; b.textContent = 'Sincronizando…'; try { await m.syncNow({ interactive: true }); slot.replaceChildren(h('span', { class: 'muted small' }, '☁ Sincronizado')); } catch (e) { b.disabled = false; b.textContent = 'Reintentar sincronizar'; toast(String(e.message || e)); } };
      slot.append(b);
    });
    return slot;
  }

  function finishPractice() {
    log('practica', { set, cards: done, passed });
    const firstTry = [...results.values()];
    const good = firstTry.filter((r) => r.ok).length;
    const kids = [h('span', { class: 'kicker' }, done ? 'PRÁCTICA TERMINADA' : 'NADA PARA PRACTICAR'),
      h('h1', { style: 'font-size:30px' }, done ? `${good} de ${firstTry.length}` : 'Vacío'),
      h('p', { class: 'muted' }, done ? 'bien a la primera. Tus fechas de repaso no cambiaron.' : set === 'boveda' ? 'La bóveda está vacía.' : 'No hay tarjetas para este tipo de práctica todavía.')];
    // From the vault: the ones you got right can go back to the normal schedule.
    const back = firstTry.filter((r) => r.ok && r.card.suspended === 'leech');
    if (set === 'boveda' && back.length) {
      const all = h('button', { type: 'button', class: 'btn' }, `Reintegrar las ${back.length} que acertaste`);
      all.onclick = async () => { for (const r of back) await updateCard({ ...r.card, suspended: null, state: 'new', reps: 0, lapses: 0, passStreak: 0, due: undefined, s: undefined, d: undefined, last: undefined }); toast('Vuelven como nuevas'); all.disabled = true; all.textContent = 'Reintegradas'; };
      kids.push(all);
    }
    kids.push(h('a', { href: set === 'boveda' ? '#/boveda' : '#/repaso', class: done ? 'btn ghost' : 'btn' }, 'Volver'));
    stage.replaceChildren(h('section', { class: 'card', style: 'gap:12px;align-items:center;text-align:center;padding:28px 20px' }, ...kids));
    counts.replaceChildren(); bar.firstChild.style.width = '100%';
  }

  function show() {
    stopAudio(); paintCounts();
    const card = nextCard(q, done);
    if (!card) return finish();
    current = card;
    const face = h('section', { class: 'card', style: 'flex:1;gap:14px;padding:20px;min-height:52vh' });
    const actions = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    stage.replaceChildren(face, actions);
    const top = h('div', { class: 'between' },
      h('span', { class: 'chip' }, deckName.get(card.deck) || 'General'),
      h('span', { class: 'muted small' }, { reconocer: 'Reconocer', producir: 'Producir', escuchar: 'Escuchar', completar: 'Completar', pronunciar: 'Pronunciar' }[card.type] || ''));
    const listen = (label = '▶ Escuchar', rate = 1) => { const b = h('button', { type: 'button', class: 'pill' }, label); b.onclick = () => playCard(card, rate); return b; };
    let revealed = false, suggest = null;
    const picture = () => h('img', { src: URL.createObjectURL(card.image), alt: '', style: 'max-width:100%;max-height:30vh;border-radius:14px;object-fit:contain;align-self:center' });

    // The answer side, shared by every type.
    const backPart = () => {
      const parts = [h('div', { style: 'height:1px;background:var(--line);margin:4px 0' })];
      if (card.image instanceof Blob && card.type !== 'producir' && card.type !== 'reconocer') parts.push(picture());
      // The word itself only when it was the answer (on the other types it is already on screen).
      if (card.type === 'producir' || card.type === 'escuchar') parts.push(h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center' },
        h('span', { style: 'font-family:var(--display);font-size:26px;font-weight:700' }, card.front),
        h('span', { class: 'ipa', style: 'color:var(--gold-text)' }, card.ipa || '')));
      if (card.meaning) parts.push(h('p', { style: 'text-align:center;font-size:20px;font-weight:600' }, card.meaning));
      if (card.hint) parts.push(h('p', { class: 'muted small', style: 'text-align:center' }, card.hint));
      const ctx = card.context || (card.back && card.back !== card.meaning && !/ · /.test(card.back) ? card.back : '');
      if (ctx) {
        const p = h('p', { style: 'font-size:16px;line-height:1.5;background:var(--chip);border-radius:12px;padding:12px' });
        const re = new RegExp(`(${esc(card.front)})`, 'i');
        ctx.split(re).forEach((part, i) => p.append(i % 2 ? h('b', { style: 'color:var(--accent)' }, part) : part));
        parts.push(p);
      }
      const srcLabel = card.source && card.source.label ? card.source.label : (/ · /.test(card.back || '') ? card.back : '');
      parts.push(h('div', { class: 'row wrap', style: 'gap:8px;justify-content:center' },
        listen(hasRealAudio(card) ? '▶ Original' : '▶ Escuchar'),
        srcLabel ? h('span', { class: 'muted small' }, srcLabel) : ''));
      return parts;
    };

    function reveal(s) {
      if (revealed) return;
      revealed = true; suggest = s; stopClock();
      face.append(...backPart());
      const pv = practice ? null : preview(card);
      const fail = h('button', { type: 'button', class: 'btn ghost', style: `flex:1;min-height:64px;flex-direction:column;gap:2px;${s === false ? 'outline:3px solid var(--accent);' : ''}` },
        h('b', {}, 'Fallé'), h('span', { class: 'small muted' }, practice ? 'otra vez al final' : `${human(pv.fail)} · 1`));
      const pass = h('button', { type: 'button', class: 'btn', style: `flex:1;min-height:64px;flex-direction:column;gap:2px;${s === true ? 'outline:3px solid var(--gold);' : ''}` },
        h('b', {}, 'Pasé'), h('span', { class: 'small', style: 'opacity:.85' }, practice ? 'listo' : `${human(pv.pass)} · 2`));
      fail.onclick = () => grade(false); pass.onclick = () => grade(true);
      actions.replaceChildren(h('div', { class: 'row', style: 'gap:10px' }, fail, pass));
    }
    async function grade(ok) {
      const ms = Date.now() - shownAt;
      if (practice) {
        if (!results.has(card.id)) results.set(card.id, { card, ok });
        q.reviews = q.reviews.filter((c) => c.id !== card.id);
        if (!ok && !requeued.has(card.id)) { requeued.add(card.id); q.reviews.push(card); }
        done++; if (ok) passed++;
        show(); return;
      }
      const u = await answerCard(q, card, ok, ms);
      done++; if (ok) passed++;
      if (u.suspended === 'leech') toast('Esta tarjeta pasó a la Bóveda: la fallaste muchas veces.');
      if (u.suspended === 'mastered') toast('¡Dominada! Esta tarjeta se retira.');
      show();
    }
    const showBtn = (label = 'Mostrar respuesta', fn = () => reveal(null)) => {
      const b = h('button', { type: 'button', class: 'btn', style: 'min-height:58px;font-size:17px' }, label);
      b.onclick = fn; actions.replaceChildren(b); return b;
    };

    // --- Fronts by type
    if (card.type === 'producir') {
      const prompt = card.meaning || (card.back && !/ · /.test(card.back) ? card.back : '') || card.hint || '—';
      const input = h('input', { type: 'text', 'aria-label': 'Tu respuesta', placeholder: 'Escribí en español…', lang: 'es-AR', autocomplete: 'off', autocapitalize: 'off',
        style: 'min-height:54px;padding:0 16px;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font-size:20px;width:100%' });
      const hint = h('button', { type: 'button', class: 'pill' }, 'Pista');
      hint.onclick = () => { hint.textContent = card.front.split('').map((ch, i) => (i === 0 || ch === ' ' ? ch : '_')).join(' '); };
      face.append(top, h('div', { style: 'flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;text-align:center' },
        card.image instanceof Blob ? picture() : '',
        h('span', { class: 'muted small' }, card.tag === '#Trivia' ? '¿Qué o quién es?' : '¿Cómo se dice?'), h('span', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, prompt)), input, h('div', { class: 'row' }, hint));
      const check = () => {
        const r = checkTyped(input.value, card.front);
        input.disabled = true;
        face.append(h('p', { style: `text-align:center;font-weight:700;color:${r.ok ? 'var(--accent)' : 'var(--gold-text)'}` }, r.ok ? (r.accentsOnly ? '¡Bien! Ojo con las tildes.' : '¡Bien!') : `Escribiste: ${input.value || '(nada)'}`));
        reveal(r.ok);
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
      showBtn('Comprobar', check);
      setTimeout(() => input.focus(), 50);
      startTimer(check);
    } else if (card.type === 'escuchar') {
      const input = h('textarea', { rows: '2', 'aria-label': '¿Qué escuchaste?', placeholder: 'Escribí lo que escuchaste…', lang: 'es-AR',
        style: 'border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font-size:17px;padding:12px;width:100%;resize:none' });
      const play = h('button', { type: 'button', class: 'round native', 'aria-label': 'Escuchar', style: 'width:84px;height:84px;font-size:30px' }, '▶');
      play.onclick = () => playCard(card);
      face.append(top, h('div', { style: 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px' },
        play, h('div', { class: 'row', style: 'gap:8px' }, listen('0,75×', 0.75), listen('Repetir'))), input);
      const check = () => {
        const r = checkTyped(input.value, card.front);
        input.disabled = true;
        face.append(h('p', { style: `text-align:center;font-weight:700;color:${r.ok ? 'var(--accent)' : 'var(--gold-text)'}` }, r.ok ? '¡Bien!' : r.close ? 'Casi: compará con la frase.' : 'Compará con la frase.'));
        reveal(r.ok ? true : r.close ? null : false);
      };
      showBtn('Comprobar', check);
      playCard(card);
      startTimer(() => reveal(null));
    } else if (card.type === 'completar') {
      const ctx = card.context || card.back;
      const re = new RegExp(esc(card.front), 'i');
      const gap = h('span', { style: 'display:inline-block;min-width:80px;border-bottom:3px solid var(--accent);color:var(--accent);text-align:center' }, '?');
      const [a, b] = ctx.split(re);
      face.append(top, h('p', { style: 'font-family:var(--display);font-size:23px;line-height:1.5;flex:1;display:flex;align-items:center' },
        h('span', {}, a || '', gap, b !== undefined ? b : '')));
      const choose = (val) => {
        const ok = clean(val) === clean(card.front);
        gap.textContent = card.front; gap.style.color = ok ? 'var(--accent)' : 'var(--gold-text)';
        reveal(ok);
      };
      db.all('cards').then((all) => {
        const others = shuffle([...new Set(all.filter((c) => c.deck === card.deck && c.front.split(' ').length <= 3 && clean(c.front) !== clean(card.front)).map((c) => c.front))]).slice(0, 3);
        if (others.length >= 3) {
          const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px' },
            shuffle([card.front, ...others]).map((o) => { const btn = h('button', { type: 'button', class: 'btn ghost', style: 'min-height:52px' }, o); btn.onclick = () => choose(o); return btn; }));
          actions.replaceChildren(grid);
        } else {
          const input = h('input', { type: 'text', 'aria-label': 'La palabra que falta', lang: 'es-AR', autocomplete: 'off',
            style: 'min-height:54px;padding:0 16px;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font-size:20px;width:100%' });
          input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); choose(input.value); } };
          const ok = h('button', { type: 'button', class: 'btn' }, 'Comprobar'); ok.onclick = () => choose(input.value);
          actions.replaceChildren(input, ok);
        }
      });
      startTimer(() => reveal(null));
    } else if (card.type === 'pronunciar') {
      const rec = new Recorder();
      const mine = h('canvas', { style: 'width:100%;height:48px;background:var(--chip);border-radius:10px', 'aria-label': 'Tu grabación' });
      const native = h('canvas', { style: 'width:100%;height:48px;background:var(--chip);border-radius:10px', 'aria-label': 'Voz nativa' });
      let myBlob = null;
      const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabarme', style: 'width:72px;height:72px;font-size:13px;font-weight:700' }, 'REC');
      const playMine = h('button', { type: 'button', class: 'pill', disabled: true }, '▶ Mi voz');
      recBtn.onclick = async () => {
        if (rec.recording) {
          myBlob = await rec.stop(); recBtn.textContent = 'REC'; recBtn.classList.remove('live'); playMine.disabled = false;
          try { drawWave(mine, await decode(myBlob), getComputedStyle(document.body).getPropertyValue('--gold-text') || '#c80'); } catch { /* ignore */ }
          if (!revealed) reveal(null);
          return;
        }
        stopAudio();
        try { await rec.start(); recBtn.textContent = '■'; recBtn.classList.add('live'); } catch { toast('Necesito permiso para el micrófono'); }
      };
      playMine.onclick = () => { if (myBlob) { stopAudio(); player = new Audio(URL.createObjectURL(myBlob)); player.play(); } };
      face.append(top, h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center' },
        h('span', { style: 'font-family:var(--display);font-size:34px;font-weight:700' }, card.front),
        h('span', { class: 'ipa', style: 'font-size:18px;color:var(--gold-text)' }, card.ipa || '')),
      hasRealAudio(card) ? h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, h('span', { class: 'kicker' }, 'NATIVA'), native) : '',
      h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, h('span', { class: 'kicker' }, 'VOS'), mine),
      h('div', { class: 'row', style: 'gap:14px;justify-content:center;align-items:center' }, listen('▶ Modelo'), recBtn, playMine));
      if (card.audio instanceof Blob) decode(card.audio).then((b) => drawWave(native, b, getComputedStyle(document.body).getPropertyValue('--accent') || '#36c')).catch(() => {});
      showBtn('Comparar y calificar', () => reveal(null));
      startTimer(null);
    } else {
      // Reconocer
      face.append(top, h('div', { style: 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center' },
        card.image instanceof Blob ? picture() : '',
        h('span', { style: `font-family:var(--display);font-size:${card.front.length > 40 ? 24 : card.front.length > 18 ? 32 : 46}px;font-weight:700;line-height:1.25` }, card.front),
        h('span', { class: 'ipa', style: 'font-size:18px;color:var(--gold-text)' }, card.ipa || ''),
        listen()), h('span', { class: 'muted small', style: 'text-align:center' }, '¿Qué significa?'));
      showBtn();
      startTimer(() => reveal(null));
    }

    // Studying the vault: the example sentence and the hint stay on screen while you think.
    if (practice && set === 'boveda' && card.type !== 'completar' && (card.hint || card.context)) {
      const ctx = card.context ? (card.type === 'reconocer' ? card.context : card.context.replace(new RegExp(esc(card.front), 'ig'), '___')) : '';
      face.insertBefore(h('div', { style: 'background:var(--soft);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px' },
        h('span', { class: 'kicker' }, 'AYUDA'), ctx ? h('span', { style: 'line-height:1.45' }, ctx) : '', card.hint ? h('span', { class: 'muted small' }, card.hint) : ''), face.children[1] || null);
    }

    keyHandler = (e) => {
      if (editing) return;
      const typing = e.target && /input|textarea/i.test(e.target.tagName) && !e.target.disabled;
      const a = actionFor(e, revealed ? ['fail', 'pass', 'suggested', 'replay', 'slow', 'edit', 'quit'] : ['show', 'replay', 'slow', 'edit', 'quit']);
      if (!a) { if (!revealed && e.key === 'Enter' && !typing) { e.preventDefault(); const b = actions.querySelector('button'); if (b) b.click(); } return; }
      // While typing an answer, only Enter (handled by the field), Esc and Ctrl-combinations count.
      if (typing && !/^(Ctrl\+|Escape)/.test(e.key === 'Escape' ? 'Escape' : (e.ctrlKey || e.metaKey ? 'Ctrl+' : ''))) return;
      e.preventDefault();
      if (a === 'fail') grade(false);
      else if (a === 'pass') grade(true);
      else if (a === 'suggested') { if (suggest !== null) grade(suggest); }
      else if (a === 'show') { const b = actions.querySelector('button'); if (b) b.click(); }
      else if (a === 'replay') playCard(card);
      else if (a === 'slow') playCard(card, 0.75);
      else if (a === 'edit') editCurrent();
      else if (a === 'quit') location.hash = '#/repaso';
    };
  }

  const onKey = (e) => keyHandler && keyHandler(e);
  document.addEventListener('keydown', onKey);
  if (!total0) finish(); else show();
  return () => { document.body.classList.remove('sesion'); document.removeEventListener('keydown', onKey); stopClock(); stopAudio(); };
}
