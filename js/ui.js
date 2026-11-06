// Tiny DOM helpers.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v; // only for our own static SVG strings
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const icon = {
  play: '<svg class="fill" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg class="fill" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  stop: '<svg class="fill" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  flourish: '<svg width="140" height="16" viewBox="0 0 140 16" aria-hidden="true"><path d="M4 8 C 12 0, 24 0, 24 8 S 14 15, 12 9 M24 8 H116 M136 8 C 128 0, 116 0, 116 8 S 126 15, 128 9" stroke="#C99A2E" stroke-width="1.5"/><circle cx="70" cy="8" r="3" fill="#B5482A" stroke="none"/></svg>',
  corner: '<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><path d="M68 4 C 40 4, 30 14, 30 34 C 30 46, 40 50, 46 44 C 52 38, 46 30, 40 34 M68 4 C 68 30, 58 40, 40 42" stroke="#C99A2E" stroke-width="1.5"/><circle cx="58" cy="16" r="3" fill="#C99A2E" stroke="none"/></svg>',
};

export function iconEl(name) {
  const span = document.createElement('span');
  span.innerHTML = icon[name];
  span.style.display = 'contents';
  return span;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
