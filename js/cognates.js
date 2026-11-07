// English -> Spanish cognate rules (the "Language Transfer / Michel Thomas" trick).
// Longest suffixes first. ex: [english, spanish] pairs that follow the rule.
export const RULES = [
  { en: 'tion', es: 'ción', ex: [['nation', 'nación'], ['information', 'información'], ['situation', 'situación']] },
  { en: 'sion', es: 'sión', ex: [['television', 'televisión'], ['decision', 'decisión'], ['vision', 'visión']] },
  { en: 'ity', es: 'idad', ex: [['university', 'universidad'], ['possibility', 'posibilidad'], ['reality', 'realidad']] },
  { en: 'ty', es: 'tad', ex: [['liberty', 'libertad'], ['difficulty', 'dificultad'], ['faculty', 'facultad']] },
  { en: 'ous', es: 'oso', ex: [['famous', 'famoso'], ['delicious', 'delicioso'], ['generous', 'generoso']] },
  { en: 'ive', es: 'ivo', ex: [['active', 'activo'], ['creative', 'creativo'], ['positive', 'positivo']] },
  { en: 'ical', es: 'ico', ex: [['practical', 'práctico'], ['typical', 'típico'], ['political', 'político']] },
  { en: 'ic', es: 'ico', ex: [['public', 'público'], ['electric', 'eléctrico'], ['romantic', 'romántico']] },
  { en: 'ly', es: 'mente', ex: [['finally', 'finalmente'], ['normally', 'normalmente'], ['totally', 'totalmente']] },
  { en: 'al', es: 'al', ex: [['normal', 'normal'], ['natural', 'natural'], ['social', 'social']] },
  { en: 'ble', es: 'ble', ex: [['possible', 'posible'], ['terrible', 'terrible'], ['flexible', 'flexible']] },
  { en: 'ence', es: 'encia', ex: [['difference', 'diferencia'], ['science', 'ciencia'], ['experience', 'experiencia']] },
  { en: 'ance', es: 'ancia', ex: [['importance', 'importancia'], ['distance', 'distancia'], ['tolerance', 'tolerancia']] },
  { en: 'ent', es: 'ente', ex: [['different', 'diferente'], ['president', 'presidente'], ['intelligent', 'inteligente']] },
  { en: 'ant', es: 'ante', ex: [['important', 'importante'], ['elegant', 'elegante'], ['restaurant', 'restaurante']] },
  { en: 'ary', es: 'ario', ex: [['necessary', 'necesario'], ['salary', 'salario'], ['ordinary', 'ordinario']] },
  { en: 'ory', es: 'orio', ex: [['laboratory', 'laboratorio'], ['obligatory', 'obligatorio'], ['territory', 'territorio']] },
  { en: 'ism', es: 'ismo', ex: [['tourism', 'turismo'], ['optimism', 'optimismo'], ['realism', 'realismo']] },
  { en: 'ist', es: 'ista', ex: [['artist', 'artista'], ['dentist', 'dentista'], ['tourist', 'turista']] },
  { en: 'ize', es: 'izar', ex: [['organize', 'organizar'], ['memorize', 'memorizar'], ['realize', 'realizar']] },
  { en: 'yze', es: 'izar', ex: [['analyze', 'analizar'], ['paralyze', 'paralizar']] },
  { en: 'ogy', es: 'ogía', ex: [['biology', 'biología'], ['technology', 'tecnología'], ['psychology', 'psicología']] },
  { en: 'phy', es: 'fía', ex: [['philosophy', 'filosofía'], ['geography', 'geografía'], ['photography', 'fotografía']] },
  { en: 'ate', es: 'ar', ex: [['create', 'crear'], ['celebrate', 'celebrar'], ['participate', 'participar']] },
  { en: 'ure', es: 'ura', ex: [['culture', 'cultura'], ['temperature', 'temperatura'], ['literature', 'literatura']] },
  { en: 'ude', es: 'ud', ex: [['altitude', 'altitud'], ['gratitude', 'gratitud'], ['multitude', 'multitud']] },
  { en: 'ment', es: 'mento', ex: [['moment', 'momento'], ['document', 'documento'], ['instrument', 'instrumento']] },
  { en: 'ct', es: 'cto', ex: [['perfect', 'perfecto'], ['direct', 'directo'], ['correct', 'correcto']] },
  { en: 'em', es: 'ema', ex: [['problem', 'problema'], ['system', 'sistema'], ['poem', 'poema']] },
  { en: 'am', es: 'ama', ex: [['program', 'programa'], ['diagram', 'diagrama'], ['telegram', 'telegrama']] },
  { en: 'or', es: 'or', ex: [['doctor', 'doctor'], ['actor', 'actor'], ['color', 'color']] },
];

