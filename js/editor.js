// The card editor (FE-03, FE-12, FE-13, FE-15, FE-16): every field of a saved word or sentence,
// duplicate warnings while you type, photo and audio editing, the phonetic spelling switch and the AI check.
// buildEditor(el, { note, deckId, onDone }) fills `el`; onDone(result) runs on save ('saved'), delete ('deleted') or cancel (null).
import { h, toast } from './ui.js';
import { db } from './db.js';
import { decks, TYPES, fillMeaning } from './penumbra.js';
import { transcribe } from './ipa.js';
import { similar, saveNote, proofread } from './cardtools.js';
import { openImageEditor } from './imgedit.js';
import { openAudioEditor, openMarkerEditor } from './audedit.js';
import { Recorder } from './audio.js';
import { phoneSay, stopPhone } from './voz.js';
import { actionFor, keys, label } from './hotkeys.js';
import { geminiReady } from './gemini.js';

const field = 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px;width:100%';
const area = 'padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px;width:100%;resize:vertical;font-family:inherit;line-height:1.4';
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const TYPE_HELP = {
  reconocer: 'ves el español → recordás el significado',
  producir: 'ves el significado → escribís el español',
  escuchar: 'escuchás → escribís lo que oíste',
  completar: 'elegís la palabra que falta en la frase',
  pronunciar: 'te grabás y comparás con la voz nativa',
};

