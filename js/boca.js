// Side view of the mouth (facing left) for each sound: tongue, lips, soft palate, where the air is
// stopped or squeezed, and whether the vocal cords vibrate. Schematic, not anatomical.

// Tongue: body = highest point of the tongue, tip = tongue tip. jaw = how far the lower teeth drop.
// lips: 'open' | 'closed' | 'near' (almost closed) | 'round' | 'labiodental'
// nasal: soft palate lowered (air through the nose). mark: [x, y] where the constriction is.
// manner: 'cierre' | 'roce' | 'toque' | 'vibración' | 'abierta' | 'cierre y roce'
const N = { body: [112, 100], tip: [66, 112], jaw: 106, lips: 'open' }; // neutral
const D = {
  a: { body: [116, 112], tip: [64, 120], jaw: 124, lips: 'open', manner: 'abierta', place: 'vocal baja y central', voice: true },
  e: { body: [100, 95], tip: [60, 110], jaw: 112, lips: 'open', manner: 'abierta', place: 'vocal media y anterior', voice: true },
  i: { body: [96, 84], tip: [60, 106], jaw: 106, lips: 'open', manner: 'abierta', place: 'vocal alta y anterior', voice: true },
  o: { body: [134, 99], tip: [70, 118], jaw: 112, lips: 'round', manner: 'abierta', place: 'vocal media y posterior, labios redondos', voice: true },
  u: { body: [142, 86], tip: [72, 117], jaw: 106, lips: 'round', manner: 'abierta', place: 'vocal alta y posterior, labios redondos', voice: true },
  j: { body: [96, 82], tip: [60, 106], jaw: 104, lips: 'open', manner: 'abierta', place: 'como una i rápida, deslizándose', voice: true },
  w: { body: [142, 84], tip: [72, 117], jaw: 104, lips: 'round', manner: 'abierta', place: 'como una u rápida, deslizándose', voice: true },
  p: { ...N, lips: 'closed', mark: [41, 97], manner: 'cierre', place: 'los dos labios', voice: false },
  b: { ...N, lips: 'closed', mark: [41, 97], manner: 'cierre', place: 'los dos labios', voice: true },
  β: { ...N, lips: 'near', mark: [41, 97], manner: 'roce', place: 'los dos labios, sin cerrar', voice: true },
  m: { ...N, lips: 'closed', nasal: true, mark: [41, 97], manner: 'cierre', place: 'los dos labios, aire por la nariz', voice: true },
  f: { ...N, lips: 'labiodental', mark: [50, 100], manner: 'roce', place: 'labio de abajo con dientes de arriba', voice: false },
  ɱ: { ...N, lips: 'labiodental', nasal: true, mark: [50, 100], manner: 'cierre', place: 'labio y dientes, aire por la nariz', voice: true },
  t: { body: [108, 98], tip: [57, 96], jaw: 104, lips: 'open', mark: [57, 95], manner: 'cierre', place: 'punta de la lengua contra los dientes', voice: false },
  d: { body: [108, 98], tip: [57, 96], jaw: 104, lips: 'open', mark: [57, 95], manner: 'cierre', place: 'punta de la lengua contra los dientes', voice: true },
  ð: { body: [108, 101], tip: [53, 101], jaw: 108, lips: 'open', mark: [54, 99], manner: 'roce', place: 'punta de la lengua apenas tocando los dientes', voice: true },
  n: { body: [108, 96], tip: [63, 91], jaw: 104, lips: 'open', nasal: true, mark: [64, 89], manner: 'cierre', place: 'punta de la lengua arriba de los dientes, aire por la nariz', voice: true },
  s: { body: [104, 94], tip: [66, 93], jaw: 104, lips: 'open', mark: [68, 88], manner: 'roce', place: 'punta de la lengua cerca del borde de arriba', voice: false },
  l: { body: [108, 96], tip: [66, 89], jaw: 106, lips: 'open', mark: [67, 87], manner: 'cierre al centro, aire por los costados', place: 'punta de la lengua arriba', voice: true },
  ɾ: { body: [108, 98], tip: [67, 90], jaw: 106, lips: 'open', mark: [68, 87], manner: 'toque', place: 'un toque rápido de la punta', voice: true },
  r: { body: [108, 98], tip: [67, 90], jaw: 106, lips: 'open', mark: [68, 87], manner: 'vibración', place: 'la punta vibra varias veces', voice: true },
  ʃ: { body: [96, 88], tip: [72, 92], jaw: 104, lips: 'round', mark: [78, 84], manner: 'roce', place: 'lengua detrás del borde de arriba, labios un poco hacia afuera', voice: false },
  tʃ: { body: [96, 86], tip: [72, 88], jaw: 104, lips: 'round', mark: [76, 82], manner: 'cierre y roce', place: 'cierra detrás del borde y suelta con roce', voice: false },
  ɲ: { body: [100, 77], tip: [64, 104], jaw: 104, lips: 'open', nasal: true, mark: [100, 73], manner: 'cierre', place: 'el medio de la lengua contra el paladar, aire por la nariz', voice: true },
  k: { body: [148, 83], tip: [68, 114], jaw: 106, lips: 'open', mark: [150, 80], manner: 'cierre', place: 'la parte de atrás de la lengua contra el velo', voice: false },
  g: { body: [148, 83], tip: [68, 114], jaw: 106, lips: 'open', mark: [150, 80], manner: 'cierre', place: 'la parte de atrás de la lengua contra el velo', voice: true },
  ɣ: { body: [146, 88], tip: [68, 114], jaw: 108, lips: 'open', mark: [149, 82], manner: 'roce', place: 'atrás de la lengua cerca del velo, sin cerrar', voice: true },
  x: { body: [147, 86], tip: [68, 114], jaw: 106, lips: 'open', mark: [150, 81], manner: 'roce', place: 'atrás de la lengua cerca del velo, con fuerza', voice: false },
  ŋ: { body: [148, 83], tip: [68, 114], jaw: 106, lips: 'open', nasal: true, mark: [150, 80], manner: 'cierre', place: 'atrás de la lengua contra el velo, aire por la nariz', voice: true },
  h: { body: [116, 108], tip: [64, 118], jaw: 116, lips: 'open', mark: [168, 172], manner: 'roce', place: 'solo aire en la garganta, como un suspiro', voice: false },
};
export const hasDiagram = (s) => !!D[s];
export const describe = (s) => D[s] && { place: D[s].place, manner: D[s].manner, voice: D[s].voice, nasal: !!D[s].nasal };

