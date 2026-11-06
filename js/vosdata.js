// Verb bank for the vos trainer.
// tu: tú present · tuImp: tú imperative (null = rarely used) · subj: standard subjunctive
// subjVos: voseante subjunctive also heard in Buenos Aires · s: example sentences (___ = blank)
export const VERBS = [
  { inf: 'tener', en: 'to have', tu: 'tienes', tuImp: 'ten', subj: 'tengas', subjVos: 'tengás', s: { pres: 'Vos ___ razón, che.', imp: '___ paciencia, ya llega el bondi.', subj: 'Ojalá que ___ suerte mañana.' } },
  { inf: 'querer', en: 'to want', tu: 'quieres', tuImp: null, subj: 'quieras', subjVos: 'querás', s: { pres: '¿___ un café?', subj: 'No sé si ___ venir con nosotros.' } },
  { inf: 'poder', en: 'can, to be able', tu: 'puedes', tuImp: null, subj: 'puedas', subjVos: 'podás', s: { pres: '¿___ ayudarme con esto?', subj: 'Ojalá que ___ venir el sábado.' } },
  { inf: 'venir', en: 'to come', tu: 'vienes', tuImp: 'ven', subj: 'vengas', subjVos: 'vengás', s: { pres: '¿A qué hora ___ mañana?', imp: '¡___ acá un segundo!', subj: 'Quiero que ___ a la fiesta.' } },
  { inf: 'decir', en: 'to say', tu: 'dices', tuImp: 'di', subj: 'digas', subjVos: 'digás', s: { pres: '¿Qué ___? No te escuché.', imp: '___ lo que pensás.', subj: 'No quiero que le ___ nada.' } },
  { inf: 'hacer', en: 'to do, to make', tu: 'haces', tuImp: 'haz', subj: 'hagas', subjVos: 'hagás', s: { pres: '¿Qué ___ este finde?', imp: '___ lo que quieras.', subj: 'Es importante que ___ la tarea.' } },
  { inf: 'poner', en: 'to put', tu: 'pones', tuImp: 'pon', subj: 'pongas', subjVos: 'pongás', s: { pres: '¿Dónde ___ las llaves?', imp: '___ la pava, que tomamos mate.', subj: 'Prefiero que ___ música tranqui.' } },
  { inf: 'salir', en: 'to go out', tu: 'sales', tuImp: 'sal', subj: 'salgas', subjVos: 'salgás', s: { pres: '¿Con quién ___ esta noche?', imp: '___ un rato, te va a hacer bien.', subj: 'Ojalá que ___ temprano del laburo.' } },
  { inf: 'ser', en: 'to be', tu: 'eres', tuImp: 'sé', subj: 'seas', subjVos: 'seás', vos: 'sos', vosImp: 'sé', s: { pres: 'Vos ___ de Rosario, ¿no?', imp: '___ bueno con tu hermano.', subj: 'No importa que ___ nuevo acá.' } },
  { inf: 'ir', en: 'to go', tu: 'vas', tuImp: 've', subj: 'vayas', subjVos: 'vayás', vos: 'vas', vosImp: 'andá', s: { pres: '¿Cuándo ___ al centro?', imp: '___ a comprar pan.', subj: 'Quiero que ___ al médico.' } },
  { inf: 'hablar', en: 'to speak', tu: 'hablas', tuImp: 'habla', subj: 'hables', subjVos: 'hablés', s: { pres: '___ muy bien castellano.', imp: '___ más despacio, por favor.', subj: 'Espero que ___ con ella.' } },
  { inf: 'comer', en: 'to eat', tu: 'comes', tuImp: 'come', subj: 'comas', subjVos: 'comás', s: { pres: '¿___ carne?', imp: '___ algo antes de salir.', subj: 'No quiero que ___ tanto dulce.' } },
  { inf: 'vivir', en: 'to live', tu: 'vives', tuImp: 'vive', subj: 'vivas', subjVos: 'vivás', s: { pres: '¿Dónde ___ ahora?', imp: '___ el momento.', subj: 'Ojalá que ___ cerca.' } },
  { inf: 'dormir', en: 'to sleep', tu: 'duermes', tuImp: 'duerme', subj: 'duermas', subjVos: 'durmás', s: { pres: '¿Cuántas horas ___?', imp: '___ un poco, estás muerto.', subj: 'Necesito que ___ bien hoy.' } },
  { inf: 'pensar', en: 'to think', tu: 'piensas', tuImp: 'piensa', subj: 'pienses', subjVos: 'pensés', s: { pres: '¿Qué ___ de esto?', imp: '___ antes de hablar.', subj: 'No quiero que ___ mal de mí.' } },
  { inf: 'contar', en: 'to tell, to count', tu: 'cuentas', tuImp: 'cuenta', subj: 'cuentes', subjVos: 'contés', s: { pres: '¿Me ___ qué pasó?', imp: '___ hasta diez.', subj: 'Espero que me ___ todo.' } },
  { inf: 'jugar', en: 'to play', tu: 'juegas', tuImp: 'juega', subj: 'juegues', subjVos: 'jugués', s: { pres: '¿___ al fútbol los domingos?', imp: '___ conmigo un rato.', subj: 'Quiero que ___ en mi equipo.' } },
  { inf: 'sentir', en: 'to feel', tu: 'sientes', tuImp: null, subj: 'sientas', subjVos: 'sintás', s: { pres: '¿Cómo te ___ hoy?', subj: 'No quiero que te ___ solo.' } },
  { inf: 'pedir', en: 'to ask for, to order', tu: 'pides', tuImp: 'pide', subj: 'pidas', subjVos: 'pidás', s: { pres: '¿Qué ___ para comer?', imp: '___ la cuenta, por favor.', subj: 'Es mejor que ___ ayuda.' } },
  { inf: 'saber', en: 'to know', tu: 'sabes', tuImp: null, subj: 'sepas', subjVos: 'sepás', s: { pres: '¿___ dónde queda la parada?', subj: 'Quiero que ___ la verdad.' } },
];

