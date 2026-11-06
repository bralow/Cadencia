// Tongue twisters by target sound. "trad" = traditional (public domain); "cadencia" = written for this app.
// mark: regex for the letters that carry the target sound (highlighted in the text).
export const TRABAS = [
  { id: 'rr', sound: 'rr [r]', title: 'La erre fuerte', src: 'trad', mark: /rr|\br/gi,
    text: 'Erre con erre cigarro, erre con erre barril, rápido ruedan los carros cargados de azúcar del ferrocarril.' },
  { id: 'tr', sound: 'tr [tɾ]', title: 'Tr sin trabarse', src: 'trad', mark: /tr/gi,
    text: 'Tres tristes tigres tragaban trigo en un trigal.' },
  { id: 'cl', sound: 'pl, cl [pl] [kl]', title: 'Grupos con l', src: 'trad', mark: /cl|pl|bl/gi,
    text: 'Pablito clavó un clavito. ¿Qué clavito clavó Pablito?' },
  { id: 'll', sound: 'll, y [ʃ]', title: 'Yeísmo porteño', src: 'cadencia', mark: /ll|y(?=[aeiouáéíóú])/gi,
    text: 'Ayer llovió en la playa y la yegua amarilla se cayó en el arroyo de la calle Yerbal.' },
  { id: 'll2', sound: 'll, y [ʃ]', title: 'Llaves y llamadas', src: 'cadencia', mark: /ll|y(?=[aeiouáéíóú])/gi,
    text: 'Yo llevo la llave del llavero, y vos llamás a Yolanda que ya llegó.' },
  { id: 's', sound: 's → [h]', title: 'La s aspirada', src: 'cadencia', mark: /s(?=\s*[bcdfgjklmnpqrstvyz])/gi,
    text: 'Los mismos pescados frescos están en esta mesa desde las doce.' },
  { id: 'ladrillo', sound: 'dr, ll [dɾ] [ʃ]', title: 'El cielo enladrillado', src: 'trad', mark: /dr|ll/gi,
    text: 'El cielo está enladrillado, ¿quién lo desenladrillará? El desenladrillador que lo desenladrille, buen desenladrillador será.' },
  { id: 'cp', sound: 'k, p', title: 'Pocas copas', src: 'trad', mark: /c(?=[oa])|p/gi,
    text: 'Compré pocas copas, pocas copas compré, y como compré pocas copas, pocas copas pagaré.' },
  { id: 'ene', sound: 'ñ [ɲ]', title: 'La eñe', src: 'cadencia', mark: /ñ/gi,
    text: 'La niña ñoña se baña con su muñeca en la bañera cada mañana.' },
  { id: 'b', sound: 'b, v [b] [β]', title: 'B fuerte y b suave', src: 'cadencia', mark: /b|v/gi,
    text: 'Bárbara viaja en barco a Buenos Aires y vuelve en bondi a la villa.' },
  { id: 'd', sound: 'd [d] [ð]', title: 'D fuerte y d suave', src: 'cadencia', mark: /d/gi,
    text: 'Dedos, dados y dudas: ¿dónde dejaste el dado del dedal?' },
  { id: 'jota', sound: 'j, g [x]', title: 'La jota', src: 'cadencia', mark: /j|g(?=[eiéí])/gi,
    text: 'Jorge junta jarras de jugo y ginebra en el jardín de Javier.' },
];

// Target speeds in syllables per second for each speed level.
export const PACE = { '0.6': 3.3, '1': 5.5, '1.25': 6.9 };