const ACC = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
function accentLastVowel(stem) {
  for (let i = stem.length - 1; i >= 0; i--) if (ACC[stem[i]]) return stem.slice(0, i) + ACC[stem[i]] + stem.slice(i + 1);
  return stem;
}

// Spelling adjustments English -> Spanish on the stem.
function respell(stem, word) {
  let s = stem
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/rh/g, 'r').replace(/ch(?=[aeiou]|[bcdfgklmnprstvz])/g, 'c')
    .replace(/([bcdfgklmnpstvz])\1/g, '$1') // double consonants (rr stays)
    .replace(/ou/g, 'u').replace(/^ps/, 'ps')
    .replace(/k/g, 'c').replace(/y/g, 'i').replace(/qu(?=[ao])/g, 'cu');
  if (/^sc[ei]/.test(word)) s = s.slice(1); // science -> ciencia
  else if (/^s[bcdfgklmnpqrtvz]/.test(word)) s = 'e' + s; // student -> estudiante
  return s;
}

// Best-guess Spanish cognate for an English word, with the rule used.
export function toSpanish(english) {
  const w = english.toLowerCase().trim();
  if (!/^[a-z]+$/.test(w) || w.length < 3) return null;
  const rule = [...RULES].sort((a, b) => b.en.length - a.en.length).find((r) => w.endsWith(r.en) && w.length > r.en.length + 1);
  if (!rule) return null;
  let stem = respell(w.slice(0, -rule.en.length), w);
  if (rule.en === 'ic' || rule.en === 'ical') stem = accentLastVowel(stem);
  if (rule.en === 'ly' && !/[lenrz]$/.test(stem)) stem += 'a'; // rapid -> rapida-mente
  return { es: stem + rule.es, rule };
}

// Words that look alike but mean something else.
export const FALSE_FRIENDS = [
  { es: 'embarazada', looks: 'embarrassed', means: 'pregnant', say: 'avergonzado/a, con vergüenza' },
  { es: 'actualmente', looks: 'actually', means: 'currently, nowadays', say: 'en realidad' },
  { es: 'éxito', looks: 'exit', means: 'success', say: 'salida' },
  { es: 'librería', looks: 'library', means: 'bookstore', say: 'biblioteca' },
  { es: 'carpeta', looks: 'carpet', means: 'folder', say: 'alfombra' },
  { es: 'constipado', looks: 'constipated', means: 'stuffed up, with a cold', say: 'estreñido' },
  { es: 'sensible', looks: 'sensible', means: 'sensitive', say: 'sensato' },
  { es: 'realizar', looks: 'realize', means: 'to carry out, to do', say: 'darse cuenta' },
  { es: 'asistir', looks: 'assist', means: 'to attend', say: 'ayudar' },
  { es: 'molestar', looks: 'molest', means: 'to bother', say: '(no lo uses así: molest es abuso)' },
  { es: 'recordar', looks: 'record', means: 'to remember', say: 'grabar' },
  { es: 'soportar', looks: 'support', means: 'to put up with', say: 'apoyar (en Argentina también: bancar)' },
  { es: 'introducir', looks: 'introduce', means: 'to insert, to bring in', say: 'presentar (a una persona)' },
  { es: 'compromiso', looks: 'compromise', means: 'commitment; engagement', say: 'acuerdo, concesión' },
  { es: 'largo', looks: 'large', means: 'long', say: 'grande' },
  { es: 'ropa', looks: 'rope', means: 'clothes', say: 'soga, cuerda' },
  { es: 'lectura', looks: 'lecture', means: 'reading', say: 'clase, conferencia' },
  { es: 'fábrica', looks: 'fabric', means: 'factory', say: 'tela' },
  { es: 'suceso', looks: 'success', means: 'event, incident', say: 'éxito' },
  { es: 'excitado', looks: 'excited', means: 'sexually aroused', say: 'entusiasmado, emocionado' },
  { es: 'preservativo', looks: 'preservative', means: 'condom', say: 'conservante' },
  { es: 'colegio', looks: 'college', means: 'school (primary/secondary)', say: 'facultad, universidad' },
  { es: 'decepción', looks: 'deception', means: 'disappointment', say: 'engaño' },
  { es: 'avisar', looks: 'advise', means: 'to let know, to warn', say: 'aconsejar' },
  { es: 'pretender', looks: 'pretend', means: 'to aim, to try for', say: 'fingir, hacerse el/la' },
  { es: 'atender', looks: 'attend', means: 'to serve, to answer (phone)', say: 'asistir, ir a' },
  { es: 'resumir', looks: 'resume', means: 'to summarize', say: 'retomar, reanudar' },
  { es: 'eventualmente', looks: 'eventually', means: 'possibly, now and then', say: 'al final, con el tiempo' },
];
