// Image editor (FE-12): crop, lock the aspect ratio, resize and compress a photo so a card stays small.
// openImageEditor(blob) → Promise<Blob|null> (null = cancelled).
import { h } from './ui.js';

const RATIOS = [['Libre', 0], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9]];
const SIZES = [[400, 'Chica'], [640, 'Mediana'], [900, 'Grande']];

export function overlay() {
  const wrap = h('div', { role: 'dialog', 'aria-modal': 'true', style: 'position:fixed;inset:0;z-index:50;background:rgba(10,12,20,.72);display:flex;align-items:flex-end;justify-content:center' });
  const sheet = h('div', { class: 'card', style: 'width:min(560px,100%);max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;gap:12px;padding:16px 16px calc(16px + env(safe-area-inset-bottom))' });
  wrap.append(sheet);
  document.body.append(wrap);
  return { wrap, sheet, close: () => wrap.remove() };
}

export function openImageEditor(blob) {
  return new Promise((resolve) => {
    const { sheet, close } = overlay();
    const url = URL.createObjectURL(blob);
    const img = h('img', { src: url, alt: 'Foto a recortar', draggable: 'false', style: 'display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none;touch-action:none' });
    const box = h('div', { style: 'position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.45);touch-action:none;cursor:move' });
    const handle = h('div', { 'aria-label': 'Cambiar tamaño del recorte', style: 'position:absolute;right:-12px;bottom:-12px;width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid var(--accent);touch-action:none;cursor:nwse-resize' });
    box.append(handle);
    const stage = h('div', { style: 'position:relative;overflow:hidden;border-radius:12px;background:#000;touch-action:none' }, img, box);
    let ratio = 0, size = 640, crop = null; // crop in displayed pixels
    const info = h('span', { class: 'muted small' }, '');

    const W = () => img.clientWidth, H = () => img.clientHeight;
    const paint = () => { Object.assign(box.style, { left: `${crop.x}px`, top: `${crop.y}px`, width: `${crop.w}px`, height: `${crop.h}px` }); };
    const fit = () => {
      const w = W(), ht = H();
      if (!ratio) crop = { x: w * 0.05, y: ht * 0.05, w: w * 0.9, h: ht * 0.9 };
      else { let cw = w * 0.9, ch = cw / ratio; if (ch > ht * 0.9) { ch = ht * 0.9; cw = ch * ratio; } crop = { x: (w - cw) / 2, y: (ht - ch) / 2, w: cw, h: ch }; }
      paint();
    };
    img.onload = () => { fit(); };

    // Dragging: move the box, or resize from the corner (keeping the ratio when locked).
    let drag = null;
    const down = (mode) => (e) => { e.preventDefault(); e.stopPropagation(); drag = { mode, x: e.clientX, y: e.clientY, c: { ...crop } }; e.target.setPointerCapture(e.pointerId); };
    box.addEventListener('pointerdown', down('move'));
    handle.addEventListener('pointerdown', down('size'));
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, c = drag.c;
      if (drag.mode === 'move') crop = { ...c, x: Math.min(Math.max(0, c.x + dx), W() - c.w), y: Math.min(Math.max(0, c.y + dy), H() - c.h) };
      else {
        let w = Math.max(40, Math.min(c.w + dx, W() - c.x)), ht = Math.max(40, Math.min(c.h + dy, H() - c.y));
        if (ratio) { ht = w / ratio; if (c.y + ht > H()) { ht = H() - c.y; w = ht * ratio; } }
        crop = { ...c, w, h: ht };
      }
      paint();
    };
    box.addEventListener('pointermove', move); handle.addEventListener('pointermove', move);
    const up = () => { drag = null; };
    box.addEventListener('pointerup', up); handle.addEventListener('pointerup', up);

    const ratioBtns = RATIOS.map(([l, r]) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px', 'aria-pressed': String(r === ratio) }, l); b.onclick = () => { ratio = r; ratioBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(RATIOS[i][1] === r))); fit(); }; return b; });
    const sizeBtns = SIZES.map(([s, l]) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px', 'aria-pressed': String(s === size) }, `${l} · ${s}px`); b.onclick = () => { size = s; sizeBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(SIZES[i][0] === s))); }; return b; });

    const render = async () => {
      const k = img.naturalWidth / W();
      const sw = crop.w * k, sh = crop.h * k;
      const scale = Math.min(1, size / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
      c.getContext('2d').drawImage(img, crop.x * k, crop.y * k, sw, sh, 0, 0, c.width, c.height);
      const tryType = (type) => new Promise((r) => c.toBlob(r, type, 0.78));
      let out = await tryType('image/webp');
      if (!out || out.type !== 'image/webp') out = await tryType('image/jpeg');
      return out;
    };
    const done = (v) => { URL.revokeObjectURL(url); close(); resolve(v); };
    const cancel = h('button', { type: 'button', class: 'btn ghost', style: 'flex:1' }, 'Cancelar');
    const ok = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, 'Usar foto');
    cancel.onclick = () => done(null);
    ok.onclick = async () => { ok.disabled = true; const out = await render(); info.textContent = `${Math.round(out.size / 1024)} KB`; done(out); };

    sheet.append(h('div', { class: 'between' }, h('b', {}, 'Recortar foto'), info), stage,
      h('span', { class: 'kicker' }, 'PROPORCIÓN'), h('div', { class: 'row wrap', style: 'gap:6px' }, ratioBtns),
      h('span', { class: 'kicker' }, 'TAMAÑO'), h('div', { class: 'row wrap', style: 'gap:6px' }, sizeBtns),
      h('p', { class: 'muted small' }, 'Arrastrá el recuadro para moverlo y el círculo para cambiar su tamaño. La foto se guarda comprimida.'),
      h('div', { class: 'row', style: 'gap:10px' }, cancel, ok));
  });
}
