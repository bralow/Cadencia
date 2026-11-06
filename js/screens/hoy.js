import { h, icon, iconEl, toast } from '../ui.js';
import { db } from '../db.js';
import { getSettings } from '../settings.js';
import { transcribe } from '../ipa.js';
import { Player } from '../audio.js';

// Built-in phrases used until clips are imported.
const PHRASES = [
  ['Che, ¿me pasás la yerba?', 'Hey, can you pass me the yerba?'],
  ['¿Querés que te pase a buscar mañana?', 'Want me to pick you up tomorrow?'],
  ['No te hagás drama, ya lo arreglamos.', 'Don’t make a fuss, we’ll fix it.'],
  ['Vení que te cuento una cosa.', 'Come here, I’ll tell you something.'],
  ['¿Tenés cambio para el colectivo?', 'Do you have change for the bus?'],
  ['Está re lindo el día para unos mates.', 'It’s a really nice day for some mate.'],
  ['Dale, nos vemos a las ocho en la esquina.', 'OK, see you at eight on the corner.'],
];

function dayIndex(n) {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000) % n;
}

export async function render(main) {
  const s = getSettings();
  const date = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  main.append(
    h('div', { class: 'between', style: 'align-items:flex-start' },
      h('div', { style: 'display:flex;flex-direction:column;gap:4px' },
        h('span', { class: 'muted small' }, date.charAt(0).toUpperCase() + date.slice(1)),
        h('h1', {}, '¡Buenas!')),
      h('a', { href: '#/perfil', class: 'pill', style: 'display:flex;align-items:center;text-decoration:none' }, `${s.level} → ${s.goal}`)),
    h('div', { html: icon.flourish }));

  const clipCount = await db.count('clips');
  main.append(h('section', { class: 'hero' },
    h('div', { class: 'flourish', html: icon.corner }),
    h('span', { class: 'kicker' }, 'SOMBRA DEL DÍA'),
    h('h2', { style: 'font-size:24px;line-height:1.15' }, clipCount ? '10 frases porteñas' : 'Sumá tus primeros clips'),
    h('p', { style: 'font-size:14px;line-height:1.45;max-width:260px' }, clipCount
      ? 'Escuchá, grabá tu voz y comparala con la nativa, onda por onda.'
      : 'Importá el paquete de audios de OpenSLR desde Perfil para empezar.'),
    h('a', { class: 'btn', href: clipCount ? '#/sombra' : '#/perfil', style: 'align-self:flex-start;margin-top:6px' }, clipCount ? 'Empezar' : 'Ir a Perfil', iconEl('next'))));

  main.append(h('section', { class: 'card' },
    h('div', { class: 'between' }, h('h2', {}, 'Vos en 2 minutos'), h('a', { href: '#/vos', style: 'font-weight:700;font-size:14px;text-decoration:none;min-height:44px;display:flex;align-items:center' }, 'Practicar →')),
    h('p', { class: 'muted small' }, 'tenés, querés, vení, decime: dejá el tú atrás.')));

  // Phrase of the day: an imported clip if there are any, else a built-in phrase.
  let text, back = '', blob = null;
  if (clipCount) {
    const clips = await db.all('clips');
    const short = clips.filter((c) => c.text.split(/\s+/).length <= 9);
    const pick = (short.length ? short : clips)[dayIndex(short.length || clips.length)];
    text = pick.text; blob = await db.audioFor(pick.id);
  } else {
    [text, back] = PHRASES[dayIndex(PHRASES.length)];
  }
  const ipa = h('p', { class: 'ipa', hidden: true }, transcribe(text));
  const ipaBtn = h('button', { type: 'button', class: 'pill' }, 'Ver IPA');
  ipaBtn.onclick = () => { ipa.hidden = !ipa.hidden; ipaBtn.textContent = ipa.hidden ? 'Ver IPA' : 'Ocultar IPA'; };
  const player = new Player();
  player.load(blob);
  const play = h('button', { type: 'button', class: 'round native', style: 'width:44px;height:44px', 'aria-label': 'Escuchar la frase', disabled: !blob }, iconEl('play'));
  play.onclick = () => player.play();
  const save = h('button', { type: 'button', class: 'pill' }, 'Guardar');
  save.onclick = async () => { await db.put('mazo', { front: text, ipa: transcribe(text), back, tag: '#FraseDelDía', audio: blob || undefined, created: Date.now() }); toast('Guardado en el Mazo'); };
  main.append(h('section', { class: 'card', style: 'gap:8px' },
    h('span', { class: 'kicker' }, 'FRASE DEL DÍA'),
    h('p', { class: 'sentence', style: 'font-size:22px', lang: 'es-AR' }, text),
    ipa,
    back ? h('p', { class: 'muted small' }, back) : null,
    h('div', { class: 'row', style: 'margin-top:4px' }, play, ipaBtn, save)));

  return () => player.load(null);
}
