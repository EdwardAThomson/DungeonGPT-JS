// townsfolkSprites.js
// PROTOTYPE (debug-only, /debug/town-3q): townsfolk sprites for the 3/4 town view.
//
// Period reference is medieval Europe (roughly 13th-15th c.): undyed and earth-dyed
// wool (russet, madder, woad, weld), linen coifs and wimples, hooded chaperons with a
// liripipe tail, mail and a kettle hat on the watch, a friar's habit and rope belt, a
// burgher's long gown, straw hats in the fields. No fantasy armour, no modern cuts.
//
// Each sprite is an SVG data-URI drawn in a 20 x 32 canvas (feet at y=30) in one of
// three views: 's' (facing the viewer), 'n' (back) and 'e' (profile; 'w' is the same
// sprite mirrored by the caller). Garments use a left-lit horizontal gradient and a
// thin dark outline so figures stay legible at ~25px tall. Walking adds a SMIL stride:
// legs and arms swing from hip/shoulder pivots, long hems sway, the body bobs.

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shade = (hex, f) => {
  const [r, g, b] = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
};

export const FIG_W = 20;
export const FIG_H = 32;
const STRIDE = '0.62s';

// Period palettes: natural and common dyes for working folk, saturated dyes for the
// well-off (which was itself a status marker).
const WOOL = {
  oatmeal: '#b9a989', russet: '#8a4f34', madder: '#8e3b32', woad: '#4d6283', weld: '#9a8a42',
  brown: '#6b4f36', grey: '#7c7a74', green: '#5a6b44', black: '#2e2c2a', linen: '#e6dfcc',
  leather: '#6a4a2e', straw: '#d1b26a', steel: '#9aa0a6', crimson: '#7d2430', blue: '#2f4a7a',
  forest: '#2f5a3c', fur: '#d8cdb8', gold: '#b89a48', murrey: '#6a2f4a',
};
// Skin tone palette.
const SKINS = ['#f3d9c0', '#ecc8a6', '#e4ba95', '#f7e3d0', '#dcae88'];
const HAIR = ['#3a2a1e', '#6a4a2a', '#9a7040', '#c9a86a', '#2a2420', '#8a3a22', '#bdb7ad'];

// --- roles -----------------------------------------------------------------------
// garment: 'tunic' (knee) | 'gown' (ankle) | 'habit' (ankle, monastic)
// head: 'chaperon' | 'coif' | 'wimple' | 'kettle' | 'tonsure' | 'roundlet' | 'straw' | 'bare' | 'veil'
const ROLES = {
  peasant: (v) => ({
    garment: 'tunic', hem: 24, coat: [WOOL.russet, WOOL.oatmeal, WOOL.brown, WOOL.green][v % 4],
    hose: [WOOL.brown, WOOL.grey, WOOL.oatmeal, WOOL.black][(v + 1) % 4], belt: WOOL.leather,
    head: 'chaperon', headColor: [WOOL.woad, WOOL.madder, WOOL.weld, WOOL.brown][(v + 2) % 4], prop: v % 3 === 0 ? 'sack' : null,
  }),
  farmer: (v) => ({
    garment: 'tunic', hem: 24, coat: [WOOL.oatmeal, WOOL.green, WOOL.brown][v % 3], hose: WOOL.brown,
    belt: WOOL.leather, head: 'straw', prop: v % 2 ? 'hoe' : null,
  }),
  // Women: kirtle laced at the front, hair dressed and visible under a small linen cap
  // or kerchief (married) or a steeple hennin (a gentlewoman, 15th c.).
  goodwife: (v) => ({
    female: true, garment: 'gown', hem: 29.4, coat: [WOOL.woad, WOOL.madder, WOOL.green, WOOL.russet][v % 4],
    apron: WOOL.linen, lacing: true, head: 'cap', headColor: WOOL.linen, braid: true, prop: v % 2 ? 'basket' : null,
  }),
  matron: (v) => ({
    female: true, garment: 'gown', hem: 29.4, coat: [WOOL.brown, WOOL.grey, WOOL.woad][v % 3], belt: WOOL.leather,
    lacing: true, shawl: [WOOL.oatmeal, WOOL.russet, WOOL.green][v % 3],
    head: 'kerchief', headColor: [WOOL.madder, WOOL.weld, WOOL.woad][v % 3], hairTone: [1, 5, 2][v % 3], prop: v % 3 === 1 ? 'jug' : null,
  }),
  labourer: (v) => ({
    garment: 'tunic', hem: 23.5, coat: [WOOL.oatmeal, WOOL.grey, WOOL.russet][v % 3], hose: WOOL.brown,
    bib: WOOL.leather, head: 'bare', sleevesRolled: true, prop: v % 2 ? 'sack' : null,
  }),
  guard: (v) => ({
    garment: 'tunic', hem: 23.5, mail: true, coat: [WOOL.madder, WOOL.woad, WOOL.weld][v % 3], hose: WOOL.grey,
    belt: WOOL.leather, head: 'kettle', prop: 'spear',
  }),
  friar: (v) => ({
    garment: 'habit', hem: 29.6, coat: [WOOL.brown, WOOL.grey, WOOL.black][v % 3], rope: WOOL.straw,
    head: 'tonsure', cowl: true, prop: v % 2 ? 'book' : null,
  }),
  burgher: (v) => ({
    garment: 'gown', hem: 28.6, coat: [WOOL.murrey, WOOL.blue, WOOL.forest, WOOL.crimson][v % 4], trim: WOOL.fur,
    belt: WOOL.black, head: 'roundlet', headColor: [WOOL.black, WOOL.crimson, WOOL.murrey, WOOL.blue][(v + 1) % 4], purse: true,
  }),
  lady: (v) => ({
    female: true, garment: 'gown', hem: 29.8, coat: [WOOL.blue, WOOL.forest, WOOL.crimson][v % 3], trim: WOOL.fur,
    belt: WOOL.gold, highWaist: true, squareNeck: true, head: 'hennin', headColor: [WOOL.crimson, WOOL.black, WOOL.gold][v % 3],
    hangingSleeves: true,
  }),
  child: (v) => ({
    child: true, garment: 'tunic', hem: 24.5, coat: [WOOL.oatmeal, WOOL.russet, WOOL.weld, WOOL.green][v % 4],
    hose: WOOL.brown, belt: WOOL.leather, head: 'bare',
  }),
};
// Weighted pool: working folk dominate a medieval street.
const POOL = ['peasant', 'peasant', 'goodwife', 'goodwife', 'labourer', 'farmer', 'matron', 'guard', 'peasant', 'friar', 'burgher', 'child', 'goodwife', 'labourer', 'child', 'lady'];
export const NPC_LOOK_COUNT = POOL.length * 4;
export const NPC_SKIN_COUNT = SKINS.length;
export const roleForLook = (look) => POOL[look % POOL.length];

