const KEY = 'cadencia.settings';
const DEFAULTS = { level: 'B1', goal: 'C1', speed: '0.75', theme: 'system' };

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  if (key === 'theme') applyTheme();
  return s;
}

const media = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const { theme } = getSettings();
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
media.addEventListener('change', applyTheme);
