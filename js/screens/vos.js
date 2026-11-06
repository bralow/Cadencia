import { h } from '../ui.js';
import { practiceTabs } from './sombra.js';

export async function render(main) {
  main.append(h('div', { class: 'between' }, practiceTabs('vos')));
  main.append(h('section', { class: 'card empty' },
    h('h2', {}, 'El entrenador de vos'),
    h('p', { class: 'muted small' }, 'Llega en la próxima entrega: presente, imperativo y subjuntivo, con el tú tachado al lado.')));
}
