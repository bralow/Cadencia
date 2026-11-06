import { h, iconEl, shuffle, LEVELS } from '../ui.js';
import { db } from '../db.js';
import { getSettings } from '../settings.js';
import { transcribe } from '../ipa.js';
import { Player } from '../audio.js';

// Daily warm-up: 5 short clips; each plays, then you repeat out loud in a timed gap. Twice per clip.
const COUNT = 5, REPS = 2;

export async function render(main) {
  main.append(h('div', { class: 'between' }, h('a', { href: '#/hoy', class: 'pill', style: 'display:flex;align-items:center;text-decoration:none' }, '← Hoy'), h('h1', { style: 'font-size:24px' }, 'Calentamiento')));
  const clips = await db.all('clips');
  if (!clips.length) {
    main.append(h('section', { class: 'card empty' }, h('h2', {}, 'Faltan los clips'), h('p', { class: 'muted small' }, 'Importá el paquete de OpenSLR en Perfil.')));
    return () => {};
  }
  const li = LEVELS.indexOf(getSettings().level);
  let pool = clips.filter((c) => c.text.split(/\s+/).length <= 10 && Math.abs(LEVELS.indexOf(c.level) - li) <= 1);
  if (pool.length < COUNT) pool = clips;
  const set = shuffle(pool).slice(0, COUNT);

  const step = h('span', { class: 'kicker' });
  const sentence = h('p', { class: 'sentence', lang: 'es-AR' });
  const ipa = h('p', { class: 'ipa' });
  const cue = h('p', { style: 'font-family:var(--display);font-size:28px;font-weight:700;text-align:center;min-height:40px', 'aria-live': 'assertive' });
  const ring = h('div', { class: 'progress', style: 'height:10px' });
  const fill = h('div', { style: 'width:0%' });
  ring.append(fill);
  const startBtn = h('button', { type: 'button', class: 'btn' }, iconEl('play'), 'Empezar');
  const card = h('section', { class: 'card', style: 'gap:14px;padding:22px 20px' }, step, sentence, ipa, cue, ring, startBtn);
  main.append(card, h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Cinco frases cortas. Cada una suena y enseguida la repetís en voz alta, sin pensar: es para despertar la boca antes de practicar. Dos vueltas por frase, unos dos minutos.'));

  const player = new Player();
  let cancelled = false, raf = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const playClip = (blob) => new Promise((resolve) => {
    player.load(blob);
    player.el.onended = () => resolve();
    player.el.onerror = () => resolve();
    player.play();
  });
  const countdown = (ms) => new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (cancelled) return resolve();
      const p = Math.min(1, (performance.now() - t0) / ms);
      fill.style.width = `${p * 100}%`;
      if (p < 1) raf = requestAnimationFrame(tick); else resolve();
    };
    raf = requestAnimationFrame(tick);
  });

  async function run() {
    startBtn.hidden = true;
    for (let i = 0; i < set.length && !cancelled; i++) {
      const c = set[i];
      const blob = await db.audioFor(c.id);
      sentence.textContent = c.text; ipa.textContent = transcribe(c.text);
      for (let r = 0; r < REPS && !cancelled; r++) {
        step.textContent = `FRASE ${i + 1} DE ${set.length} · VUELTA ${r + 1}`;
        cue.textContent = 'Escuchá…'; cue.style.color = 'var(--ink)'; fill.style.width = '0%';
        await playClip(blob);
        if (cancelled) break;
        cue.textContent = '¡Tu turno!'; cue.style.color = 'var(--accent)';
        const dur = isFinite(player.el.duration) ? player.el.duration : 3;
        await countdown((dur * 1.3 + 1.2) * 1000);
        await wait(250);
      }
    }
    if (cancelled) return;
    card.replaceChildren(h('span', { class: 'kicker' }, 'LISTO'), h('p', { style: 'font-family:var(--display);font-size:28px;font-weight:700' }, '¡Boca despierta!'),
      h('p', { class: 'muted small' }, 'Ahora sí: a practicar en serio.'),
      h('a', { class: 'btn', href: '#/sombra' }, 'Ir a Sombra'));
  }
  startBtn.onclick = run;
  step.textContent = `${set.length} FRASES`;
  sentence.textContent = 'Preparate para repetir en voz alta.';
  return () => { cancelled = true; cancelAnimationFrame(raf); player.load(null); };
}
