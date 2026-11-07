// The sounds of Rioplatense Spanish (broad IPA), for the soundboard and the games.
// ar: true = a sound that marks the Buenos Aires accent.
export const SOUNDS = [
  // Vowels
  { s: 'a', group: 'Vocales', name: 'a abierta', how: 'Boca bien abierta, lengua baja y relajada. Nunca se reduce como en inglés.', ex: ['casa', 'mate', 'pan'] },
  { s: 'e', group: 'Vocales', name: 'e media', how: 'Labios estirados, lengua a media altura. Pura, sin deslizarse a "ei".', ex: ['mesa', 'leche', 'tenés'] },
  { s: 'i', group: 'Vocales', name: 'i cerrada', how: 'Lengua alta y adelante, labios estirados. Corta y tensa.', ex: ['vino', 'mirá', 'sí'] },
  { s: 'o', group: 'Vocales', name: 'o media', how: 'Labios redondeados, lengua atrás. Pura, sin deslizarse a "ou".', ex: ['todo', 'dos', 'boludo'] },
  { s: 'u', group: 'Vocales', name: 'u cerrada', how: 'Labios bien redondos y adelantados, lengua alta y atrás.', ex: ['uno', 'gusto', 'tú'] },
  { s: 'j', group: 'Vocales', name: 'semivocal i', how: 'Una i débil que se pega a otra vocal en la misma sílaba (diptongo).', ex: ['tierra', 'bien', 'hoy'] },
  { s: 'w', group: 'Vocales', name: 'semivocal u', how: 'Una u débil que se pega a otra vocal en la misma sílaba.', ex: ['bueno', 'cuatro', 'llueve'] },
  // Stops
  { s: 'p', group: 'Oclusivas', name: 'p sin aire', how: 'Labios cerrados y se abren de golpe, sin el soplo de aire del inglés "p".', ex: ['pan', 'papá', 'pibe'] },
  { s: 'b', group: 'Oclusivas', name: 'b fuerte', how: 'Labios cerrados del todo. Al principio de frase o después de m/n. B y v suenan igual.', ex: ['bondi', 'vos', 'un vaso'] },
  { s: 't', group: 'Oclusivas', name: 't dental', how: 'La punta de la lengua toca los dientes de arriba (no las encías), sin soplo de aire.', ex: ['tango', 'todo', 'tenés'] },
  { s: 'd', group: 'Oclusivas', name: 'd fuerte', how: 'Punta de la lengua contra los dientes. Al principio de frase o después de n/l.', ex: ['dale', 'donde', 'el dedo'] },
  { s: 'k', group: 'Oclusivas', name: 'k sin aire', how: 'Atrás de la lengua contra el paladar blando, sin soplo. Se escribe c, qu o k.', ex: ['casa', 'que', 'kilo'] },
  { s: 'g', group: 'Oclusivas', name: 'g fuerte', how: 'Como la k pero con voz. Al principio de frase o después de n.', ex: ['gato', 'tengo', 'un gol'] },
  // Fricatives
  { s: 'β', group: 'Fricativas', name: 'b suave', how: 'Entre vocales la b/v no cierra los labios: casi se tocan y el aire pasa.', ex: ['la vaca', 'cabeza', 'lobo'] },
  { s: 'ð', group: 'Fricativas', name: 'd suave', how: 'Entre vocales la d es suave, la lengua apenas toca los dientes, como "th" en "this".', ex: ['todo', 'nada', 'cada'] },
  { s: 'ɣ', group: 'Fricativas', name: 'g suave', how: 'Entre vocales la g no cierra: el aire pasa raspando suave atrás.', ex: ['agua', 'lago', 'la gata'] },
  { s: 'f', group: 'Fricativas', name: 'f', how: 'Dientes de arriba sobre el labio de abajo, como en inglés.', ex: ['feca', 'fiaca', 'café'] },
  { s: 's', group: 'Fricativas', name: 's', how: 'Siempre s, nunca la "z" española: casa, cena y zapato llevan [s] (seseo).', ex: ['sí', 'cena', 'zapato'] },
  { s: 'h', group: 'Fricativas', name: 's aspirada', ar: true, how: 'La s antes de consonante se convierte en un soplo suave, como una h inglesa: e[h]tá, lo[h] pibe[h].', ex: ['está', 'mismo', 'los pibes'] },
  { s: 'x', group: 'Fricativas', name: 'jota', how: 'Atrás de la lengua cerca del paladar blando, el aire raspa. Más suave que la jota de España.', ex: ['jugo', 'gente', 'mujer'] },
  { s: 'ʃ', group: 'Fricativas', name: 'sh porteña', ar: true, how: 'La ll y la y suenan como "sh" en inglés: calle = [ˈka.ʃe]. En voces mayores puede sonar [ʒ], con voz.', ex: ['calle', 'yo', 'lluvia'] },
  // Affricate
  { s: 'tʃ', group: 'Africadas', name: 'ch', how: 'Como "ch" en "church". Ojo: la ch NO se convierte en sh, solo la ll/y.', ex: ['che', 'chabón', 'leche'] },
  // Nasals
  { s: 'm', group: 'Nasales', name: 'm', how: 'Labios cerrados, el aire por la nariz. La n antes de p/b/m también suena m.', ex: ['mate', 'mina', 'un beso'] },
  { s: 'n', group: 'Nasales', name: 'n', how: 'Punta de la lengua detrás de los dientes, el aire por la nariz.', ex: ['nada', 'noche', 'pan'] },
  { s: 'ɲ', group: 'Nasales', name: 'ñ', how: 'El medio de la lengua contra el paladar, el aire por la nariz.', ex: ['año', 'mañana', 'ñoqui'] },
  { s: 'ŋ', group: 'Nasales', name: 'n velar', how: 'La n antes de k, g o j se hace atrás, como "ng" en "sing".', ex: ['tengo', 'banco', 'en casa'] },
  { s: 'ɱ', group: 'Nasales', name: 'n labiodental', how: 'La n antes de f se hace con los dientes sobre el labio, como la f.', ex: ['enfermo', 'un feca', 'lunfardo'] },
  // Liquids
  { s: 'l', group: 'Líquidas', name: 'l clara', how: 'Punta de la lengua detrás de los dientes, siempre clara (nunca la "l oscura" del inglés "ball").', ex: ['luca', 'mal', 'el'] },
  { s: 'ɾ', group: 'Líquidas', name: 'r suave', how: 'Un solo toque rápido de la punta de la lengua, como la "tt" de "butter" en inglés americano.', ex: ['pero', 'caro', 'hablar'] },
  { s: 'r', group: 'Líquidas', name: 'rr fuerte', how: 'Varios golpes de la lengua: rr, r al principio de palabra, y r después de n, l o s.', ex: ['perro', 'rápido', 'Enrique'] },
];