const ACCENT = { a: 'á', e: 'é', i: 'í' };

export function vosPresent(v) {
  if (v.vos) return v.vos;
  const stem = v.inf.slice(0, -2), end = v.inf.slice(-2);
  return stem + { ar: 'ás', er: 'és', ir: 'ís' }[end];
}

export function vosImperative(v) {
  if (v.vosImp) return v.vosImp;
  const base = v.inf.slice(0, -1); // drop the r
  return base.slice(0, -1) + ACCENT[base.slice(-1)];
}

export function noteFor(mode, v, answer) {
  if (mode === 'pres') {
    if (v.inf === 'ser') return 'Ser es irregular: vos sos (tú eres).';
    if (v.inf === 'ir') return 'Ir: vos vas, igual que tú.';
    const changed = v.tu.slice(0, -2) !== answer.slice(0, -2); // tien-es vs ten-és
    const ir = v.inf.endsWith('ir') ? ' Los verbos en -ir terminan en -ís.' : '';
    return (changed ? `Sin cambio de raíz: tú ${v.tu} → vos ${answer}. ` : '') + 'La fuerza va en la última sílaba, con tilde.' + ir;
  }
  if (mode === 'imp') {
    if (v.inf === 'ser') return 'Ser: sé, igual que tú.';
    if (v.inf === 'ir') return 'Con ir, el imperativo de vos casi no se usa: se dice andá.';
    return `Imperativo de vos: el infinitivo sin la r final, con tilde. ${v.inf} → ${answer}.`;
  }
  return `En el subjuntivo, lo más común en Buenos Aires es la forma de tú: ${v.subj}. La forma ${v.subjVos} también se oye, sobre todo en negativos.`;
}

export function questionsFor(mode) {
  return VERBS.filter((v) => v.s[mode]).map((v) => {
    const answer = mode === 'pres' ? vosPresent(v) : mode === 'imp' ? vosImperative(v) : v.subj;
    const accept = mode === 'subj' ? [v.subj, v.subjVos] : [answer];
    const tuForm = mode === 'pres' ? `tú ${v.tu}` : mode === 'imp' ? `tú: ${v.tuImp}` : `que tú ${v.subj}`;
    return { verb: v, mode, sentence: v.s[mode], answer, accept, tuForm };
  });
}