export async function buildEditor(el, { note, deckId, onDone }) {
  const sibs = note ? (await db.all('cards')).filter((c) => c.note === note).sort((a, b) => a.created - b.created) : [];
  if (note && !sibs.length) { el.append(h('p', { class: 'muted' }, 'Esta tarjeta ya no existe.')); return () => {}; }
  const c0 = sibs[0] || {};
  const ds = await decks();
  const isNew = !note;
  const noteId = note || uid();
  let image = c0.image instanceof Blob ? c0.image : null;
  let audio = c0.audio instanceof Blob ? c0.audio : null;
  let source = c0.source || null;
  let ipaMode = c0.ipaMode || 'auto';
  let dirty = false;

  // --- Fields
  const deckSel = h('select', { 'aria-label': 'Mazo', style: field }, [...ds.map((d) => h('option', { value: d.name }, d.name)), h('option', { value: '__new' }, 'Nuevo mazo…')]);
  const curDeck = ds.find((d) => d.id === (c0.deck || deckId));
  deckSel.value = curDeck ? curDeck.name : ds.length ? ds[0].name : '__new';
  const newDeck = h('input', { type: 'text', placeholder: 'Nombre del mazo', 'aria-label': 'Nombre del mazo nuevo', style: field, hidden: deckSel.value !== '__new' });
  deckSel.onchange = () => { newDeck.hidden = deckSel.value !== '__new'; dirty = true; };
  const front = h('input', { type: 'text', value: c0.front || '', placeholder: 'Palabra o frase en español', 'aria-label': 'Frente', lang: 'es-AR', style: `${field};font-size:19px;font-weight:600` });
  const meaning = h('input', { type: 'text', value: c0.meaning || '', placeholder: 'Significado en inglés (si lo dejás vacío, lo completa Gemini)', 'aria-label': 'Significado', style: field });
  const context = h('textarea', { rows: '2', placeholder: 'Frase de ejemplo que incluya la palabra (opcional)', 'aria-label': 'Frase de ejemplo', lang: 'es-AR', style: area }, c0.context || '');
  const hint = h('input', { type: 'text', value: c0.hint || '', placeholder: 'Nota: registro, uso, una pista (opcional)', 'aria-label': 'Nota', style: field });
  const inputs = { front, meaning, context, hint };
  for (const i of Object.values(inputs)) i.addEventListener('input', () => { dirty = true; });

  // Duplicate warning while you type (FE-03).
  const dupBox = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:6px' });
  let dupT = 0;
  const checkDup = () => {
    clearTimeout(dupT);
    dupT = setTimeout(async () => {
      const found = await similar(front.value, isNew ? null : noteId);
      const names = new Map(ds.map((d) => [d.id, d.name]));
      dupBox.replaceChildren(...found.map((n) => {
        const open = h('button', { type: 'button', class: 'pill', style: 'min-height:32px;font-size:12px' }, 'Abrir esa');
        open.onclick = () => onDone({ open: n.note });
        return h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap;background:var(--soft);border-radius:12px;padding:8px 10px' },
          h('span', { class: 'small', style: 'flex:1;min-width:0' }, n.likeness === 'same' ? '⚠ Ya tenés ' : '¿Parecida? ', h('b', {}, `«${n.front}»`), ` en ${names.get(n.deck) || 'otro mazo'}`), open);
      }));
    }, 250);
  };
  front.addEventListener('input', () => { checkDup(); paintIpa(); });

  // Phonetic spelling (FE-15): automatic from the Rioplatense rules, typed by hand, or off for this card.
  const ipaInput = h('input', { type: 'text', 'aria-label': 'Pronunciación (AFI)', class: 'ipa', style: `${field};font-size:18px` });
  const ipaModes = [['auto', 'Automática'], ['manual', 'A mano'], ['off', 'Apagada']].map(([k, l]) => {
    const b = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px', 'aria-pressed': String(ipaMode === k) }, l);
    b.onclick = () => { ipaMode = k; ipaModes.forEach((x, i) => x.setAttribute('aria-pressed', String(['auto', 'manual', 'off'][i] === k))); dirty = true; paintIpa(); if (k === 'manual') ipaInput.focus(); };
    return b;
  });
  function paintIpa() {
    ipaInput.hidden = ipaMode === 'off';
    ipaInput.readOnly = ipaMode === 'auto';
    if (ipaMode === 'auto') ipaInput.value = front.value.trim() ? transcribe(front.value) : '';
  }
  ipaInput.value = c0.ipa || '';
  ipaInput.addEventListener('input', () => { dirty = true; });
  paintIpa();

  // Photo (FE-12).
  const imgBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const imgFile = h('input', { type: 'file', accept: 'image/*', hidden: true });
  imgFile.onchange = async () => { const f = imgFile.files[0]; imgFile.value = ''; if (!f) return; const out = await openImageEditor(f); if (out) { image = out; dirty = true; paintImg(); } };
  function paintImg() {
    const btn = (l, fn) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:12px' }, l); b.onclick = fn; return b; };
    if (!image) { imgBox.replaceChildren(h('div', { class: 'row wrap', style: 'gap:6px' }, btn('+ Agregar foto', () => imgFile.click())), imgFile); return; }
    const url = URL.createObjectURL(image);
    imgBox.replaceChildren(h('img', { src: url, alt: 'Foto de la tarjeta', style: 'max-width:100%;max-height:220px;border-radius:12px;align-self:flex-start;object-fit:contain' }),
      h('div', { class: 'row wrap', style: 'gap:6px' },
        btn('Recortar', async () => { const out = await openImageEditor(image); if (out) { image = out; dirty = true; paintImg(); } }),
        btn('Cambiar', () => imgFile.click()),
        btn('Quitar', () => { image = null; dirty = true; paintImg(); }),
        h('span', { class: 'muted small', style: 'align-self:center' }, `${Math.max(1, Math.round(image.size / 1024))} KB`)), imgFile);
  }
  paintImg();

  // Audio (FE-13): the card's own clip, or the moment in a podcast episode.
  const audBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const audFile = h('input', { type: 'file', accept: 'audio/*', hidden: true });
  audFile.onchange = async () => { const f = audFile.files[0]; audFile.value = ''; if (!f) return; const out = await openAudioEditor(f); if (out) { audio = out; dirty = true; paintAud(); } };
  const rec = new Recorder();
  let player = null;
  const stopPlay = () => { if (player) { player.pause(); player = null; } stopPhone(); };
  async function playIt() {
    stopPlay();
    if (audio) { player = new Audio(URL.createObjectURL(audio)); player.play().catch(() => {}); return; }
    if (source && source.kind === 'podcast') {
      const r = await db.get('epaudio', source.id);
      if (r) { player = new Audio(URL.createObjectURL(r.blob)); await new Promise((ok) => { player.onloadedmetadata = ok; setTimeout(ok, 1500); }); player.currentTime = source.s; player.play().catch(() => {}); const p = player; setTimeout(() => p.pause(), (source.e - source.s) * 1000 + 200); return; }
    }
    phoneSay(front.value);
  }
  function paintAud() {
    const btn = (l, fn) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:12px' }, l); b.onclick = fn; return b; };
    const recBtn = btn('● Grabar', async () => {
      if (rec.recording) { const b = await rec.stop(); recBtn.textContent = '● Grabar'; const out = await openAudioEditor(b); if (out) { audio = out; dirty = true; paintAud(); } return; }
      stopPlay(); try { await rec.start(); recBtn.textContent = '■ Parar'; } catch { toast('Necesito permiso para el micrófono'); }
    });
    const what = audio ? `Clip propio · ${Math.max(1, Math.round(audio.size / 1024))} KB`
      : source && source.kind === 'podcast' ? `Del podcast: ${source.label || ''} (${(source.e - source.s).toFixed(1)} s)`
        : 'Sin audio propio: se lee con la voz del teléfono';
    audBox.replaceChildren(h('span', { class: 'small' }, what), h('div', { class: 'row wrap', style: 'gap:6px' },
      btn('▶ Escuchar', playIt),
      audio ? btn('Editar audio', async () => { stopPlay(); const out = await openAudioEditor(audio); if (out) { audio = out; dirty = true; paintAud(); } }) : '',
      !audio && source && source.kind === 'podcast' ? btn('Ajustar marcas', async () => { stopPlay(); const m = await openMarkerEditor(source); if (m) { source = { ...source, ...m }; dirty = true; paintAud(); } }) : '',
      recBtn, btn('Elegir archivo', () => audFile.click()),
      audio ? btn('Quitar', () => { audio = null; dirty = true; paintAud(); }) : ''), audFile);
  }
  paintAud();

  // Card types.
  const have = new Map(sibs.map((c) => [c.type, c]));
  const defaults = isNew ? ['reconocer', 'producir'] : [...have.keys()];
  const typeBoxes = Object.entries(TYPES).map(([k, l]) => {
    const cb = h('input', { type: 'checkbox', value: k }); cb.checked = defaults.includes(k);
    cb.onchange = () => { dirty = true; };
    const c = have.get(k);
    const prog = c && c.reps ? ` · ${c.reps} repasos` : '';
    return h('label', { style: 'display:flex;gap:10px;align-items:flex-start;padding:6px 2px;cursor:pointer' }, cb,
      h('span', { style: 'display:flex;flex-direction:column' }, h('b', { style: 'font-size:14px' }, l), h('span', { class: 'muted small' }, `${TYPE_HELP[k]}${prog}`)));
  });
  const chosenTypes = () => typeBoxes.map((l) => l.querySelector('input')).filter((x) => x.checked).map((x) => x.value);

  // AI proofreader (FE-16).
  const proofBox = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:8px' });
  const proofBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:42px' }, '✨ Revisar con IA');
  const NAMES = { front: 'Frente', meaning: 'Significado', context: 'Frase de ejemplo', hint: 'Nota' };
  async function runProof() {
    if (!geminiReady()) { toast('Falta la clave de Gemini (Perfil → Gemini)'); return; }
    if (!front.value.trim()) { toast('Escribí el frente primero'); return; }
    proofBtn.disabled = true; proofBtn.textContent = 'Revisando…';
    try {
      const r = await proofread({ front: front.value, meaning: meaning.value, context: context.value, hint: hint.value });
      if (!r.issues.length) { proofBox.replaceChildren(h('p', { class: 'small', style: 'color:var(--accent);font-weight:700' }, '✓ La tarjeta está bien.')); return; }
      proofBox.replaceChildren(...r.issues.map((x) => {
        const row = h('div', { style: 'display:flex;flex-direction:column;gap:6px;background:var(--soft);border-radius:12px;padding:10px 12px' });
        const ok = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, 'Aceptar');
        const no = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, 'Ignorar');
        ok.onclick = () => { inputs[x.field].value = x.fix; inputs[x.field].dispatchEvent(new Event('input')); row.remove(); };
        no.onclick = () => row.remove();
        row.append(h('span', { class: 'small' }, h('b', {}, `${NAMES[x.field]}: `), x.problem),
          x.fix ? h('span', { class: 'small', style: 'font-weight:600' }, `→ ${x.fix}`) : '', h('div', { class: 'row', style: 'gap:6px' }, ok, no));
        return row;
      }));
    } catch (e) { toast(`No pude revisar: ${String(e.message || e).slice(0, 80)}`); }
    finally { proofBtn.disabled = false; proofBtn.textContent = '✨ Revisar con IA'; }
  }
  proofBtn.onclick = runProof;

  // --- Save, delete, cancel
  const k = keys();
  const save = h('button', { type: 'button', class: 'btn', style: 'flex:1', title: label(k.save) }, isNew ? 'Crear tarjeta' : 'Guardar');
  const cancel = h('button', { type: 'button', class: 'btn ghost', style: 'flex:1' }, 'Cancelar');
  async function doSave() {
    const f = front.value.trim();
    const deckName = deckSel.value === '__new' ? newDeck.value.trim() : deckSel.value;
    if (!f) { toast('Falta el frente'); front.focus(); return; }
    if (!deckName) { toast('Elegí un mazo'); return; }
    const types = chosenTypes();
    if (!types.length) { toast('Elegí al menos un tipo de tarjeta'); return; }
    if (types.includes('completar') && !context.value.toLowerCase().includes(f.toLowerCase())) { toast('Para «Completar», la frase de ejemplo tiene que incluir la palabra'); return; }
    const lost = sibs.filter((c) => !types.includes(c.type) && c.reps);
    if (lost.length && !window.confirm(`Vas a quitar ${lost.map((c) => TYPES[c.type]).join(', ')} y su progreso. ¿Seguir?`)) return;
    save.disabled = true;
    await saveNote(noteId, {
      front: f, meaning: meaning.value.trim(), context: context.value.trim(), hint: hint.value.trim(),
      ipaMode, ipa: ipaInput.value.trim(), image: image || undefined, audio: audio || undefined, source: source || undefined,
    }, types, deckName);
    if (!meaning.value.trim()) fillMeaning((await db.all('cards')).filter((c) => c.note === noteId)).catch(() => {});
    dirty = false;
    toast(isNew ? 'Tarjeta creada' : 'Guardado');
    onDone('saved');
  }
  save.onclick = doSave;
  cancel.onclick = () => { if (!dirty || window.confirm('¿Salir sin guardar los cambios?')) onDone(null); };
  const del = isNew ? '' : h('button', { type: 'button', class: 'pill', style: 'min-height:40px;color:var(--accent)' }, 'Borrar esta tarjeta');
  if (del) del.onclick = async () => { if (!window.confirm(`¿Borrar «${c0.front}» y todo su progreso?`)) return; for (const c of sibs) await db.remove('cards', c.id); toast('Borrada'); onDone('deleted'); };

  const section = (title, ...kids) => h('section', { class: 'card', style: 'gap:10px' }, h('span', { class: 'kicker' }, title), ...kids);
  el.append(
    section('TARJETA', deckSel, newDeck, front, dupBox, meaning, context, hint, h('div', { class: 'row wrap', style: 'gap:8px' }, proofBtn), proofBox),
    section('PRONUNCIACIÓN', h('div', { class: 'row wrap', style: 'gap:6px' }, ipaModes), ipaInput),
    section('FOTO', imgBox),
    section('AUDIO', audBox),
    section('TIPOS DE TARJETA', h('p', { class: 'muted small' }, 'Cada tipo se repasa por separado, pero nunca dos del mismo día.'), ...typeBoxes),
    h('div', { class: 'row', style: 'gap:10px;position:sticky;bottom:calc(env(safe-area-inset-bottom) + 12px);z-index:5' }, cancel, save),
    del ? h('div', { style: 'display:flex;justify-content:center;padding:6px' }, del) : '',
    h('p', { class: 'muted small', style: 'text-align:center' }, `Atajos: ${label(k.save)} guardar · ${label(k.proof)} revisar · ${label(k.play)} escuchar · ${label(k.close)} cerrar`));
  if (isNew) setTimeout(() => front.focus(), 60);
  if (front.value) checkDup();

  const onKey = (e) => {
    if (document.querySelector('[role=dialog]') && !el.closest('[role=dialog]')) return; // a photo/audio editor is open on top
    const a = actionFor(e, ['save', 'proof', 'play', 'close']);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (a === 'save') doSave(); else if (a === 'proof') runProof(); else if (a === 'play') playIt(); else cancel.click();
  };
  document.addEventListener('keydown', onKey, true);
  return () => { document.removeEventListener('keydown', onKey, true); stopPlay(); if (rec.recording) rec.stop(); };
}
