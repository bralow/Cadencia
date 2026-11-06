import { h } from '../ui.js';
import { transcribe } from '../ipa.js';

// Phase 1 preview: type any Spanish text and see it in Rioplatense IPA.
export async function render(main) {
  main.append(h('h1', {}, 'Leer'));
  const input = h('textarea', { id: 'txt', rows: '4', style: 'width:100%;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:12px 14px;font-family:var(--display);font-size:18px;line-height:1.5;resize:vertical' });
  input.value = 'Che, ¿vamos a tomar unos mates a la plaza? Si llueve, nos quedamos en casa.';
  const out = h('p', { class: 'ipa', style: 'font-size:17px;line-height:1.7' });
  const update = () => { out.textContent = input.value.trim() ? transcribe(input.value) : ''; };
  input.oninput = update;
  update();
  main.append(
    h('section', { class: 'card' }, h('label', { for: 'txt', class: 'small', style: 'font-weight:600' }, 'Escribí o pegá un texto'), input),
    h('section', { class: 'card' }, h('span', { class: 'kicker' }, 'EN IPA RIOPLATENSE'), out),
    h('p', { class: 'muted small' }, 'Próxima entrega: tocar cada palabra para ver sílabas, sonidos y abrirla en el DLE.'));
}