// Symbols that are easy to confuse, used as traps in the "Escribir" game.
export const CONFUSABLE = { 'ɾ': ['r', 'l'], r: ['ɾ'], b: ['β', 'v'], 'β': ['b'], d: ['ð'], 'ð': ['d', 'θ'], g: ['ɣ'], 'ɣ': ['g'], 'ʃ': ['ʝ', 'tʃ', 'j'], h: ['s', 'x'], s: ['h', 'θ', 'z'], x: ['h', 'k'], 'ɲ': ['n'], n: ['ɲ', 'ŋ'], 'ŋ': ['n'], j: ['i', 'ʝ'], w: ['u'], 'tʃ': ['ʃ'], e: ['ɛ'], o: ['ɔ'] };

// Word bank for the games: everyday words that show off the porteño sounds.
export const WORDS = ['calle', 'lluvia', 'ayer', 'mismo', 'después', 'ciudad', 'perro', 'pero', 'niño', 'mañana', 'colectivo', 'estadio', 'gente', 'joven',
  'trabajo', 'cerveza', 'chico', 'ella', 'playa', 'yo', 'tenés', 'querés', 'vení', 'decime', 'pibe', 'laburo', 'quilombo', 'bondi', 'guita', 'fiaca',
  'birra', 'feca', 'pucho', 'boludo', 'mate', 'yerba', 'cuchillo', 'llave', 'estás', 'buscar', 'mosca', 'rápido', 'agua', 'cada', 'tengo', 'banco',
  'enfermo', 'jugo', 'lunfardo', 'arroyo', 'pollo', 'gallina', 'caballo', 'cebolla', 'castellano', 'mayo'];
