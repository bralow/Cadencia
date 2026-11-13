// Keyboard shortcuts for reviews and the card editor (FE-04). Each action has a key you can change.
const KEY = 'penumbra.keys';

export const ACTIONS = {
  // Reviews
  show: { label: 'Mostrar respuesta / comprobar', group: 'Repaso', key: ' ' },
  fail: { label: 'Fallé', group: 'Repaso', key: '1' },
  pass: { label: 'Pasé', group: 'Repaso', key: '2' },
  suggested: { label: 'Aceptar la nota sugerida', group: 'Repaso', key: 'Enter' },
  replay: { label: 'Escuchar de nuevo', group: 'Repaso', key: 'r' },
  slow: { label: 'Escuchar lento', group: 'Repaso', key: 's' },
  edit: { label: 'Editar esta tarjeta', group: 'Repaso', key: 'e' },
  quit: { label: 'Terminar el repaso', group: 'Repaso', key: 'Escape' },
  // Editor
  save: { label: 'Guardar', group: 'Editor', key: 'Ctrl+s' },
  proof: { label: 'Revisar con IA', group: 'Editor', key: 'Ctrl+k' },
  play: { label: 'Escuchar la tarjeta', group: 'Editor', key: 'Ctrl+p' },
  close: { label: 'Cerrar sin guardar', group: 'Editor', key: 'Escape' },
};

export function keys() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
  const out = {};
  for (const [a, d] of Object.entries(ACTIONS)) out[a] = saved[a] || d.key;
  return out;
}
export function setKey(action, combo) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
  if (combo === null) delete saved[action]; else saved[action] = combo;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}
export function resetKeys() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

// "Ctrl+s", "Shift+Enter", " " …
export function comboOf(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && e.key.length > 1 && 'Shift', k].filter(Boolean).join('+');
}
export function label(combo) {
  return String(combo).replace(/^ $|\+ $/, (m) => m.replace(' ', 'Espacio')).replace('Escape', 'Esc').replace('ArrowLeft', '←').replace('ArrowRight', '→');
}
// Which action this key press is, among the given ones.
export function actionFor(e, among) {
  const c = comboOf(e);
  if (!c) return null;
  const k = keys();
  return among.find((a) => k[a] === c) || null;
}
