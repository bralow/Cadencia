const KEY = 'cadencia.settings';
const DEFAULTS = { level: 'B1', goal: 'C1', speed: '0.75', theme: 'dark', accent: 'azul', density: 'comoda', name: '', hoyHidden: [], goals: { reviews: 30, streak: 30 } };

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  if (['theme', 'accent', 'density'].includes(key)) applyTheme();
  return s;
}

const media = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const { theme, accent, density } = getSettings();
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = accent || 'azul';
  root.dataset.density = density || 'comoda';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#000000' : '#F6F6F8';
}
media.addEventListener('change', applyTheme);