// Smooth curve through points (Catmull-Rom → cubic Bézier).
function spline(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function mouthSVG(symbol) {
  const a = D[symbol];
  if (!a) return '';
  const jaw = a.jaw, drop = jaw - 104; // lower jaw moves down with "drop"
  // Lips
  const upperLip = a.lips === 'round' ? 'M30,72 C30,80 26,86 28,93 L42,94' : 'M34,72 C34,80 32,86 34,93 L44,94';
  let lowerLipY = 99 + drop;
  if (a.lips === 'closed') lowerLipY = 95;
  if (a.lips === 'near') lowerLipY = 97;
  const lowerLipX = a.lips === 'round' ? 28 : 34;
  const lowerLip = a.lips === 'labiodental'
    ? `M50,100 C44,101 40,106 40,114 C40,122 44,${126 + drop} 50,${130 + drop}`
    : `M44,${lowerLipY} L${lowerLipX},${lowerLipY + 1} C${lowerLipX - 2},${lowerLipY + 10} ${lowerLipX + 2},${lowerLipY + 20} 46,${128 + drop}`;
  // Tongue: root → back → body → tip, then the underside along the floor of the mouth.
  const [bx, by] = a.body, [tx, ty] = a.tip;
  const top = spline([[166, 158], [162, 128], [Math.min(bx + 24, 158), Math.max(by + 8, 96)], [bx, by], [Math.max(tx + 14, (bx + tx) / 2), (by + ty) / 2 + 2], [tx, ty]]);
  const tongue = `${top} C${tx - 3},${ty + 6} ${tx + 2},${ty + 12} ${tx + 12},${120 + drop} C100,${132 + drop} 140,${134 + drop / 2} 166,158 Z`;
  // Soft palate: raised against the back wall (no air through the nose) or lowered.
  const velum = a.nasal ? 'M134,70 C150,70 160,80 160,98' : 'M134,70 C152,70 168,74 178,84';
  // Vocal cords, at the bottom of the throat: a zigzag when they vibrate.
  const voiceMark = a.voice
    ? '<path d="M163,180 l3,-5 l3,10 l3,-10 l3,10 l3,-5" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>'
    : '<path d="M163,180 h16" stroke="var(--muted)" stroke-width="2" stroke-dasharray="3 3"/>';
  const air = a.nasal
    ? '<path d="M170,108 C172,80 170,64 150,58 C110,50 70,52 40,60" fill="none" stroke="var(--native)" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#ah)"/>'
    : '';
  const mark = a.mark ? `<circle cx="${a.mark[0]}" cy="${a.mark[1]}" r="7" fill="var(--accent)" opacity=".28"/><circle cx="${a.mark[0]}" cy="${a.mark[1]}" r="3" fill="var(--accent)"/>` : '';
  const vib = a.manner === 'vibración' ? `<path d="M${tx - 8},${ty - 9} q3,-3 6,0 q3,3 6,0" fill="none" stroke="var(--accent)" stroke-width="1.6"/>` : '';
  return `<svg viewBox="10 40 190 155" width="100%" style="max-width:300px;display:block;margin:0 auto" role="img" aria-label="Corte de la boca para [${symbol}]">
  <defs><marker id="ah" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--native)"/></marker></defs>
  <g fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M40,60 C70,56 120,54 160,58 C174,60 180,68 182,80 L182,192" opacity=".45"/>
    <path d="M40,60 C32,60 26,62 30,68 C34,70 36,70 38,72" opacity=".6"/>
    <path d="M38,72 ${a.lips === 'round' ? 'C30,78 26,86 30,93' : 'C36,80 32,86 35,93'} L46,94"/>
    <path d="M48,85 L51,97 L55,86"/>
    <path d="M55,86 C62,82 68,80 74,79 C92,72 112,68 134,70"/>
    <path d="${velum}" stroke="var(--gold-text)" stroke-width="3"/>
    <path d="${lowerLip}"/>
    <path d="M50,${112 + drop} L53,${101 + drop} L57,${112 + drop}"/>
    <path d="M46,${128 + drop} C52,${150 + drop} 72,${158 + drop} 104,${158 + drop} C130,${158 + drop} 150,166 156,192" opacity=".5"/>
  </g>
  <path d="${tongue}" fill="color-mix(in srgb, var(--accent) 22%, var(--surface))" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>
  ${air}${mark}${vib}${voiceMark}
  <text x="159" y="183" text-anchor="end" font-size="8" fill="var(--muted)" font-family="sans-serif">${a.voice ? 'voz' : 'sin voz'}</text>
  <text x="128" y="64" font-size="8" fill="var(--gold-text)" font-family="sans-serif">velo</text>
</svg>`;
}
