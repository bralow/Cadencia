// FSRS-5 scheduling with a two-button answer (Fail = grade 1 "Again", Pass = grade 3 "Good").
// A card's memory is two numbers: stability (days until recall drops to 90%) and difficulty (1-10).
// New and forgotten cards first go through short same-day steps before getting a long interval.

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81;
const MIN = 60000, DAY = 86400000;

export const DEFAULTS = { retention: 0.9, maxDays: 180, learnSteps: [1, 10], relearnSteps: [10], leech: 6, mastery: 8 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const initS = (g) => Math.max(W[g - 1], 0.1);
const initD = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
export const retrievability = (elapsedDays, s) => Math.pow(1 + FACTOR * elapsedDays / s, DECAY);

function nextD(d, g) {
  const delta = -W[6] * (g - 3);
  const d1 = d + delta * (10 - d) / 9;
  return clamp(W[7] * initD(4) + (1 - W[7]) * d1, 1, 10);
}
function successS(s, d, r) {
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) + 1);
}
function lapseS(s, d, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}
const shortTermS = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

// Days until recall falls to the target retention, with a little randomness so cards learned
// together don't all come back on the same day.
function intervalDays(s, opts, card) {
  const raw = (s / FACTOR) * (Math.pow(opts.retention, 1 / DECAY) - 1);
  let days = Math.max(1, Math.round(raw));
  if (days > 2) {
    const seed = [...String(card.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, card.reps || 1);
    days = Math.round(days * (0.95 + (seed % 100) / 1000));
  }
  return Math.min(opts.maxDays, Math.max(1, days));
}

// Returns the updated card (a new object). pass: true / false. now: ms.
export function answer(card, pass, now = Date.now(), opts = DEFAULTS) {
  const g = pass ? 3 : 1;
  const c = { ...card, reps: (card.reps || 0) + 1, last: now, updated: now };
  const elapsed = card.last ? (now - card.last) / DAY : 0;

  if (!card.state || card.state === 'new') {
    c.s = initS(g); c.d = initD(g);
    c.state = 'learn'; c.step = pass ? 1 : 0;
    if (c.step >= opts.learnSteps.length) return graduate(c, opts, now);
    c.due = now + opts.learnSteps[c.step] * MIN;
    return c;
  }

  if (card.state === 'learn' || card.state === 'relearn') {
    c.s = shortTermS(card.s, g); c.d = nextD(card.d, g);
    const steps = card.state === 'learn' ? opts.learnSteps : opts.relearnSteps;
    if (!pass) { c.step = 0; c.due = now + steps[0] * MIN; return c; }
    c.step = (card.step || 0) + 1;
    if (c.step >= steps.length) return graduate(c, opts, now);
    c.due = now + steps[c.step] * MIN;
    return c;
  }

  // Review
  const r = retrievability(Math.max(0, elapsed), card.s);
  c.d = nextD(card.d, g);
  if (pass) {
    c.s = successS(card.s, card.d, r);
    c.passStreak = (card.passStreak || 0) + 1;
    c.due = now + intervalDays(c.s, opts, c) * DAY;
    c.state = 'review';
    if (opts.mastery && c.passStreak >= opts.mastery) c.suspended = 'mastered';
    return c;
  }
  c.s = lapseS(card.s, card.d, r);
  c.lapses = (card.lapses || 0) + 1;
  c.passStreak = 0;
  c.state = 'relearn'; c.step = 0;
  c.due = now + opts.relearnSteps[0] * MIN;
  if (opts.leech && c.lapses >= opts.leech) c.suspended = 'leech';
  return c;
}

function graduate(c, opts, now) {
  c.state = 'review'; c.step = 0;
  c.due = now + intervalDays(c.s, opts, c) * DAY;
  return c;
}

// What each button would do, for showing "10 min" / "6 días" on the buttons.
export function preview(card, now = Date.now(), opts = DEFAULTS) {
  const f = answer(card, false, now, opts), p = answer(card, true, now, opts);
  return { fail: f.due - now, pass: p.due - now };
}
export function human(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d} día${d === 1 ? '' : 's'}`;
  const mo = Math.round(d / 30);
  return `${mo} mes${mo === 1 ? '' : 'es'}`;
}
