// Practice that doesn't touch the schedule (FE-18 quiz mode, the vault, the crossword), and the numbers for Estadísticas.
import { db } from './db.js';
import { retrievability } from './fsrs.js';

const DAY = 86400000;
export const SETS = {
  debiles: { name: 'Débiles', help: 'las que más fallaste' },
  olvidar: { name: 'A punto de olvidar', help: 'las que FSRS cree que se te están yendo' },
  boveda: { name: 'Bóveda', help: 'las que pasaron a la bóveda' },
  todo: { name: 'Un mazo', help: 'mezcladas, de un mazo' },
};

// Recall chance right now (0..1) for a reviewed card; new cards count as 0.
export function recallNow(c, now = Date.now()) {
  if (!c.s || !c.last) return 0;
  return retrievability(Math.max(0, (now - c.last) / DAY), c.s);
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Up to n cards for a practice set, one card per saved word so siblings don't give each other away.
export async function practiceSet(set, n = 20, deck = null) {
  let all = await db.all('cards');
  if (deck) all = all.filter((c) => c.deck === deck);
  let list;
  if (set === 'boveda') list = all.filter((c) => c.suspended === 'leech').sort((a, b) => (b.lapses || 0) - (a.lapses || 0));
  else if (set === 'debiles') list = all.filter((c) => c.suspended !== 'mastered' && (c.lapses || 0) > 0).sort((a, b) => (b.lapses || 0) - (a.lapses || 0) || (a.s || 0) - (b.s || 0));
  else if (set === 'olvidar') { const now = Date.now(); list = all.filter((c) => !c.suspended && c.state && c.state !== 'new').sort((a, b) => recallNow(a, now) - recallNow(b, now)); }
  else list = shuffle(all.filter((c) => c.suspended !== 'leech'));
  const seen = new Set(), out = [];
  for (const c of list) { if (seen.has(c.note)) continue; seen.add(c.note); out.push(c); if (out.length >= n) break; }
  return set === 'todo' ? out : shuffle(out);
}

// --- Numbers for Estadísticas
export async function stats(now = Date.now()) {
  const [cards, log, decks] = await Promise.all([db.all('cards'), db.all('revlog'), db.all('decks')]);
  const sod = new Date(now); sod.setHours(0, 0, 0, 0);
  const today = sod.getTime();
  const ago = (t) => Math.floor((today - new Date(t).setHours(0, 0, 0, 0)) / DAY); // 0 today, 1 yesterday
  const count = { total: cards.length, fresh: 0, learning: 0, young: 0, mature: 0, vault: 0, mastered: 0 };
  for (const c of cards) {
    if (c.suspended === 'leech') count.vault++;
    else if (c.suspended === 'mastered') count.mastered++;
    else if (!c.state || c.state === 'new') count.fresh++;
    else if (c.state !== 'review') count.learning++;
    else if ((c.s || 0) >= 21) count.mature++;
    else count.young++;
  }
  // Reviews per day, last 30 days (index 0 = 29 days ago … 29 = today).
  const perDay = Array.from({ length: 30 }, () => ({ n: 0, pass: 0 }));
  for (const r of log) { const a = ago(r.ts); if (a >= 0 && a < 30) { perDay[29 - a].n++; if (r.pass) perDay[29 - a].pass++; } }
  // Due in the next 14 days (index 0 = today, including overdue).
  const forecast = Array(14).fill(0);
  for (const c of cards) {
    if (c.suspended || !c.due || c.state === 'new') continue;
    const a = Math.max(0, -ago(c.due));
    if (a < 14) forecast[a]++;
  }
  const rate = (days) => { const xs = log.filter((r) => ago(r.ts) < days && r.state === 'review'); return xs.length ? { pct: Math.round((xs.filter((r) => r.pass).length / xs.length) * 100), n: xs.length } : null; };
  // Recall speed per deck: median seconds on the reviews you passed (last 30 days).
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const names = new Map(decks.map((d) => [d.id, d]));
  const byDeck = new Map();
  for (const r of log) {
    if (!r.pass || !r.ms || ago(r.ts) >= 30) continue;
    if (!byDeck.has(r.deck)) byDeck.set(r.deck, []);
    byDeck.get(r.deck).push(r.ms);
  }
  const speed = [...byDeck].map(([id, ms]) => ({ deck: names.get(id)?.name || 'Sin mazo', color: names.get(id)?.color, sec: median(ms) / 1000, n: ms.length })).sort((a, b) => a.sec - b.sec);
  // Accuracy by card type (last 30 days).
  const byType = {};
  for (const r of log) { if (ago(r.ts) >= 30) continue; const t = byType[r.type] || (byType[r.type] = { n: 0, pass: 0 }); t.n++; if (r.pass) t.pass++; }
  // Streak: consecutive days with at least one review, ending today or yesterday.
  const days = new Set(log.map((r) => ago(r.ts)));
  let streak = 0; for (let d = days.has(0) ? 0 : 1; days.has(d); d++) streak++;
  return { count, perDay, forecast, week: rate(7), month: rate(30), speed, byType, streak, totalReviews: log.length };
}