// --- drawing helpers ------------------------------------------------------------------
const f1 = (n) => (Math.round(n * 100) / 100).toString();
let gid = 0;
const grad = (defs, base) => {
  const id = `g${gid++}`;
  defs.push(`<linearGradient id='${id}' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${shade(base, 1.14)}'/><stop offset='0.5' stop-color='${base}'/><stop offset='1' stop-color='${shade(base, 0.66)}'/></linearGradient>`);
  return `url(#${id})`;
};
const ol = (base) => `stroke='${shade(base, 0.42)}' stroke-width='0.45' stroke-linejoin='round'`;
const swing = (deg, cx, cy, begin = '0s') =>
  `<animateTransform attributeName='transform' type='rotate' values='${deg} ${cx} ${cy};${-deg} ${cx} ${cy};${deg} ${cx} ${cy}' dur='${STRIDE}' begin='${begin}' repeatCount='indefinite'/>`;
const lift = (dy, begin = '0s') =>
  `<animateTransform attributeName='transform' type='translate' values='0 0;0 ${-dy};0 0;0 0;0 0' keyTimes='0;0.25;0.5;0.75;1' dur='${STRIDE}' begin='${begin}' repeatCount='indefinite'/>`;
const HALF = '-0.31s';

// --- the figure ------------------------------------------------------------------------
const figure = (p, view, walking, skinIdx, hairIdx) => {
  gid = 0;
  const defs = [];
  const sk = SKINS[skinIdx % SKINS.length];
  const hair = HAIR[(p.hairTone ?? hairIdx) % HAIR.length];
  const side = view === 'e';
  const back = view === 'n';
  const cx = 10;
  const long = p.garment !== 'tunic';
  const hem = p.hem;
  const coatFill = grad(defs, p.coat);
  const skinFill = grad(defs, sk);
  let s = '';

  // ground shadow
  s += `<ellipse cx='${cx}' cy='30.3' rx='${side ? 4 : 4.6}' ry='1.25' fill='#0b0d12' opacity='0.38'/>`;

  // --- legs / feet
  const shoe = '#2e241c';
  if (!long) {
    const hoseFill = grad(defs, p.hose || WOOL.brown);
    if (side) {
      const leg = (dx, ph, dark) =>
        `<g>${walking ? swing(22, cx, hem - 1.5, ph) : ''}` +
        `<rect x='${f1(cx - 1 + dx)}' y='${f1(hem - 1.5)}' width='2' height='${f1(30 - hem + 1)}' rx='0.8' fill='${dark ? shade(p.hose || WOOL.brown, 0.75) : hoseFill}' ${ol(p.hose || WOOL.brown)}/>` +
        `<path d='M${f1(cx - 1.1 + dx)},29.2 h2.6 q0.9,0 0.9,0.8 v0.5 h-3.5 z' fill='${shoe}'/></g>`;
      s += leg(0.3, HALF, true) + leg(-0.3, '0s', false);
    } else {
      const leg = (x, ph) =>
        `<g>${walking ? lift(0.9, ph) : ''}<rect x='${f1(x)}' y='${f1(hem - 1.5)}' width='1.9' height='${f1(30 - hem + 1)}' rx='0.7' fill='${hoseFill}' ${ol(p.hose || WOOL.brown)}/>` +
        `<rect x='${f1(x - 0.25)}' y='29' width='2.4' height='1.5' rx='0.6' fill='${shoe}'/></g>`;
      s += leg(cx - 2.5, '0s') + leg(cx + 0.6, HALF);
    }
  } else {
    // only shoe toes peek from under a long hem
    if (side) {
      s += `<g>${walking ? `<animateTransform attributeName='transform' type='translate' values='-1 0;1.2 0;-1 0' dur='${STRIDE}' repeatCount='indefinite'/>` : ''}<path d='M${cx - 0.5},29.4 h2.2 q0.9,0 0.9,0.7 v0.4 h-3.1 z' fill='${shoe}'/></g>`;
    } else if (!back) {
      s += `<g>${walking ? lift(0.7) : ''}<ellipse cx='${cx - 1.4}' cy='30' rx='1.1' ry='0.6' fill='${shoe}'/></g>` +
        `<g>${walking ? lift(0.7, HALF) : ''}<ellipse cx='${cx + 1.4}' cy='30' rx='1.1' ry='0.6' fill='${shoe}'/></g>`;
    }
  }

  // --- back arm (profile only), drawn behind the body
  const sleeve = p.mail ? WOOL.steel : p.coat;
  const armLen = 6.6;
  if (side) {
    s += `<g>${walking ? swing(-24, cx, 12.6, '0s') : ''}<rect x='${cx - 0.9}' y='12.3' width='1.9' height='${armLen}' rx='0.9' fill='${shade(sleeve, 0.7)}' ${ol(sleeve)}/>` +
      `<circle cx='${cx + 0.05}' cy='${f1(12.3 + armLen + 0.3)}' r='0.85' fill='${shade(sk, 0.8)}'/></g>`;
  }

  if (side && p.prop === 'sack') {
    s += `<path d='M${cx - 5},12.4 q2.6,-1.4 4.6,0.2 q0.6,3.4 -0.4,6 q-2.4,0.8 -4.4,-0.2 q-1,-2.8 0.2,-6 z' fill='${grad(defs, '#b8a47a')}' ${ol('#b8a47a')}/>`;
  }

  // --- lower garment (skirt / tunic tail), with a sway on long hems
  const waistY = 18;
  const wTop = side ? 2.6 : 3.2;
  const wHem = long ? (side ? 4.2 : 4.9) : (side ? 3.3 : 4.1);
  const skirt = `M${f1(cx - wTop)},${waistY} L${f1(cx + wTop)},${waistY} L${f1(cx + wHem)},${f1(hem)} Q${cx},${f1(hem + 0.6)} ${f1(cx - wHem)},${f1(hem)} Z`;
  let skirtG = `<path d='${skirt}' fill='${coatFill}' ${ol(p.coat)}/>`;
  // folds
  for (const fx of side ? [-1.2, 1.2] : [-2, 0, 2]) {
    skirtG += `<line x1='${f1(cx + fx * 0.6)}' y1='${waistY + 1.5}' x2='${f1(cx + fx)}' y2='${f1(hem - 0.4)}' stroke='${shade(p.coat, 0.6)}' stroke-width='0.35' opacity='0.55'/>`;
  }
  if (p.mail) {
    // mail skirt peeking below the surcoat
    skirtG = `<path d='M${f1(cx - wHem + 0.2)},${f1(hem - 2.6)} L${f1(cx + wHem - 0.2)},${f1(hem - 2.6)} L${f1(cx + wHem - 0.1)},${f1(hem + 0.5)} L${f1(cx - wHem + 0.1)},${f1(hem + 0.5)} Z' fill='${WOOL.steel}' ${ol(WOOL.steel)}/>` + skirtG;
  }
  if (p.trim) skirtG += `<path d='M${f1(cx - wHem)},${f1(hem - 0.3)} Q${cx},${f1(hem + 0.4)} ${f1(cx + wHem)},${f1(hem - 0.3)}' stroke='${p.trim}' stroke-width='0.9' fill='none'/>`;
  if (p.apron && !back) {
    const aw = side ? 1.8 : 2.6;
    skirtG += `<path d='M${f1(cx - aw + (side ? 1.4 : 0))},${waistY + 0.3} h${f1(aw * 2)} l0.4,${f1(hem - waistY - 2)} h${f1(-aw * 2 - 0.8)} z' fill='${grad(defs, p.apron)}' ${ol(p.apron)}/>`;
  }
  s += `<g>${walking && long ? swing(2.2, cx, waistY) : ''}${skirtG}</g>`;

  // --- torso
  const tW = side ? 2.5 : 3.4;
  const tWaist = p.female ? tW - (side ? 0.4 : 0.8) : tW; // fitted kirtle bodice
  const torso = `M${f1(cx - tWaist)},${waistY + 0.2} L${f1(cx - tW - 0.2)},13.2 Q${f1(cx - tW)},11.9 ${cx},11.7 Q${f1(cx + tW)},11.9 ${f1(cx + tW + 0.2)},13.2 L${f1(cx + tWaist)},${waistY + 0.2} Z`;
  if (p.mail) {
    s += `<path d='${torso}' fill='${grad(defs, WOOL.steel)}' ${ol(WOOL.steel)}/>`;
    // surcoat over the mail
    s += `<path d='M${f1(cx - tW + 0.6)},${waistY + 0.2} L${f1(cx - tW + 0.4)},12.6 L${f1(cx + tW - 0.4)},12.6 L${f1(cx + tW - 0.6)},${waistY + 0.2} Z' fill='${coatFill}' ${ol(p.coat)}/>`;
    if (!back && !side) s += `<path d='M${cx - 1},14 h2 v2.4 l-1,0.8 l-1,-0.8 z' fill='${WOOL.linen}' opacity='0.9'/>`; // town badge
  } else {
    s += `<path d='${torso}' fill='${coatFill}' ${ol(p.coat)}/>`;
  }
  if (p.bib && !back) {
    const bw = side ? 1.2 : 1.7, bx = cx + (side ? 1.4 : 0);
    s += `<path d='M${f1(bx - bw)},13.6 h${f1(bw * 2)} l${side ? 0.3 : 0.9},${f1(hem - 15)} q0,1 -1,1 h${f1(-(bw * 2) + (side ? 0.4 : 0.2))} q-1,0 -1,-1 z' fill='${grad(defs, '#8a6440')}' ${ol('#8a6440')}/>` +
      (side ? '' : `<path d='M${f1(bx - bw)},13.6 L${cx - 1.4},11.9 M${f1(bx + bw)},13.6 L${cx + 1.4},11.9' stroke='#5a4028' stroke-width='0.45'/>`);
  }
  if (p.squareNeck && !side && !back) {
    s += `<path d='M${cx - 2},12 v1.9 h4 v-1.9' fill='${shade(SKINS[skinIdx % SKINS.length], 0.97)}' stroke='${p.trim || WOOL.gold}' stroke-width='0.7'/>`;
  } else if (p.trim && !side) s += `<path d='M${cx - 2.2},12 Q${cx},13.6 ${cx + 2.2},12' stroke='${p.trim}' stroke-width='0.9' fill='none'/>`;
  if (p.lacing && !back && !side) {
    // front-laced kirtle: a linen shift shows at the neck, cord criss-crosses the bodice
    s += `<path d='M${cx - 1.3},11.9 Q${cx},12.9 ${cx + 1.3},11.9' fill='${WOOL.linen}' stroke='${shade(WOOL.linen, 0.6)}' stroke-width='0.3'/>` +
      `<path d='M${cx - 0.5},13 L${cx + 0.5},14 L${cx - 0.5},15 L${cx + 0.5},16 L${cx - 0.5},17 M${cx + 0.5},13 L${cx - 0.5},14 L${cx + 0.5},15 L${cx - 0.5},16 L${cx + 0.5},17' stroke='${shade(p.coat, 0.45)}' stroke-width='0.3' fill='none'/>`;
  }
  if (p.belt) {
    const by = p.highWaist ? 14.9 : waistY - 0.6;
    const bw = p.highWaist ? tW - 0.2 : tWaist;
    s += `<rect x='${f1(cx - bw - 0.1)}' y='${by}' width='${f1(bw * 2 + 0.2)}' height='${p.highWaist ? 1.4 : 1}' fill='${p.belt}'/>`;
    if (!back && !side && !p.highWaist) s += `<rect x='${cx - 0.5}' y='${waistY - 0.75}' width='1' height='1.3' fill='#b8a060'/>`;
  }
  if (p.shawl) {
    const sf = grad(defs, p.shawl);
    if (back) s += `<path d='M${f1(cx - tW - 0.6)},12.4 Q${cx},11.4 ${f1(cx + tW + 0.6)},12.4 L${cx},17 Z' fill='${sf}' ${ol(p.shawl)}/>`;
    else if (side) s += `<path d='M${f1(cx - tW - 0.4)},12.2 Q${cx},11.6 ${f1(cx + tW + 0.4)},12.4 L${f1(cx + tW)},14.6 Q${cx},15.4 ${f1(cx - tW - 0.2)},15 Z' fill='${sf}' ${ol(p.shawl)}/>`;
    else s += `<path d='M${f1(cx - tW - 0.6)},12.3 Q${cx},11.3 ${f1(cx + tW + 0.6)},12.3 L${f1(cx + tW - 0.6)},14.4 L${cx},15.6 L${f1(cx - tW + 0.6)},14.4 Z' fill='${sf}' ${ol(p.shawl)}/>`;
  }
  if (p.rope) {
    s += `<rect x='${f1(cx - tW)}' y='${waistY - 0.5}' width='${f1(tW * 2)}' height='0.7' fill='${p.rope}'/>`;
    if (!back) s += `<path d='M${f1(cx + (side ? 1 : -1))},${waistY} q0.4,3 -0.2,5.5' stroke='${p.rope}' stroke-width='0.6' fill='none'/>`;
  }
  if (p.purse && !back) s += `<path d='M${f1(cx + (side ? 0.6 : 1.4))},${waistY + 0.3} h1.6 v1.6 q-0.8,0.8 -1.6,0 z' fill='${WOOL.leather}' ${ol(WOOL.leather)}/>`;
  if (p.cowl) {
    // hood worn down as a deep collar
    s += `<path d='M${f1(cx - tW - 0.4)},13.4 Q${cx},${back ? 17.5 : 15.6} ${f1(cx + tW + 0.4)},13.4 Q${cx},11.4 ${f1(cx - tW - 0.4)},13.4 Z' fill='${shade(p.coat, 0.9)}' ${ol(p.coat)}/>`;
  }

  // --- front arms
  const hand = (x, y) => `<circle cx='${f1(x)}' cy='${f1(y)}' r='0.9' fill='${skinFill}' ${ol(sk)}/>`;
  const armRect = (x, color, rolled) =>
    `<rect x='${f1(x)}' y='12.3' width='1.9' height='${armLen}' rx='0.9' fill='${grad(defs, color)}' ${ol(color)}/>` +
    (rolled ? `<rect x='${f1(x + 0.1)}' y='${f1(12.3 + armLen - 2.4)}' width='1.7' height='2.4' rx='0.8' fill='${skinFill}'/>` : '');
  const hanging = (x) => p.hangingSleeves && (side || back) ? `<path d='M${f1(x + 0.2)},15.5 q-0.8,5 0.6,9 l1.2,-0.4 q-0.6,-4 0.1,-8.4 z' fill='${shade(p.coat, 0.85)}' ${ol(p.coat)}/>` : '';
  const prop = p.prop;
  if (side) {
    s += `<g>${walking && prop !== 'spear' && prop !== 'hoe' ? swing(24, cx, 12.6, '0s') : ''}${hanging(cx - 1)}${armRect(cx - 0.9, sleeve, p.sleevesRolled)}${hand(cx + 0.05, 12.3 + armLen + 0.3)}</g>`;
  } else {
    const lx = cx - tW - 1.6, rx = cx + tW - 0.3;
    const leftHeld = prop === 'basket' || prop === 'jug';
    const rightHeld = prop === 'spear' || prop === 'hoe' || prop === 'book';
    s += `<g>${walking && !leftHeld ? swing(9, lx + 1, 12.6, back ? '0s' : HALF) : ''}${hanging(lx)}${armRect(lx, sleeve, p.sleevesRolled)}${hand(lx + 0.95, 12.3 + armLen + 0.3)}</g>`;
    s += `<g>${walking && !rightHeld ? swing(9, rx + 1, 12.6, back ? HALF : '0s') : ''}${hanging(rx)}${armRect(rx, shade(sleeve, 0.92), p.sleevesRolled)}${hand(rx + 0.95, 12.3 + armLen + 0.3)}</g>`;
  }

  // --- head
  const hx = side ? cx + 0.5 : cx;
  const hy = 8.2;
  s += `<rect x='${cx - 0.8}' y='10.6' width='1.6' height='1.6' fill='${shade(sk, 0.85)}'/>`;
  if (p.female && p.head !== 'hennin') {
    // dressed hair framing the face (drawn behind it): coiled over the ears in front,
    // a braid down the back for the cap-wearers
    const hf = grad(defs, hair);
    if (!back) s += `<ellipse cx='${f1(hx - (side ? 0.6 : 0))}' cy='${f1(hy + 0.3)}' rx='${side ? 3.2 : 3.6}' ry='3.6' fill='${hf}' ${ol(hair)}/>`;
    if (p.braid && (back || side)) {
      const bx = back ? hx : hx - 2.6;
      let br = `<path d='M${f1(bx - 0.75)},${f1(hy + 1)} L${f1(bx + 0.75)},${f1(hy + 1)} L${f1(bx + 0.5)},17.2 Q${f1(bx)},17.9 ${f1(bx - 0.5)},17.2 Z' fill='${hf}' ${ol(hair)}/>`;
      for (let y = hy + 2.2; y < 17; y += 1.3) br += `<path d='M${f1(bx - 0.6)},${f1(y)} q0.6,0.6 1.2,0' stroke='${shade(hair, 0.55)}' stroke-width='0.3' fill='none'/>`;
      s += br + `<rect x='${f1(bx - 0.5)}' y='16.6' width='1' height='0.5' fill='${WOOL.madder}'/>`;
    }
  }
  s += `<circle cx='${f1(hx)}' cy='${hy}' r='3' fill='${skinFill}' ${ol(sk)}/>`;
  if (side) s += `<path d='M${f1(hx + 2.8)},${f1(hy - 0.2)} q0.9,0.5 0.1,1.2' fill='${sk}' stroke='${shade(sk, 0.45)}' stroke-width='0.35'/>`;
  if (!back) {
    if (side) s += `<circle cx='${f1(hx + 1.5)}' cy='${f1(hy - 0.2)}' r='0.33' fill='#2a201a'/>`;
    else {
      s += `<circle cx='${f1(hx - 1.1)}' cy='${f1(hy - 0.1)}' r='0.33' fill='#2a201a'/><circle cx='${f1(hx + 1.1)}' cy='${f1(hy - 0.1)}' r='0.33' fill='#2a201a'/>` +
        `<path d='M${f1(hx - 0.6)},${f1(hy + 1.4)} q0.6,0.35 1.2,0' stroke='${shade(sk, 0.55)}' stroke-width='0.3' fill='none'/>`;
    }
  }
  // hair (under any headwear)
  const hairFront = `M${f1(hx - 3)},${f1(hy)} A3,3.1 0 0 1 ${f1(hx + 3)},${f1(hy)} Q${f1(hx + 2.4)},${f1(hy - 1.9)} ${f1(hx)},${f1(hy - 2)} Q${f1(hx - 2.4)},${f1(hy - 1.9)} ${f1(hx - 3)},${f1(hy)} Z`;
  const hairBack = `<circle cx='${f1(hx)}' cy='${f1(hy)}' r='3.05' fill='${grad(defs, hair)}' ${ol(hair)}/>`;
  const hairSide = `<path d='M${f1(hx - 3)},${f1(hy + 1.2)} A3.05,3.1 0 0 1 ${f1(hx + 2.4)},${f1(hy - 1.8)} Q${f1(hx + 0.2)},${f1(hy - 1)} ${f1(hx - 0.2)},${f1(hy + 2)} Z' fill='${hair}' ${ol(hair)}/>`;
  const hairAny = back ? hairBack : side ? hairSide : `<path d='${hairFront}' fill='${hair}' ${ol(hair)}/>`;

  const hc = p.headColor;
  switch (p.head) {
    case 'chaperon': {
      // hood with shoulder cape; liripipe tail behind
      const hf = grad(defs, hc);
      const cape = `<path d='M${f1(cx - tW - 1)},14.6 Q${cx},16.4 ${f1(cx + tW + 1)},14.6 L${f1(cx + tW - 0.2)},11.6 L${f1(cx - tW + 0.2)},11.6 Z' fill='${hf}' ${ol(hc)}/>`;
      if (back) s += cape + `<circle cx='${f1(hx)}' cy='${f1(hy - 0.2)}' r='3.5' fill='${hf}' ${ol(hc)}/><path d='M${f1(hx + 0.4)},${f1(hy - 3.4)} q2.8,2 1.6,8.6' stroke='${shade(hc, 0.8)}' stroke-width='1' fill='none'/>`;
      else if (side) s += cape + `<path d='M${f1(hx + 2.2)},${f1(hy + 2.6)} L${f1(hx + 2.4)},${f1(hy - 1.6)} A3.5,3.6 0 1 0 ${f1(hx - 2.8)},${f1(hy + 2.4)} Z' fill='${hf}' ${ol(hc)}/><path d='M${f1(hx - 2.4)},${f1(hy - 2)} q-2.6,1 -2.4,8' stroke='${shade(hc, 0.8)}' stroke-width='1' fill='none'/>`;
      else s += cape + `<path d='M${f1(hx - 3.5)},${f1(hy + 2.8)} A3.6,3.8 0 1 1 ${f1(hx + 3.5)},${f1(hy + 2.8)} L${f1(hx + 2.3)},${f1(hy + 2.2)} A2.4,2.9 0 1 0 ${f1(hx - 2.3)},${f1(hy + 2.2)} Z' fill='${hf}' ${ol(hc)}/>`;
      break;
    }
    case 'coif':
    case 'wimple': {
      // linen coif; the wimple adds a chin band and a veil to the shoulders
      const lf = grad(defs, hc);
      if (p.head === 'wimple' && !back) s += `<path d='M${f1(hx - 2.8)},${f1(hy + 0.6)} Q${f1(hx)},${f1(hy + 4.6)} ${f1(hx + 2.8)},${f1(hy + 0.6)} L${f1(hx + 2.4)},${f1(hy + 3.6)} Q${f1(hx)},${f1(hy + 5)} ${f1(hx - 2.4)},${f1(hy + 3.6)} Z' fill='${lf}' ${ol(hc)}/>`;
      if (back) s += `<path d='M${f1(hx - 3.4)},${f1(hy)} A3.4,3.5 0 0 1 ${f1(hx + 3.4)},${f1(hy)} L${f1(hx + 3.8)},${p.head === 'wimple' ? 14.6 : f1(hy + 3)} L${f1(hx - 3.8)},${p.head === 'wimple' ? 14.6 : f1(hy + 3)} Z' fill='${lf}' ${ol(hc)}/>`;
      else if (side) s += `<path d='M${f1(hx + 1.4)},${f1(hy - 3)} A3.4,3.4 0 0 0 ${f1(hx - 3.3)},${f1(hy + 1)} L${f1(hx - 3.6)},${p.head === 'wimple' ? 14 : f1(hy + 3)} L${f1(hx - 1)},${f1(hy + 3)} Q${f1(hx - 0.4)},${f1(hy - 1.4)} ${f1(hx + 1.6)},${f1(hy - 2.2)} Z' fill='${lf}' ${ol(hc)}/>`;
      else s += `<path d='M${f1(hx - 3.4)},${f1(hy + 2.6)} A3.5,3.7 0 1 1 ${f1(hx + 3.4)},${f1(hy + 2.6)} L${f1(hx + 2.5)},${f1(hy + 1.2)} Q${f1(hx)},${f1(hy - 3.6)} ${f1(hx - 2.5)},${f1(hy + 1.2)} Z' fill='${lf}' ${ol(hc)}/>`;
      break;
    }
    case 'cap':
    case 'kerchief': {
      // centre-parted hair on top, then a small linen cap on the crown (goodwife) or a
      // kerchief tied at the nape with its tails hanging (matron)
      const hf = grad(defs, hair);
      if (back) s += `<circle cx='${f1(hx)}' cy='${f1(hy)}' r='3.1' fill='${hf}' ${ol(hair)}/>`;
      else if (side) s += hairSide;
      else s += `<path d='M${f1(hx - 3.1)},${f1(hy + 0.6)} Q${f1(hx - 3)},${f1(hy - 3.2)} ${f1(hx)},${f1(hy - 3.1)} Q${f1(hx + 3)},${f1(hy - 3.2)} ${f1(hx + 3.1)},${f1(hy + 0.6)} Q${f1(hx + 2.2)},${f1(hy - 1.6)} ${f1(hx + 0.15)},${f1(hy - 2.1)} L${f1(hx - 0.15)},${f1(hy - 2.1)} Q${f1(hx - 2.2)},${f1(hy - 1.6)} ${f1(hx - 3.1)},${f1(hy + 0.6)} Z' fill='${hf}' ${ol(hair)}/>`;
      const cf = grad(defs, hc);
      if (p.head === 'cap') {
        // linen cap set back on the crown, ties under the hair
        if (back) s += `<path d='M${f1(hx - 2.9)},${f1(hy - 0.6)} A2.9,2.7 0 0 1 ${f1(hx + 2.9)},${f1(hy - 0.6)} Q${f1(hx)},${f1(hy + 0.6)} ${f1(hx - 2.9)},${f1(hy - 0.6)} Z' fill='${cf}' ${ol(hc)}/>`;
        else if (side) s += `<path d='M${f1(hx - 3.1)},${f1(hy + 0.4)} A3.1,3 0 0 1 ${f1(hx + 1.2)},${f1(hy - 3)} Q${f1(hx - 0.6)},${f1(hy - 1.2)} ${f1(hx - 1.4)},${f1(hy + 0.8)} Z' fill='${cf}' ${ol(hc)}/>`;
        else s += `<path d='M${f1(hx - 2.6)},${f1(hy - 2)} Q${f1(hx)},${f1(hy - 4.3)} ${f1(hx + 2.6)},${f1(hy - 2)} Q${f1(hx)},${f1(hy - 2.9)} ${f1(hx - 2.6)},${f1(hy - 2)} Z' fill='${cf}' ${ol(hc)}/>`;
      } else {
        // kerchief: covers crown and back of the head, hairline shows in front, knot at the nape
        if (back) s += `<path d='M${f1(hx - 3.3)},${f1(hy + 0.8)} A3.3,3.4 0 0 1 ${f1(hx + 3.3)},${f1(hy + 0.8)} L${f1(hx)},${f1(hy + 3.4)} Z' fill='${cf}' ${ol(hc)}/>` +
          `<path d='M${f1(hx - 0.3)},${f1(hy + 2.8)} l-1.2,2.6 l1,0.2 z M${f1(hx + 0.3)},${f1(hy + 2.8)} l1.2,2.6 l-1,0.2 z' fill='${shade(hc, 0.9)}' ${ol(hc)}/>`;
        else if (side) s += `<path d='M${f1(hx - 3.3)},${f1(hy + 1.6)} A3.3,3.3 0 0 1 ${f1(hx + 1.6)},${f1(hy - 3)} L${f1(hx + 1)},${f1(hy - 1.6)} Q${f1(hx - 1.2)},${f1(hy - 1)} ${f1(hx - 1.6)},${f1(hy + 1.4)} Z' fill='${cf}' ${ol(hc)}/>` +
          `<path d='M${f1(hx - 3.1)},${f1(hy + 1.4)} l-1,2.4 l0.9,0.3 z' fill='${shade(hc, 0.9)}' ${ol(hc)}/>`;
        else s += `<path d='M${f1(hx - 3.2)},${f1(hy - 1.2)} Q${f1(hx - 3)},${f1(hy - 4.1)} ${f1(hx)},${f1(hy - 4.1)} Q${f1(hx + 3)},${f1(hy - 4.1)} ${f1(hx + 3.2)},${f1(hy - 1.2)} Q${f1(hx)},${f1(hy - 3.4)} ${f1(hx - 3.2)},${f1(hy - 1.2)} Z' fill='${cf}' ${ol(hc)}/>`;
      }
      break;
    }
    case 'hennin': {
      // steeple hennin (15th c. Burgundy/France/England): a tall cone worn tilted back,
      // a sheer veil trailing from its tip, a black velvet frontlet loop on the brow;
      // the hair is hidden underneath
      const nf = grad(defs, hc);
      const tilt = side ? -4.6 : 0;
      const tipX = hx + (side ? tilt : 0.6), tipY = hy - 9; // stays inside the sprite canvas
      const veil = `<path d='M${f1(tipX)},${f1(tipY)} Q${f1(tipX + (side ? -4 : 3.4))},${f1(tipY + 5)} ${f1(hx + (side ? -4.4 : 3.6))},${f1(hy + 7)} L${f1(hx + (side ? -2.6 : 2.2))},${f1(hy + 6.4)} Q${f1(tipX + (side ? -1.6 : 1.4))},${f1(tipY + 5)} ${f1(tipX)},${f1(tipY)} Z' fill='#f4f1ea' opacity='0.55'/>`;
      if (back) {
        s += `<path d='M${f1(hx - 2.8)},${f1(hy - 0.4)} L${f1(tipX)},${f1(tipY)} L${f1(hx + 2.8)},${f1(hy - 0.4)} Z' fill='${nf}' ${ol(hc)}/>` +
          `<path d='M${f1(tipX)},${f1(tipY)} Q${f1(hx - 3.6)},${f1(hy - 2)} ${f1(hx - 3.8)},${f1(hy + 7)} L${f1(hx + 3.8)},${f1(hy + 7)} Q${f1(hx + 3.6)},${f1(hy - 2)} ${f1(tipX)},${f1(tipY)} Z' fill='#f4f1ea' opacity='0.5'/>`;
      } else {
        s += `<path d='M${f1(hx - 2.9 + (side ? -0.6 : 0))},${f1(hy - 0.8)} L${f1(tipX)},${f1(tipY)} L${f1(hx + 2.9 + (side ? -0.6 : 0))},${f1(hy - 1.6)} Q${f1(hx)},${f1(hy - 3.2)} ${f1(hx - 2.9 + (side ? -0.6 : 0))},${f1(hy - 0.8)} Z' fill='${nf}' ${ol(hc)}/>` + veil;
        if (!side) s += `<path d='M${f1(hx - 0.3)},${f1(hy - 2.9)} q0.3,-0.9 0.6,0' stroke='#141414' stroke-width='0.45' fill='none'/>`;
      }
      break;
    }
    case 'veil': {
      // gentlewoman: hair in a gold fillet with a light veil falling behind
      s += hairAny;
      const vf = grad(defs, hc);
      if (back) s += `<path d='M${f1(hx - 3.2)},${f1(hy - 1.4)} Q${f1(hx)},${f1(hy - 4)} ${f1(hx + 3.2)},${f1(hy - 1.4)} L${f1(hx + 4)},15.6 L${f1(hx - 4)},15.6 Z' fill='${vf}' opacity='0.92' ${ol(hc)}/>`;
      else if (side) s += `<path d='M${f1(hx + 0.6)},${f1(hy - 3)} Q${f1(hx - 2.6)},${f1(hy - 2.6)} ${f1(hx - 3.4)},${f1(hy)} L${f1(hx - 4)},15 L${f1(hx - 1.8)},14.6 Q${f1(hx - 1.6)},${f1(hy)} ${f1(hx + 0.6)},${f1(hy - 3)} Z' fill='${vf}' opacity='0.92' ${ol(hc)}/>`;
      else s += `<path d='M${f1(hx - 3.1)},${f1(hy - 1)} Q${f1(hx)},${f1(hy - 3.9)} ${f1(hx + 3.1)},${f1(hy - 1)} L${f1(hx + 3.6)},${f1(hy + 3.6)} L${f1(hx + 2.9)},${f1(hy + 0.4)} Q${f1(hx)},${f1(hy - 2.4)} ${f1(hx - 2.9)},${f1(hy + 0.4)} L${f1(hx - 3.6)},${f1(hy + 3.6)} Z' fill='${vf}' opacity='0.95' ${ol(hc)}/>`;
      s += `<path d='M${f1(hx - 2.9)},${f1(hy - 1.3)} Q${f1(hx)},${f1(hy - 3.3)} ${f1(hx + 2.9)},${f1(hy - 1.3)}' stroke='${WOOL.gold}' stroke-width='0.6' fill='none'/>`;
      break;
    }
    case 'kettle': {
      // kettle hat over a mail coif
      const mf = grad(defs, WOOL.steel);
      if (!back) s += `<path d='M${f1(hx - 3.1)},${f1(hy + 3.2)} L${f1(hx - 3.1)},${f1(hy)} L${f1(hx - 2.3)},${f1(hy + 0.3)} Q${f1(hx - 2.3)},${f1(hy + 2.8)} ${f1(hx)},${f1(hy + 3)} Q${f1(hx + 2.3)},${f1(hy + 2.8)} ${f1(hx + 2.3)},${f1(hy + 0.3)} L${f1(hx + 3.1)},${f1(hy)} L${f1(hx + 3.1)},${f1(hy + 3.2)} Z' fill='${mf}' ${ol(WOOL.steel)}/>`;
      else s += `<circle cx='${f1(hx)}' cy='${f1(hy + 0.4)}' r='3.2' fill='${mf}' ${ol(WOOL.steel)}/>`;
      s += `<path d='M${f1(hx - 2.7)},${f1(hy - 1)} Q${f1(hx)},${f1(hy - 5)} ${f1(hx + 2.7)},${f1(hy - 1)} Z' fill='${grad(defs, '#8a9096')}' ${ol('#8a9096')}/>` +
        `<ellipse cx='${f1(hx)}' cy='${f1(hy - 0.9)}' rx='4.5' ry='${side ? 1.1 : 1}' fill='${shade('#8a9096', 0.92)}' ${ol('#8a9096')}/>`;
      break;
    }
    case 'tonsure': {
      // shaved crown, ring of hair
      if (back || side) s += `<path d='M${f1(hx - 3)},${f1(hy + 0.4)} A3,3 0 0 0 ${f1(hx + 3)},${f1(hy + 0.4)} L${f1(hx + 2.8)},${f1(hy - 1)} Q${f1(hx)},${f1(hy - 0.2)} ${f1(hx - 2.8)},${f1(hy - 1)} Z' fill='${hair}' ${ol(hair)}/>`;
      else s += `<path d='M${f1(hx - 3)},${f1(hy + 0.2)} Q${f1(hx - 2.6)},${f1(hy - 1.8)} ${f1(hx - 1.4)},${f1(hy - 1.9)} Q${f1(hx)},${f1(hy - 1.3)} ${f1(hx + 1.4)},${f1(hy - 1.9)} Q${f1(hx + 2.6)},${f1(hy - 1.8)} ${f1(hx + 3)},${f1(hy + 0.2)} Q${f1(hx + 2.2)},${f1(hy - 0.8)} ${f1(hx)},${f1(hy - 0.6)} Q${f1(hx - 2.2)},${f1(hy - 0.8)} ${f1(hx - 3)},${f1(hy + 0.2)} Z' fill='${hair}' ${ol(hair)}/>`;
      break;
    }
    case 'roundlet': {
      // burgher's padded roundlet with a short hanging tail
      s += hairAny;
      const rf = grad(defs, hc);
      s += `<ellipse cx='${f1(hx)}' cy='${f1(hy - 2.2)}' rx='3.7' ry='1.8' fill='${rf}' ${ol(hc)}/>` +
        `<path d='M${f1(hx - 2.6)},${f1(hy - 2.6)} Q${f1(hx)},${f1(hy - 5.2)} ${f1(hx + 2.6)},${f1(hy - 2.6)} Z' fill='${shade(hc, 0.9)}' ${ol(hc)}/>`;
      if (back || side) s += `<path d='M${f1(side ? hx - 2.8 : hx + 1.6)},${f1(hy - 1.4)} q${side ? -1.2 : 1},3 ${side ? -0.6 : 0.4},6' stroke='${hc}' stroke-width='1.2' fill='none'/>`;
      break;
    }
    case 'straw':
      s += hairAny + `<ellipse cx='${f1(hx)}' cy='${f1(hy - 1.6)}' rx='5' ry='${side ? 1.2 : 1.5}' fill='${grad(defs, WOOL.straw)}' ${ol(WOOL.straw)}/>` +
        `<path d='M${f1(hx - 2.4)},${f1(hy - 1.8)} Q${f1(hx)},${f1(hy - 5)} ${f1(hx + 2.4)},${f1(hy - 1.8)} Z' fill='${shade(WOOL.straw, 0.95)}' ${ol(WOOL.straw)}/>` +
        `<path d='M${f1(hx - 2.4)},${f1(hy - 2.2)} Q${f1(hx)},${f1(hy - 1.4)} ${f1(hx + 2.4)},${f1(hy - 2.2)}' stroke='${WOOL.madder}' stroke-width='0.5' fill='none'/>`;
      break;
    default:
      s += hairAny;
  }

  // --- props carried in front
  if (prop === 'spear') {
    const px = side ? cx + 2.2 : cx + tW + 0.9;
    s += `<line x1='${f1(px)}' y1='1' x2='${f1(px)}' y2='29.5' stroke='#6a5038' stroke-width='0.75'/>` +
      `<path d='M${f1(px)},-0.6 l0.9,2.4 l-0.9,0.6 l-0.9,-0.6 z' fill='#b9bcc2' ${ol('#b9bcc2')}/>`;
  } else if (prop === 'hoe') {
    const px = side ? cx + 2 : cx + tW + 0.9;
    s += `<line x1='${f1(px)}' y1='6' x2='${f1(px)}' y2='29.5' stroke='#7a5a3a' stroke-width='0.7'/><path d='M${f1(px)},6 h-2.6 v1.2 z' fill='#6a6e74'/>`;
  } else if (prop === 'sack') {
    if (back) s += `<path d='M${cx - 3.2},12.6 q3.2,-1.6 6.4,0 q0.8,3.6 -0.6,6.2 q-2.6,1 -5.2,0 q-1.4,-2.6 -0.6,-6.2 z' fill='${grad(defs, '#b8a47a')}' ${ol('#b8a47a')}/><path d='M${cx - 1.6},12.4 q1.6,-1.2 3.2,0' stroke='#8a7650' stroke-width='0.5' fill='none'/>`;
    else if (!side) s += `<path d='M${f1(cx - tW + 0.2)},12.4 L${f1(cx + tW - 0.2)},${waistY - 0.8}' stroke='#7a6040' stroke-width='0.7'/>`;
  } else if (prop === 'basket' && !back) {
    const bx = side ? cx + 0.2 : cx - tW - 1.4;
    s += `<path d='M${f1(bx - 1.6)},18.6 h3.6 l-0.4,2.6 h-2.8 z' fill='${grad(defs, '#a07a44')}' ${ol('#a07a44')}/><path d='M${f1(bx - 1.2)},18.8 q1.4,-3 2.8,0' stroke='#7a5a34' stroke-width='0.45' fill='none'/>` +
      `<circle cx='${f1(bx - 0.4)}' cy='18.3' r='0.6' fill='#c84a3a'/><circle cx='${f1(bx + 0.9)}' cy='18.4' r='0.6' fill='#7aa04a'/>`;
  } else if (prop === 'jug' && !back) {
    const jx = side ? cx + 0.4 : cx - tW - 0.8;
    s += `<path d='M${f1(jx - 0.9)},17.8 h1.8 q0.6,1.4 0.4,3 h-2.6 q-0.2,-1.6 0.4,-3 z' fill='${grad(defs, '#9a6a44')}' ${ol('#9a6a44')}/>`;
  } else if (prop === 'book' && !back) {
    const kx = side ? cx + 0.6 : cx + tW + 0.3;
    s += `<rect x='${f1(kx - 0.6)}' y='17.6' width='2.2' height='2.8' rx='0.3' fill='#5a2a24' ${ol('#5a2a24')}/>`;
  }

  // body bob while walking, slow breathing while idle
  const bob = walking
    ? `<animateTransform attributeName='transform' type='translate' values='0 0;0 -0.55;0 0;0 -0.55;0 0' dur='${STRIDE}' repeatCount='indefinite'/>`
    : `<animateTransform attributeName='transform' type='translate' values='0 0;0 -0.18;0 0' dur='3.2s' repeatCount='indefinite'/>`;
  const scale = p.child ? `transform='translate(10 30.5) scale(0.74) translate(-10 -30.5)'` : '';
  return `<defs>${defs.join('')}</defs><g ${scale}><g>${bob}${s}</g></g>`;
};

