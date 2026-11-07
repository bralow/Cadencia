// Escribir: write a short text, get it reviewed through several lenses, see the changes word by word.
import { h, toast } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { LENSES, promptFor, review, diffWords } from '../escribir.js';
import { geminiReady, geminiSpeech } from '../gemini.js';
import { unlockAudio, playPcm, stopPcm } from '../pcm.js';
import { checkVoseo, applyVoseo } from '../vosfix.js';
import { getSettings } from '../settings.js';
import { transcribe } from '../ipa.js';
import { db } from '../db.js';
import { log } from '../progress.js';

const KEY = 'cadencia.escribir';
const load = () => { try { return { draft: '', prompt: null, history: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { draft: '', prompt: null, history: [] }; } };
const save = (patch) => { const v = { ...load(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } return v; };
const voice = () => { try { return JSON.parse(localStorage.getItem('cadencia.charla') || '{}').voice || 'Aoede'; } catch { return 'Aoede'; } };
const lensOf = (id) => LENSES.find((l) => l.id === id) || { id, label: id, color: 'var(--muted)' };
const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export async function render(main) {
  main.append(h('div', { class: 'between' }, practiceTabs('escribir')));
  const level = getSettings().level;
  let st = load();
  if (!st.prompt || st.prompt.level !== level) st = save({ prompt: { ...promptFor(level), level } });

  // --- Prompt and editor
  const promptText = h('p', { style: 'font-size:17px;line-height:1.4;font-family:var(--display)' }, st.prompt.text);
  const another = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, 'Otra consigna');
  const free = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, 'Tema libre');
  const input = h('textarea', { rows: '7', placeholder: 'Escribí acá, aunque sea con errores…', 'aria-label': 'Tu texto', lang: 'es-AR', spellcheck: 'false',
    style: 'width:100%;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:12px;font:inherit;font-size:16px;line-height:1.5;resize:vertical' });
  input.value = st.draft;
  const count = h('span', { class: 'muted small' });
  const check = h('button', { type: 'button', class: 'btn' }, geminiReady() ? 'Revisar' : 'Revisar voseo');
  const paintCount = () => { count.textContent = `${words(input.value)} palabras`; };
  paintCount();
  main.append(h('section', { class: 'card', style: 'gap:10px' },
    h('span', { class: 'kicker' }, `CONSIGNA · ${level}`), promptText,
    h('div', { class: 'row wrap', style: 'gap:6px' }, another, free),
    input,
    h('div', { class: 'between' }, count, check)));
  if (!geminiReady()) {
    main.append(h('p', { class: 'muted small', style: 'text-align:center' }, 'Sin clave de Gemini solo reviso el voseo. ', h('a', { href: '#/perfil' }, 'Agregar la clave en Perfil')));
  }

  const result = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const historyBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  main.append(result, historyBox);

  another.onclick = () => { st = save({ prompt: { ...promptFor(level, st.prompt.index), level } }); promptText.textContent = st.prompt.text; };
  free.onclick = () => { st = save({ prompt: { text: 'Escribí sobre lo que quieras.', index: -1, level } }); promptText.textContent = st.prompt.text; };
  input.oninput = () => { paintCount(); save({ draft: input.value }); };

  // --- Review
  check.onclick = async () => {
    unlockAudio();
    const text = input.value.trim();
    if (words(text) < 3) { toast('Escribí al menos una frase.'); return; }
    if (!geminiReady()) { showLocal(text); return; }
    check.disabled = true; check.textContent = 'Revisando…';
    result.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'La profe está leyendo tu texto…')));
    try {
      const r = await review(text, level, st.prompt.index >= 0 ? st.prompt.text : '');
      const entry = { text, prompt: st.prompt.text, result: r, at: Date.now() };
      st = save({ history: [entry, ...st.history.filter((e) => e.text !== text)].slice(0, 15) });
      log('escribir', { words: words(text), changes: r.changes.length, kinds: r.changes.map((c) => c.lens) });
      showResult(entry);
      drawHistory();
    } catch (err) {
      result.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'small' }, 'No pude revisar: ' + (err.message || err))));
    }
    check.disabled = false; check.textContent = 'Revisar';
  };

  // Offline: the voseo checker that already lives in the app.
  function showLocal(text) {
    const fixes = checkVoseo(text);
    const fixed = applyVoseo(text, fixes);
    result.replaceChildren(h('section', { class: 'card', style: 'gap:10px' },
      h('span', { class: 'kicker' }, 'VOSEO'),
      fixes.length ? diffView(text, fixed) : h('p', {}, '✓ No encontré formas de tú. ¡Bien!'),
      ...fixes.map((f) => changeCard({ original: f.original, better: f.suggestion, lens: 'voseo', why: f.note }))));
  }

  // --- Result
  function diffView(a, b) {
    const p = h('p', { style: 'font-size:17px;line-height:1.7', lang: 'es-AR' });
    for (const seg of diffWords(a, b)) {
      if (p.childNodes.length) p.append(' ');
      if (seg.type === 'same') p.append(seg.text);
      else if (seg.type === 'del') p.append(h('s', { style: 'opacity:.6;background:color-mix(in srgb, var(--muted) 18%, transparent);border-radius:4px;padding:0 2px' }, seg.text));
      else p.append(h('b', { style: 'background:color-mix(in srgb, var(--accent) 22%, transparent);border-radius:4px;padding:0 2px' }, seg.text));
    }
    return p;
  }
  function changeCard(c) {
    const l = lensOf(c.lens);
    const keep = h('button', { type: 'button', class: 'pill', style: 'min-height:32px;font-size:11px;align-self:flex-start' }, 'Guardar');
    keep.onclick = async () => {
      await db.put('mazo', { front: c.better, ipa: transcribe(c.better), back: `${c.original ? `En vez de «${c.original}». ` : ''}${c.why || ''}`.trim(), tag: '#Escribir', created: Date.now() });
      toast('Guardado en el Mazo'); keep.disabled = true; keep.textContent = '✓ Guardado';
    };
    return h('div', { class: 'card', style: 'gap:4px;padding:10px 12px' },
      h('div', { class: 'row wrap', style: 'gap:6px;align-items:baseline' },
        c.original ? h('s', { style: 'opacity:.7' }, c.original) : '', c.original ? '→' : '', h('b', {}, c.better || '(sacar)'),
        h('span', { style: `font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--chip);color:${l.color}` }, l.label.toUpperCase())),
      c.why ? h('span', { class: 'small muted' }, c.why) : '', keep);
  }

  function showResult(entry) {
    const { text, result: r } = entry;
    let view = 'corrected', lens = 'all';
    const views = [['corrected', 'Corregido'], ...(r.porteno ? [['porteno', 'Como un porteño']] : [])].map(([k, label]) =>
      h('button', { type: 'button', class: 'pill', style: 'min-height:36px;border:none', 'aria-pressed': String(k === view) }, label));
    const textBox = h('div');
    const listen = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '▶ Escuchar');
    const keepAll = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Guardar texto');
    const reuse = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Seguir escribiendo desde acá');
    const target = () => (view === 'porteno' ? r.porteno : r.corrected);
    const paintText = () => {
      views.forEach((b, i) => b.setAttribute('aria-pressed', String((i ? 'porteno' : 'corrected') === view)));
      textBox.replaceChildren(diffView(text, target()));
    };
    views.forEach((b, i) => { b.onclick = () => { view = i ? 'porteno' : 'corrected'; stopPcm(); listen.textContent = '▶ Escuchar'; paintText(); }; });
    const audio = {};
    listen.onclick = async () => {
      unlockAudio();
      if (listen.textContent.startsWith('■')) { stopPcm(); listen.textContent = '▶ Escuchar'; return; }
      listen.textContent = '…';
      try {
        const t = target();
        if (!audio[t]) audio[t] = await geminiSpeech(t, voice());
        listen.textContent = '■ Parar';
        await playPcm(audio[t].samples, audio[t].rate);
      } catch (err) { toast('Sin voz: ' + (err.message || err)); }
      listen.textContent = '▶ Escuchar';
    };
    keepAll.onclick = async () => {
      const t = target();
      await db.put('mazo', { front: t, ipa: transcribe(t), back: `Mi versión: ${text}`, tag: '#Escribir', created: Date.now() });
      toast('Guardado en el Mazo');
    };
    reuse.onclick = () => { input.value = r.corrected; save({ draft: input.value }); paintCount(); input.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    // Lens filter with counts.
    const counts = {};
    r.changes.forEach((c) => { counts[c.lens] = (counts[c.lens] || 0) + 1; });
    const lensBtns = [['all', `Todo (${r.changes.length})`], ...LENSES.filter((l) => counts[l.id]).map((l) => [l.id, `${l.label} (${counts[l.id]})`])]
      .map(([id, label]) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px', 'aria-pressed': String(id === lens) }, label); b.dataset.lens = id; return b; });
    const cards = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    const paintCards = () => {
      lensBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lens === lens)));
      cards.replaceChildren(...r.changes.filter((c) => lens === 'all' || c.lens === lens).map(changeCard));
    };
    lensBtns.forEach((b) => { b.onclick = () => { lens = b.dataset.lens; paintCards(); }; });

    result.replaceChildren(
      h('section', { class: 'card', style: 'gap:10px' },
        h('div', { class: 'between' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Versión' }, views), r.level ? h('span', { class: 'muted small' }, `Nivel del texto: ${r.level}`) : ''),
        textBox,
        h('div', { class: 'row wrap', style: 'gap:6px' }, listen, keepAll, reuse),
        r.praise ? h('p', { class: 'small' }, '✓ ', r.praise) : ''),
      r.changes.length
        ? h('section', { style: 'display:flex;flex-direction:column;gap:8px' },
          h('span', { class: 'kicker' }, 'CAMBIOS'), h('div', { class: 'row wrap', style: 'gap:6px' }, lensBtns), cards)
        : h('section', { class: 'card' }, h('p', {}, '¡Impecable! No hay nada que corregir.')),
      r.tip ? h('section', { class: 'card', style: 'gap:4px' }, h('span', { class: 'kicker' }, 'PARA LA PRÓXIMA'), h('p', { class: 'small' }, r.tip)) : '');
    paintText(); paintCards();
  }

  // --- Past texts
  function drawHistory() {
    if (!st.history.length) { historyBox.replaceChildren(); return; }
    historyBox.replaceChildren(h('span', { class: 'kicker', style: 'margin-top:8px' }, 'TUS TEXTOS'),
      ...st.history.map((e) => {
        const b = h('button', { type: 'button', class: 'card', style: 'text-align:left;cursor:pointer;font:inherit;color:inherit;gap:2px;padding:10px 12px' },
          h('span', { class: 'small', style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, e.text),
          h('span', { class: 'muted small' }, `${new Date(e.at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} · ${e.result.changes.length} cambios`));
        b.onclick = () => { input.value = e.text; paintCount(); showResult(e); result.scrollIntoView({ behavior: 'smooth' }); };
        return b;
      }));
  }
  drawHistory();
  return () => { stopPcm(); };
}
