// Minimal pairs for ear training. Each pair differs in exactly one sound or in stress.
export const CONTRASTS = [
  {
    id: 'rr', label: 'r / rr', title: 'r suave o rr fuerte',
    note: 'La r simple [ɾ] es un solo toque rápido de la lengua. La rr [r] (y la r al principio de palabra) vibra varias veces.',
    pairs: [['pero', 'perro'], ['caro', 'carro'], ['para', 'parra'], ['cero', 'cerro'], ['coro', 'corro'], ['foro', 'forro'],
      ['moro', 'morro'], ['ahora', 'ahorra'], ['pera', 'perra'], ['vara', 'barra'], ['hiero', 'hierro'], ['corea', 'correa'], ['enterado', 'enterrado']],
  },
  {
    id: 'acento', label: 'Acento', title: 'dónde cae la fuerza',
    note: 'Mismas letras, otra sílaba fuerte: la tilde cambia el significado, y en los verbos muchas veces cambia el tiempo (paso = yo, ahora; pasó = él, ayer).',
    pairs: [['esta', 'está'], ['paso', 'pasó'], ['papa', 'papá'], ['sabia', 'sabía'], ['hablo', 'habló'], ['termino', 'terminó'],
      ['practico', 'practicó'], ['canto', 'cantó'], ['tomo', 'tomó'], ['llego', 'llegó'], ['miro', 'miró'], ['trabajo', 'trabajó'],
      ['continuo', 'continuó'], ['publico', 'publicó'], ['ingles', 'inglés'], ['secretaria', 'secretaría'], ['animo', 'ánimo']],
  },
  {
    id: 'ene', label: 'n / ñ', title: 'n o ñ',
    note: 'Para la ñ [ɲ] apoyás el medio de la lengua contra el paladar; para la n [n] solo la punta, detrás de los dientes.',
    pairs: [['pena', 'peña'], ['una', 'uña'], ['sueno', 'sueño'], ['cana', 'caña'], ['mono', 'moño'], ['pina', 'piña'],
      ['lena', 'leña'], ['mana', 'maña'], ['cena', 'seña']],
  },
];