const _cache = new Map();
// view: 's' | 'n' | 'e' | 'w' ('w' renders the 'e' sprite; the caller mirrors it).
export const townsfolkSprite = (look, skin, view = 's', walking = false) => {
  const v = view === 'w' ? 'e' : view;
  const key = `${look}|${skin}|${v}|${walking ? 1 : 0}`;
  let out = _cache.get(key);
  if (out === undefined) {
    const role = roleForLook(look);
    const variant = Math.floor(look / POOL.length);
    const p = ROLES[role](variant);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 -1 ${FIG_W} ${FIG_H + 1}'>${figure(p, v, walking, skin, look + skin)}</svg>`;
    out = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    _cache.set(key, out);
  }
  return out;
};

export const TOWNSFOLK_ROLES = Object.keys(ROLES);
export const lookForRole = (role, variant = 0) => {
  const i = POOL.indexOf(role);
  return i < 0 ? 0 : i + POOL.length * (variant % 4);
};

// Sprite look for a town-roster NPC (npcGenerator's populateTown output), so a walker
// is drawn to match the resident it represents. Keyed on roster role, gender and age.
const RESIDENT_ROLE = {
  Guard: 'guard', Jailer: 'guard',
  Priest: 'friar', Acolyte: 'friar',
  Merchant: 'burgher', Banker: 'burgher', Magistrate: 'burgher', Harbormaster: 'burgher',
  Archivist: 'burgher', Librarian: 'burgher', Mage: 'burgher', Alchemist: 'burgher',
  Noble: 'burgher', Gentry: 'burgher',
  Farmer: 'farmer', Miller: 'farmer', Stablemaster: 'farmer',
  Blacksmith: 'labourer', Boatwright: 'labourer', Fletcher: 'labourer', Tailor: 'labourer',
};
export const lookForResident = (npc, variant = 0) => {
  const female = npc.gender === 'Female';
  const age = Number(npc.age) || 30;
  let role;
  if (/Child/.test(npc.role || '') || npc.title === 'Child' || age < 14) role = 'child';
  else if (female) role = (npc.role === 'Noble' || npc.role === 'Gentry') ? 'lady' : age >= 40 ? 'matron' : 'goodwife';
  else role = RESIDENT_ROLE[npc.role] || 'peasant';
  return lookForRole(role, variant);
};
