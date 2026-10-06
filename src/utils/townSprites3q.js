// townSprites3q.js
// PROTOTYPE (debug-only, /debug/town-3q): a "3/4 top-down" sprite layer for towns.
//
// The live town art (townTileArt.js) draws every building as a flat roof icon inside
// its own tile. This module instead draws buildings, trees, walls and townsfolk as
// upright sprites that stand on their tile and overlap the tile above, so the map
// reads as implied 3D (Ultima VII / classic JRPG camera) instead of a floor plan.
//
// How the depth is faked: each structure is built from small convex 3D solids
// (boxes, roof prisms, pyramids, cones) projected with a cabinet-style oblique camera
// (depth recedes up and slightly right). Faces are back-face culled and shaded from a
// single light direction, so every building gets consistent lit fronts, dark right
// sides, shingled slopes and a cast shadow, all generated from data.
//
// Still a pure view layer: sprites are keyed only by tile fields + coordinates, so
// like the rest of the tile art this re-skins every existing save without touching
// map data (CLAUDE.md, back-compat rule 1). Output is an SVG data-URI string for an
// <img>/background; SMIL handles the ambient motion (smoke, flicker, sails, sway).

// --- colour helpers -------------------------------------------------------------
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r, g, b) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const shade = (hex, f) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * f, g * f, b * f);
};
const mixHex = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};

const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const seedOf = (x = 0, y = 0) => (((x * 73856093) ^ (y * 19349663)) >>> 0);
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// --- palette: muted, painterly, pulled toward the encounter paintings --------------
const P = {
  plaster: '#d8c9a8', plasterWarm: '#cfb68e', timber: '#4a3424', stone: '#a39a8a',
  stoneDark: '#7d7568', stonePale: '#c4bba8', wood: '#7a5638', woodDark: '#563c27',
  glass: '#f2c46a', glassDim: '#55616b', door: '#4b3121', iron: '#3c3c42',
  terracotta: '#9a5440', slate: '#525d66', thatch: '#a88a52', shingle: '#6e5a45',
  moss: '#5d6b4a', gold: '#b89a48', violet: '#5d4a8c', teal: '#467268',
  snow: '#eef2f6', sand: '#d8bf8c', adobe: '#c9a274',
};
// Muted version of the live tileset's per-type roof colours, so each building keeps
// its identity colour from the flat art, just less candy-bright.
const ROOF = {
  house: null, // houses pick a varied vernacular roof per tile
  manor: '#7a4c66', keep: '#5a5f66', barracks: '#4f5860', inn: '#9a6a34', tavern: '#94603a',
  shop: '#3f6f63', market: '#b07a3a', temple: '#9a8448', bank: '#8d8676', guild: '#4f5f92',
  library: '#475887', archives: '#655438', blacksmith: '#4e4a46', foundry: '#46423e',
  barn: '#7d4a30', warehouse: '#6e4c30', alchemist: '#6a5088', apothecary: '#527a50',
  fletcher: '#626c3a', harbormaster: '#3d6489', boathouse: '#46707f', jail: '#454548',
  magetower: '#5a4696', mill: '#9a7a46', shrine: '#9a8640', stables: '#7a5e38',
  tailor: '#86607a', townhall: '#857a52', workshop: '#467c7a',
};
const desat = (hex) => mixHex(hex, '#6b6358', 0.22);

// --- the oblique camera + lighting ---------------------------------------------------
// Sprite canvas: 60 x 100 units. One tile = 40 units; the footprint tile occupies
// x 10..50, y 60..100. World coords: x right, y = depth (back), z = height.
export const SPRITE_W = 60;
export const SPRITE_H = 100;
const RECEDE_X = 0.25; // depth shifts right on screen (shows the shaded east face)
const RECEDE_Y = 0.7; // depth shifts up on screen
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const LIGHT = norm([-0.55, -0.55, 0.65]); // from front-left and above: fronts lit, east faces dark

// A camera maps world (x, y, z) to sprite units. `toward` (the direction from the scene
// to the camera) drives back-face culling. Walls use rx=0, ry=1 so their ground footprint
// maps 1:1 onto the square tile grid and neighbouring segments join up.
const makeCam = (ox, oy, rx = RECEDE_X, ry = RECEDE_Y) => {
  const cam = ([x, y, z]) => [ox + x + y * rx, oy - z - y * ry];
  cam.toward = norm([rx, -1, ry]);
  return cam;
};
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const ptsStr = (pts) => pts.map(([a, b]) => `${fmt(a)},${fmt(b)}`).join(' ');

// Draws the visible faces of ONE convex solid. Each face: { pts: [[x,y,z]...], color,
// rows? (shingle line count), stroke? }. Outward normals are derived from the solid's
// centre, back faces are culled, the rest are lit by LIGHT. Faces of a convex solid
// never overlap once culled, so draw order inside a solid does not matter.
const solid = (cam, faces, center, opts = {}) => {
  const { amb = 0.64, k = 0.48 } = opts;
  let out = '';
  for (const f of faces) {
    const p = f.pts;
    let n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const c = p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length, s[2] + q[2] / p.length], [0, 0, 0]);
    if (dot(n, sub(c, center)) < 0) n = n.map((v) => -v);
    if (dot(n, cam.toward) <= 0.001) continue;
    const lum = amb + k * Math.max(0, dot(n, LIGHT));
    const fill = shade(f.color, lum);
    const scr = p.map(cam);
    out += `<polygon points='${ptsStr(scr)}' fill='${fill}'${f.edge ? ` stroke='${shade(f.color, lum * 0.6)}' stroke-width='0.4' stroke-linejoin='round'` : ''}/>`;
    if (f.rows && p.length === 4) {
      // shingle / plank courses: lines between edge p0->p3 and p1->p2
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let i = 1; i < f.rows; i++) {
        const t = i / f.rows;
        const a = lerp(scr[0], scr[3], t), b = lerp(scr[1], scr[2], t);
        out += `<line x1='${fmt(a[0])}' y1='${fmt(a[1])}' x2='${fmt(b[0])}' y2='${fmt(b[1])}' stroke='${shade(f.color, lum * 0.62)}' stroke-width='0.55' opacity='0.75'/>`;
      }
    }
  }
  return out;
};

const box = (cam, x0, x1, y0, y1, z0, z1, color, opts = {}) => {
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const v = (x, y, z) => [x, y, z];
  return solid(cam, [
    { pts: [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)], color: opts.front || color },
    { pts: [v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)], color: opts.side || color },
    { pts: [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], color: opts.top || color, rows: opts.topRows },
    { pts: [v(x0, y1, z0), v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1)], color: opts.side || color },
  ], c, opts);
};

// Gable roof with its ridge running left-right (along x). Overhang `o` on all eaves.
const gableX = (cam, x0, x1, D, H, R, roof, o = 2) => {
  const v = (x, y, z) => [x, y, z];
  const c = [(x0 + x1) / 2, D / 2, H + R / 3];
  return solid(cam, [
    { pts: [v(x0 - o, -o, H), v(x1 + o, -o, H), v(x1 + o, D / 2, H + R), v(x0 - o, D / 2, H + R)], color: roof, rows: 5 },
    { pts: [v(x0 - o, D / 2, H + R), v(x1 + o, D / 2, H + R), v(x1 + o, D + o, H), v(x0 - o, D + o, H)], color: roof, rows: 4 },
    { pts: [v(x1 + o, -o, H), v(x1 + o, D + o, H), v(x1 + o, D / 2, H + R)], color: roof },
    { pts: [v(x0 - o, D + o, H), v(x0 - o, -o, H), v(x0 - o, D / 2, H + R)], color: roof },
  ], c);
};

// Gable roof with its ridge running front-back: the triangular gable faces the viewer.
const gableY = (cam, x0, x1, D, H, R, roof, gableWall, o = 2) => {
  const v = (x, y, z) => [x, y, z];
  const cx = (x0 + x1) / 2;
  const c = [cx, D / 2, H + R / 3];
  const L = x0 - o, Rr = x1 + o;
  return solid(cam, [
    { pts: [v(L, D + o, H), v(L, 0, H), v(cx, 0, H + R), v(cx, D + o, H + R)], color: roof, rows: 5 },
    { pts: [v(cx, 0, H + R), v(Rr, 0, H), v(Rr, D + o, H), v(cx, D + o, H + R)], color: roof, rows: 5 },
    { pts: [v(L, 0, H), v(Rr, 0, H), v(cx, 0, H + R)], color: gableWall, edge: true },
    { pts: [v(L, D + o, H), v(Rr, D + o, H), v(cx, D + o, H + R)], color: gableWall },
  ], c);
};

// Hip roof: ridge shortened by `h` at both ends.
const hip = (cam, x0, x1, D, H, R, roof, o = 2, h = 7) => {
  const v = (x, y, z) => [x, y, z];
  const L = x0 - o, Rr = x1 + o, F = -o, B = D + o, m = D / 2;
  const c = [(x0 + x1) / 2, m, H + R / 3];
  return solid(cam, [
    { pts: [v(L, F, H), v(Rr, F, H), v(x1 - h, m, H + R), v(x0 + h, m, H + R)], color: roof, rows: 5 },
    { pts: [v(x0 + h, m, H + R), v(x1 - h, m, H + R), v(Rr, B, H), v(L, B, H)], color: roof, rows: 4 },
    { pts: [v(Rr, F, H), v(Rr, B, H), v(x1 - h, m, H + R)], color: roof },
    { pts: [v(L, B, H), v(L, F, H), v(x0 + h, m, H + R)], color: roof },
  ], c);
};

const pyramid = (cam, x0, x1, y0, y1, H, R, roof, o = 1.5) => {
  const v = (x, y, z) => [x, y, z];
  const ap = v((x0 + x1) / 2, (y0 + y1) / 2, H + R);
  const L = x0 - o, Rr = x1 + o, F = y0 - o, B = y1 + o;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, H + R / 3];
  return solid(cam, [
    { pts: [v(L, F, H), v(Rr, F, H), ap], color: roof },
    { pts: [v(Rr, F, H), v(Rr, B, H), ap], color: roof },
    { pts: [v(Rr, B, H), v(L, B, H), ap], color: roof },
    { pts: [v(L, B, H), v(L, F, H), ap], color: roof },
  ], c);
};

// Faceted cone (a round tower roof). Facets are convex-solid faces, so the same culling
// + lighting gives it a smooth light-to-dark sweep.
const cone = (cam, cx, cy, r, H, R, roof, n = 12) => {
  const ap = [cx, cy, H + R];
  const faces = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    faces.push({ pts: [[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, H], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, H], ap], color: roof });
  }
  return solid(cam, faces, [cx, cy, H + R / 3]);
};

// Faceted cylinder (round tower body).
const cylinder = (cam, cx, cy, r, z0, z1, color, n = 12) => {
  const faces = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    faces.push({ pts: [[p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]], color });
  }
  return solid(cam, faces, [cx, cy, (z0 + z1) / 2], { amb: 0.6, k: 0.55 });
};

// --- animation snippets -----------------------------------------------------------
// An animated SVG used as a CSS background is re-rasterised in full every frame, so
// motion that would sit on dozens of sprites (chimney smoke, window glow, tree sway,
// crop ripple) is kept out of the SVG. Chimney smoke is reported as emitter points
// (buildingSmoke3q) for the page to draw as CSS puffs; trees sway via a CSS transform on
// their element. SMIL stays only on rare one-off sprites (flags, mill sails, fountain).
let _smokeOut = null; // collects emitters while a building sprite is drawn
const smoke = (x, y, dark = false, delay = 0) => {
  if (_smokeOut) _smokeOut.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, dark, delay: Math.round(delay * 10) / 10 });
  return '';
};
const flicker = () => '';

// --- front-wall dressing (drawn in the y=0 plane, so screen = (ox+x, oy-z)) ----------
const wallDressing = (ox, oy, x0, x1, H, style, color, r) => {
  const X = (x) => ox + x, Z = (z) => oy - z;
  let s = '';
  // ambient occlusion at the wall foot + a stone plinth
  s += `<rect x='${fmt(X(x0))}' y='${fmt(Z(1.6))}' width='${fmt(x1 - x0)}' height='1.6' fill='${shade(P.stoneDark, 0.85)}'/>`;
  if (style === 'timber') {
    const beam = P.timber;
    const posts = [x0 + 0.6, (x0 + x1) / 2, x1 - 0.6];
    for (const px of posts) s += `<rect x='${fmt(X(px) - 0.6)}' y='${fmt(Z(H))}' width='1.2' height='${fmt(H - 1.6)}' fill='${beam}' opacity='0.85'/>`;
    s += `<rect x='${fmt(X(x0))}' y='${fmt(Z(H * 0.55))}' width='${fmt(x1 - x0)}' height='1' fill='${beam}' opacity='0.85'/>`;
    s += `<line x1='${fmt(X(x0 + 0.6))}' y1='${fmt(Z(H * 0.55))}' x2='${fmt(X((x0 + x1) / 2 - 3))}' y2='${fmt(Z(H - 0.5))}' stroke='${beam}' stroke-width='0.8' opacity='0.7'/>`;
    s += `<line x1='${fmt(X(x1 - 0.6))}' y1='${fmt(Z(H * 0.55))}' x2='${fmt(X((x0 + x1) / 2 + 3))}' y2='${fmt(Z(H - 0.5))}' stroke='${beam}' stroke-width='0.8' opacity='0.7'/>`;
  } else if (style === 'stone') {
    for (let z = 3.2, row = 0; z < H; z += 2.4, row++) {
      s += `<line x1='${fmt(X(x0))}' y1='${fmt(Z(z))}' x2='${fmt(X(x1))}' y2='${fmt(Z(z))}' stroke='${shade(color, 0.72)}' stroke-width='0.35' opacity='0.8'/>`;
      for (let x = x0 + (row % 2 ? 2 : 4); x < x1; x += 4.5) {
        s += `<line x1='${fmt(X(x))}' y1='${fmt(Z(z))}' x2='${fmt(X(x))}' y2='${fmt(Z(Math.min(H, z + 2.4)))}' stroke='${shade(color, 0.72)}' stroke-width='0.3' opacity='0.6'/>`;
      }
    }
  } else if (style === 'planks') {
    for (let x = x0 + 2.2; x < x1; x += 2.2) s += `<line x1='${fmt(X(x))}' y1='${fmt(Z(H))}' x2='${fmt(X(x))}' y2='${fmt(Z(1.6))}' stroke='${shade(color, 0.7)}' stroke-width='0.35' opacity='0.8'/>`;
  }
  // soft grime/AO gradient up the wall
  s += `<rect x='${fmt(X(x0))}' y='${fmt(Z(H * 0.45))}' width='${fmt(x1 - x0)}' height='${fmt(H * 0.45 - 1.6)}' fill='url(#ao)'/>`;
  return s;
};

const windowAt = (ox, oy, x, z, w, h, lit, seed, glass = P.glass) => {
  const X = ox + x, Y = oy - z - h;
  return `<rect x='${fmt(X - 0.5)}' y='${fmt(Y - 0.5)}' width='${fmt(w + 1)}' height='${fmt(h + 1)}' fill='${P.timber}'/>` +
    `<rect x='${fmt(X)}' y='${fmt(Y)}' width='${fmt(w)}' height='${fmt(h)}' fill='${lit ? glass : P.glassDim}'/>` +
    // unlit glass catches the sky, so it reads as glazing rather than an empty hole
    (lit ? '' : `<path d='M${fmt(X + 0.3)},${fmt(Y + h * 0.55)} L${fmt(X + w * 0.55)},${fmt(Y + 0.3)}' stroke='#c9d6de' stroke-width='0.6' opacity='0.55'/>`) +
    `<line x1='${fmt(X + w / 2)}' y1='${fmt(Y)}' x2='${fmt(X + w / 2)}' y2='${fmt(Y + h)}' stroke='${P.timber}' stroke-width='0.45'/>` +
    `<line x1='${fmt(X)}' y1='${fmt(Y + h / 2)}' x2='${fmt(X + w)}' y2='${fmt(Y + h / 2)}' stroke='${P.timber}' stroke-width='0.45'/>` +
    `<rect x='${fmt(X - 0.8)}' y='${fmt(Y + h + 0.3)}' width='${fmt(w + 1.6)}' height='0.7' fill='${shade(P.stone, 0.9)}'/>`;
};
const doorAt = (ox, oy, x, w, h, color = P.door, glow = null) => {
  const X = ox + x, Y = oy - h;
  const arch = `M${fmt(X)},${fmt(oy)} L${fmt(X)},${fmt(Y + w / 2)} Q${fmt(X + w / 2)},${fmt(Y - w * 0.15)} ${fmt(X + w)},${fmt(Y + w / 2)} L${fmt(X + w)},${fmt(oy)} Z`;
  return `<path d='${arch}' fill='${shade(P.stoneDark, 0.8)}' transform='translate(-0.6,0) scale(1)'/>` +
    `<path d='${arch}' fill='${glow || color}'>${glow ? flicker(Math.round(x * 13)) : ''}</path>` +
    (glow ? '' : `<line x1='${fmt(X + w / 2)}' y1='${fmt(Y + w * 0.3)}' x2='${fmt(X + w / 2)}' y2='${fmt(oy)}' stroke='${shade(color, 0.6)}' stroke-width='0.4'/>` +
      `<circle cx='${fmt(X + w * 0.75)}' cy='${fmt(oy - h * 0.45)}' r='0.4' fill='#c9a85a'/>`);
};
const hangingSign = (ox, oy, x, z, color) =>
  `<line x1='${fmt(ox + x)}' y1='${fmt(oy - z)}' x2='${fmt(ox + x + 5)}' y2='${fmt(oy - z)}' stroke='${P.iron}' stroke-width='0.6'/>` +
  `<g>` +
  `<rect x='${fmt(ox + x + 2)}' y='${fmt(oy - z + 0.8)}' width='4.4' height='3.4' rx='0.4' fill='${color}' stroke='${P.timber}' stroke-width='0.4'/></g>`;
const lantern = (x, y, seed) =>
  `<circle cx='${fmt(x)}' cy='${fmt(y)}' r='3' fill='#ffcf6a' opacity='0.25'>${flicker(seed)}</circle>` +
  `<rect x='${fmt(x - 0.8)}' y='${fmt(y - 1)}' width='1.6' height='2' fill='#ffd77a' stroke='${P.iron}' stroke-width='0.3'/>`;
const flag = (x, y, color) =>
  `<line x1='${fmt(x)}' y1='${fmt(y)}' x2='${fmt(x)}' y2='${fmt(y - 9)}' stroke='${P.iron}' stroke-width='0.5'/>` +
  `<path fill='${color}' d='M${fmt(x)},${fmt(y - 9)} q3,-1 6,0 q-1,1.5 0,3 q-3,-1 -6,0 Z'/>`;

// Cast shadow on the ground: footprint extruded away from the light (back-right).
const castShadow = (cam, x0, x1, D, H) => {
  const dx = H * 0.55, dy = H * 0.45;
  const g = (x, y) => cam([x, y, 0]);
  const pts = [g(x0, 0), g(x1, 0), g(x1 + dx, dy), g(x1 + dx, D + dy), g(x0 + dx, D + dy), g(x0, D)];
  return `<polygon points='${ptsStr(pts)}' fill='#0d0f14' opacity='0.26' filter='url(#soft)'/>`;
};

const defs =
  `<defs><linearGradient id='ao' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='0.22'/></linearGradient>` +
  `<filter id='soft' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='0.9'/></filter></defs>`;
// Sprites are emitted still: any SMIL left in a snippet is dropped here, because one
// animated background image repaints the whole layer it sits in, every frame.
const still = (svg) => svg.replace(/<animate(?:Transform)?\b[^>]*\/>/g, '');
const wrap = (inner) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    still(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${SPRITE_W} ${SPRITE_H}'>${defs}${inner}</svg>`)
  )}")`;

// --- building specs ------------------------------------------------------------------
// Specs are authored at 1x; SCALE sizes every footprint relative to the 40-unit tile.
const SCALE = 1.2;
// roof: 'gx' ridge along x | 'gy' gable to the front | 'hip' | 'flat' | 'pyr' | 'cone' | 'dome'
const SPEC = {
  house: { w: 24, d: 18, h: 12, r: 9, roof: 'mix', wall: 'mix', windows: 1, chimney: 0.7 },
  inn: { w: 34, d: 22, h: 21, r: 11, roof: 'gx', wall: 'timber', windows: 2, rows2: true, chimney: 1, sign: '#9a6a34', lantern: true },
  tavern: { w: 32, d: 22, h: 19, r: 11, roof: 'gx', wall: 'timber', windows: 2, rows2: true, chimney: 1, sign: '#7a3a2a', lantern: true },
  barn: { w: 34, d: 24, h: 13, r: 13, roof: 'gx', wall: 'planks', wallColor: '#7a4a32', bigDoor: true },
  warehouse: { w: 34, d: 22, h: 14, r: 9, roof: 'gx', wall: 'planks', wallColor: P.wood, bigDoor: true, crates: true },
  stables: { w: 34, d: 20, h: 10, r: 9, roof: 'gx', wall: 'planks', wallColor: P.wood, stalls: true },
  blacksmith: { w: 26, d: 20, h: 12, r: 9, roof: 'gy', wall: 'stone', forge: true, chimney: 1, darkSmoke: true },
  foundry: { w: 32, d: 22, h: 15, r: 6, roof: 'gx', wall: 'stone', wallColor: P.stoneDark, forge: true, stack: true },
  temple: { w: 30, d: 26, h: 18, r: 12, roof: 'gy', wall: 'stone', wallColor: P.stonePale, columns: true, belfry: true },
  shrine: { w: 18, d: 16, h: 10, r: 8, roof: 'gy', wall: 'stone', wallColor: P.stonePale, candle: true },
  bank: { w: 30, d: 22, h: 16, r: 5, roof: 'gy', wall: 'stone', wallColor: P.stonePale, columns: true },
  manor: { w: 36, d: 24, h: 20, r: 10, roof: 'hip', wall: 'stone', windows: 3, rows2: true, chimney: 1 },
  townhall: { w: 36, d: 24, h: 18, r: 9, roof: 'hip', wall: 'stone', windows: 3, rows2: true, clock: true },
  keep: { keep: true, flag: '#8a2f2a' },
  barracks: { w: 34, d: 22, h: 15, roof: 'flat', wall: 'stone', crenel: true, windows: 2, slit: true, flag: '#4f5f92' },
  jail: { w: 28, d: 22, h: 14, roof: 'flat', wall: 'stone', wallColor: P.stoneDark, windows: 2, bars: true },
  magetower: { round: true, rad: 10, h: 36, r: 16, roof: 'cone', wall: 'stone', glass: '#b48cff', sparkle: true },
  alchemist: { w: 26, d: 22, h: 13, roof: 'dome', wall: 'stone', glass: '#8ff0b0', chimney: 1 },
  apothecary: { w: 26, d: 20, h: 13, r: 9, roof: 'gx', wall: 'timber', windows: 1, sign: '#527a50', herbs: true },
  fletcher: { w: 26, d: 20, h: 12, r: 9, roof: 'gy', wall: 'planks', wallColor: P.wood, sign: '#626c3a' },
  tailor: { w: 26, d: 20, h: 14, r: 9, roof: 'gy', wall: 'timber', windows: 1, sign: '#86607a', awning: '#86607a' },
  workshop: { w: 28, d: 20, h: 13, r: 8, roof: 'gx', wall: 'stone', windows: 1, gear: true, chimney: 1 },
  guild: { w: 30, d: 22, h: 18, r: 10, roof: 'gy', wall: 'stone', windows: 2, banner: '#4f5f92' },
  archives: { w: 30, d: 22, h: 16, r: 8, roof: 'gx', wall: 'stone', windows: 2 },
  library: { w: 32, d: 22, h: 18, r: 10, roof: 'gx', wall: 'stone', wallColor: P.stonePale, windows: 3, tall: true },
  shop: { w: 24, d: 18, h: 12, r: 9, roof: 'gy', wall: 'timber', awning: '#3f6f63', crates: true },
  market: { stall: true },
  mill: { round: true, rad: 9, h: 24, r: 10, roof: 'cone', wall: 'stone', wallColor: P.stonePale, sails: true },
  harbormaster: { w: 30, d: 22, h: 15, r: 10, roof: 'gx', wall: 'stone', windows: 2, flag: '#3d6489' },
  boathouse: { w: 34, d: 24, h: 12, r: 10, roof: 'gx', wall: 'planks', wallColor: P.woodDark, bigDoor: true },
};

const HOUSE_ROOFS = [P.terracotta, P.slate, P.thatch, P.shingle, P.moss];
const HOUSE_WALLS = ['timber', 'timber', 'stone', 'plaster'];

const themeTint = (theme) => ({
  wall: theme === 'desert' ? P.adobe : null,
  roofMix: theme === 'snow' ? [P.snow, 0.72] : theme === 'desert' ? ['#b7704a', 0.35] : null,
});

const buildingSvg = (type, seed, theme) => {
  const r = rng(seed ^ 0x9e3779b9);
  const sp = SPEC[type] || SPEC.house;
  const tint = themeTint(theme);
  const ox = 30, oy = 92; // world origin: the front-left of the footprint, centred on the tile
  const cam = makeCam(ox, oy);
  if (sp.stall) return marketStall(cam, ox, oy, r);
  if (sp.round) return roundTower(cam, ox, oy, sp, type, r, tint);
  if (sp.keep) return keepTower(cam, ox, oy, sp, r, tint, theme);

  const w = Math.round((sp.w + (type === 'house' ? Math.round(r() * 6) - 2 : 0)) * SCALE);
  const D = sp.d * SCALE, H = sp.h * SCALE, R = (sp.r || 0) * SCALE;
  const x0 = -w / 2 - 2, x1 = x0 + w;
  let roofKind = sp.roof === 'mix' ? (r() < 0.5 ? 'gx' : 'gy') : sp.roof;
  if (theme === 'desert' && type === 'house') roofKind = 'flat';
  let wallStyle = sp.wall === 'mix' ? pick(r, HOUSE_WALLS) : sp.wall;
  if (theme === 'desert' && wallStyle === 'timber') wallStyle = 'plaster'; // adobe, not half-timber
  let wallColor = sp.wallColor || (wallStyle === 'stone' ? P.stone : wallStyle === 'timber' ? P.plaster : wallStyle === 'plaster' ? P.plasterWarm : P.wood);
  if (tint.wall && wallStyle !== 'planks') wallColor = mixHex(wallColor, tint.wall, 0.6);
  let roof = type === 'house' ? pick(r, HOUSE_ROOFS) : desat(ROOF[type] || P.terracotta);
  if (tint.roofMix) roof = mixHex(roof, tint.roofMix[0], tint.roofMix[1]);
  const glass = sp.glass || P.glass;

  let s = castShadow(cam, x0, x1, D, H + R * 0.6);
  s += box(cam, x0, x1, 0, D, 0, H, wallColor);
  s += wallDressing(ox, oy, x0, x1, H, wallStyle, wallColor, r);

  // openings on the front wall
  const mid = (x0 + x1) / 2;
  let door = null; // [left, width] of the front opening, kept clear of windows
  if (sp.forge) { s += doorAt(ox, oy, mid - 4, 8, 8, P.door, '#ff8a2a'); door = [mid - 4, 8]; }
  else if (sp.bigDoor) {
    door = [mid - 6, 12];
    s += `<rect x='${fmt(ox + mid - 6)}' y='${fmt(oy - 9)}' width='12' height='9' fill='${P.woodDark}'/>` +
      `<path d='M${fmt(ox + mid - 6)},${fmt(oy - 9)} L${fmt(ox + mid + 6)},${fmt(oy)} M${fmt(ox + mid + 6)},${fmt(oy - 9)} L${fmt(ox + mid - 6)},${fmt(oy)}' stroke='${shade(P.wood, 1.1)}' stroke-width='0.7'/>` +
      `<line x1='${fmt(ox + mid)}' y1='${fmt(oy - 9)}' x2='${fmt(ox + mid)}' y2='${fmt(oy)}' stroke='${P.timber}' stroke-width='0.6'/>`;
  } else if (sp.stalls) {
    door = [x0, w];
    for (let i = 0; i < 3; i++) {
      const sx = x0 + 3 + i * ((w - 6) / 3);
      s += `<rect x='${fmt(ox + sx)}' y='${fmt(oy - 7)}' width='${fmt((w - 6) / 3 - 2)}' height='4' fill='#2a1d14'/>` +
        `<rect x='${fmt(ox + sx)}' y='${fmt(oy - 3.6)}' width='${fmt((w - 6) / 3 - 2)}' height='3.6' fill='${P.woodDark}'/>`;
    }
    s += `<ellipse cx='${fmt(ox + x1 - 1)}' cy='${fmt(oy + 1)}' rx='3.5' ry='1.8' fill='#c9a64e'/>`;
  } else if (sp.columns) {
    s += doorAt(ox, oy, mid - 2.5, 5, 8);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const cx = x0 + 2.5 + i * ((w - 5) / (n - 1));
      s += `<rect x='${fmt(ox + cx - 1.1)}' y='${fmt(oy - H + 1)}' width='2.2' height='${fmt(H - 2.6)}' fill='${shade(P.stonePale, 1.08)}'/>` +
        `<rect x='${fmt(ox + cx - 1.1 + 1.4)}' y='${fmt(oy - H + 1)}' width='0.8' height='${fmt(H - 2.6)}' fill='${shade(P.stonePale, 0.8)}'/>`;
    }
    s += `<rect x='${fmt(ox + x0 - 0.5)}' y='${fmt(oy - 1.6)}' width='${fmt(w + 1)}' height='1.6' fill='${shade(P.stonePale, 0.9)}'/>`;
  } else {
    const dx = sp.windows >= 2 ? mid - 2 : (r() < 0.5 ? x0 + 3 : x1 - 8);
    s += doorAt(ox, oy, dx, 5, 7.5);
    door = [dx, 5];
  }
  // Windows: evenly spaced slots per storey (at least one per ~10 units of frontage),
  // skipping any slot that would overlap the door, so every building keeps some.
  const nWin = sp.windows ?? 1;
  const litWindows = seedOf(seed, 7) % 10 < 6; // one glazing look per building, never mixed
  if (nWin && !sp.columns) {
    const rowsZ = sp.rows2 ? [3.5, H * 0.58 + 1] : [3.5];
    const winW = 3.6;
    for (const z of rowsZ) {
      const upper = z > 4;
      const count = Math.max(nWin + (sp.rows2 && upper ? 1 : 0), Math.floor(w / 10));
      for (let i = 0; i < count; i++) {
        const wx = x0 + (i + 0.5) * (w / count) - winW / 2;
        if (!upper && door && wx + winW > door[0] - 1.2 && wx < door[0] + door[1] + 1.2) continue;
        if (sp.slit) { s += `<rect x='${fmt(ox + wx + 1.2)}' y='${fmt(oy - z - 4.5 - (sp.tall ? 2 : 0))}' width='1.2' height='4.5' fill='#1e1e24'/>`; continue; }
        r(); // (formerly a per-window lit roll; kept so the rest of the sprite is unchanged)
        s += windowAt(ox, oy, wx, z, winW, sp.tall ? 5.5 : 3.6, litWindows, seed + i * 7 + z, glass);
        if (sp.bars) s += `<path d='M${fmt(ox + wx + 0.9)},${fmt(oy - z - 3.6)} v3.6 M${fmt(ox + wx + 2.7)},${fmt(oy - z - 3.6)} v3.6' stroke='${P.iron}' stroke-width='0.5'/>`;
      }
    }
  }
  if (sp.awning) {
    const ay = oy - 8.5;
    let st = '';
    for (let i = 0; i < 6; i++) {
      const ax = ox + x0 + 1 + i * ((w - 2) / 6);
      st += `<path d='M${fmt(ax)},${fmt(ay)} h${fmt((w - 2) / 6)} l1,3 h${fmt(-(w - 2) / 6)} z' fill='${i % 2 ? '#e8dcc0' : sp.awning}'/>`;
    }
    s += st;
  }
  if (sp.crates) {
    s += box(cam, x1 + 1, x1 + 5, -5, -1, 0, 3.5, '#8a6440') + box(cam, x1 + 1.5, x1 + 4.5, -4.5, -1.5, 3.5, 6, '#9a7048');
  }
  if (sp.herbs) {
    for (let i = 0; i < 3; i++) s += `<path d='M${fmt(ox + x0 + 4 + i * 2.2)},${fmt(oy - H + 1)} v2.6' stroke='#5e7d3c' stroke-width='1.1' stroke-linecap='round'/>`;
  }

  // roof
  const roofTop = H + R;
  if (roofKind === 'gx') s += gableX(cam, x0, x1, D, H, R, roof);
  else if (roofKind === 'gy') s += gableY(cam, x0, x1, D, H, R, roof, wallColor);
  else if (roofKind === 'hip') s += hip(cam, x0, x1, D, H, R, roof);
  else if (roofKind === 'dome') {
    s += box(cam, x0, x1, 0, D, H, H + 1.2, shade(wallColor, 0.95));
    const c = cam([mid, D / 2, H + 1.2]);
    const rad = Math.min(w, D) * 0.42;
    s += `<defs><radialGradient id='dm' cx='0.35' cy='0.3' r='0.8'><stop offset='0' stop-color='${shade(roof, 1.35)}'/><stop offset='1' stop-color='${shade(roof, 0.6)}'/></radialGradient></defs>` +
      `<path d='M${fmt(c[0] - rad)},${fmt(c[1])} A${fmt(rad)},${fmt(rad * 0.95)} 0 0 1 ${fmt(c[0] + rad)},${fmt(c[1])} Z' fill='url(#dm)'/>` +
      `<line x1='${fmt(c[0])}' y1='${fmt(c[1] - rad * 0.95)}' x2='${fmt(c[0])}' y2='${fmt(c[1] - rad * 0.95 - 3)}' stroke='${P.gold}' stroke-width='0.7'/>`;
  } else {
    // flat roof with parapet
    const top = theme === 'snow' ? P.snow : shade(wallColor, 0.9);
    s += box(cam, x0, x1, 0, D, H, H + 0.01, top, { topRows: 0 });
    s += box(cam, x0 - 0.5, x1 + 0.5, -0.5, 1.2, H, H + 2, wallColor);
    if (sp.crenel) {
      for (let x = x0; x < x1 - 1; x += 3.2) s += box(cam, x, x + 1.8, -0.5, 1.2, H + 2, H + 3.6, wallColor);
    }
  }

  // roof furniture
  if (sp.chimney && r() < sp.chimney && roofKind !== 'flat') {
    const cx = x1 - 6 - r() * 4, cy = D * 0.62;
    const zBase = H + R * 0.7;
    s += box(cam, cx, cx + 3, cy, cy + 3, zBase - 2, zBase + 5, P.stoneDark);
    const top = cam([cx + 1.5, cy + 1.5, zBase + 5]);
    s += smoke(top[0], top[1] - 1, !!sp.darkSmoke, r() * 2);
  }
  if (sp.stack) {
    const cx = x1 - 5;
    s += box(cam, cx, cx + 3.5, 4, 7.5, 0, H + 16, '#6a5a50');
    const top = cam([cx + 1.7, 5.7, H + 16]);
    s += smoke(top[0], top[1] - 1, true, 0.3);
  }
  if (sp.belfry) {
    const bx = x1 - 2;
    s += box(cam, bx, bx + 8, D - 9, D - 1, 0, H + 14, P.stonePale);
    s += `<rect x='${fmt(cam([bx + 2.5, D - 9, 0])[0])}' y='${fmt(cam([bx, D - 9, H + 11])[1])}' width='3' height='4' fill='#2a2620'/>`;
    s += pyramid(cam, bx, bx + 8, D - 9, D - 1, H + 14, 9, roof);
  }
  if (sp.clock) {
    const tx = mid - 4;
    s += box(cam, tx, tx + 8, D * 0.3, D * 0.3 + 8, H, roofTop + 7, shade(wallColor, 1.02));
    const c = cam([tx + 4, D * 0.3, roofTop + 3]);
    s += `<circle cx='${fmt(c[0])}' cy='${fmt(c[1])}' r='2.2' fill='#efe6cc' stroke='${P.timber}' stroke-width='0.4'/>` +
      `<line x1='${fmt(c[0])}' y1='${fmt(c[1])}' x2='${fmt(c[0])}' y2='${fmt(c[1] - 1.6)}' stroke='${P.timber}' stroke-width='0.4'/>`;
    s += pyramid(cam, tx, tx + 8, D * 0.3, D * 0.3 + 8, roofTop + 7, 7, roof);
  }
  if (sp.flag) {
    const f = cam([x0 + 3, 3, roofKind === 'flat' ? H + (sp.crenel ? 3.6 : 2) : roofTop - 2]);
    s += flag(f[0], f[1], sp.flag);
  }
  if (sp.banner) {
    s += `<rect x='${fmt(ox + mid - 2)}' y='${fmt(oy - H + 1)}' width='4' height='7' fill='${sp.banner}'/>` +
      `<path d='M${fmt(ox + mid - 2)},${fmt(oy - H + 8)} l2,-1.4 l2,1.4' fill='${sp.banner}'/>` +
      `<circle cx='${fmt(ox + mid)}' cy='${fmt(oy - H + 4)}' r='1' fill='${P.gold}'/>`;
  }
  if (sp.sign) s += hangingSign(ox, oy, x1 - 1, H * 0.62, sp.sign);
  if (sp.lantern) s += lantern(ox + x0 + 1.5, oy - 9, seed);
  if (sp.candle) s += lantern(ox + mid, oy - 3, seed);
  if (sp.gear) {
    const g = [ox + mid + 5, oy - H + 4];
    s += `<g><animateTransform attributeName='transform' type='rotate' values='0 ${fmt(g[0])} ${fmt(g[1])};360 ${fmt(g[0])} ${fmt(g[1])}' dur='9s' repeatCount='indefinite'/>` +
      `<circle cx='${fmt(g[0])}' cy='${fmt(g[1])}' r='2.2' fill='none' stroke='#b08a4a' stroke-width='1.2' stroke-dasharray='1 0.8'/></g>`;
  }
  return wrap(s);
};

const roundTower = (cam, ox, oy, sp, type, r, tint) => {
  const rad = sp.rad * SCALE, H = sp.h * SCALE, R = sp.r * SCALE;
  let wallColor = sp.wallColor || P.stone;
  if (tint.wall) wallColor = mixHex(wallColor, tint.wall, 0.5);
  let roof = desat(ROOF[type] || P.slate);
  if (tint.roofMix) roof = mixHex(roof, tint.roofMix[0], tint.roofMix[1]);
  const cx = -2, cy = rad;
  let s = castShadow(cam, cx - rad, cx + rad, rad * 2, H * 0.8);
  s += cylinder(cam, cx, cy, rad, 0, H, wallColor);
  // courses + windows on the visible front of the cylinder
  for (let z = 4; z < H; z += 3) {
    const a = cam([cx - rad, cy, z]), b = cam([cx + rad, cy, z]);
    s += `<path d='M${fmt(a[0])},${fmt(a[1] - rad * 0.55 * 0.0)} Q${fmt((a[0] + b[0]) / 2)},${fmt(a[1] + rad * 0.55)} ${fmt(b[0])},${fmt(b[1])}' stroke='${shade(wallColor, 0.7)}' stroke-width='0.35' fill='none' opacity='0.7'/>`;
  }
  const front = cam([cx, cy - rad, 0]);
  s += `<path d='M${fmt(front[0] - 2.5)},${fmt(oy - rad * 0.55 + rad * 0.55 - 0.2)} v-6 q2.5,-2.5 5,0 v6 z' fill='${P.door}'/>`;
  const glass = sp.glass || P.glass;
  for (let z = 12; z < H - 4; z += 9) {
    s += `<rect x='${fmt(front[0] - 1.2)}' y='${fmt(front[1] - z)}' width='2.4' height='4' rx='1.2' fill='${glass}'>${flicker(z * 31 + 7)}</rect>`;
  }
  s += cone(cam, cx, cy, rad + 2, H, R, roof);
  if (sp.sparkle) {
    const tip = cam([cx, cy, H + R]);
    s += `<circle cx='${fmt(tip[0])}' cy='${fmt(tip[1] - 2)}' r='1.3' fill='#d9c2ff'><animate attributeName='opacity' values='0.2;1;0.2' dur='2.6s' repeatCount='indefinite'/><animate attributeName='r' values='0.8;1.8;0.8' dur='2.6s' repeatCount='indefinite'/></circle>`;
  }
  if (sp.sails) {
    const hub = cam([cx, cy - rad - 1, H - 6]);
    let blades = '';
    for (let i = 0; i < 4; i++) {
      blades += `<g transform='rotate(${i * 90} ${fmt(hub[0])} ${fmt(hub[1])})'>` +
        `<line x1='${fmt(hub[0])}' y1='${fmt(hub[1])}' x2='${fmt(hub[0])}' y2='${fmt(hub[1] - 17)}' stroke='${P.woodDark}' stroke-width='0.9'/>` +
        `<rect x='${fmt(hub[0] + 0.4)}' y='${fmt(hub[1] - 16.5)}' width='3.6' height='12' fill='#e9e0c8' stroke='${P.woodDark}' stroke-width='0.35' opacity='0.92'/></g>`;
    }
    s += `<g><animateTransform attributeName='transform' type='rotate' values='0 ${fmt(hub[0])} ${fmt(hub[1])};360 ${fmt(hub[0])} ${fmt(hub[1])}' dur='14s' repeatCount='indefinite'/>${blades}</g>` +
      `<circle cx='${fmt(hub[0])}' cy='${fmt(hub[1])}' r='1.3' fill='${P.woodDark}'/>`;
  }
  return wrap(s);
};

// Square stone keep: battered plinth, corner turrets, a corbelled parapet with merlons,
// tiers of arrow slits, a lit upper hall window and a forebuilding guarding the door.
const keepTower = (cam, ox, oy, sp, r, tint, theme) => {
  let stone = mixHex(P.stone, '#8f877a', 0.5);
  if (tint.wall) stone = mixHex(stone, tint.wall, 0.5);
  const dark = shade(stone, 0.82);
  const top = theme === 'snow' ? P.snow : shade(stone, 0.7);
  let cap = desat(ROOF.keep);
  if (tint.roofMix) cap = mixHex(cap, tint.roofMix[0], tint.roofMix[1]);
  const x0 = -16, x1 = 12, D = 24, H = 40, B = 4, T = 6.5, TH = H + 6;
  const v = (x, y, z) => [x, y, z];
  const X = (x) => ox + x, Z = (z) => oy - z;
  let s = castShadow(cam, x0, x1, D, H + 6);

  // battered plinth (a frustum: wider at the ground)
  const b = 2.2;
  s += solid(cam, [
    { pts: [v(x0 - b, -b, 0), v(x1 + b, -b, 0), v(x1, 0, B), v(x0, 0, B)], color: dark },
    { pts: [v(x1 + b, -b, 0), v(x1 + b, D + b, 0), v(x1, D, B), v(x1, 0, B)], color: dark },
    { pts: [v(x0 - b, D + b, 0), v(x0 - b, -b, 0), v(x0, 0, B), v(x0, D, B)], color: dark },
  ], [(x0 + x1) / 2, D / 2, 0]);

  const crenels = (xa, xb, ya, yb, z, alongX) => {
    let c = '';
    if (alongX) for (let x = xa; x < xb - 0.8; x += 2.8) c += box(cam, x, Math.min(x + 1.6, xb), ya, yb, z, z + 1.8, stone);
    else for (let y = yb - 1.6; y > ya - 0.2; y -= 2.8) c += box(cam, xa, xb, Math.max(y, ya), y + 1.6, z, z + 1.8, stone);
    return c;
  };
  const turret = (tx, ty, h, capped) => {
    let t = box(cam, tx, tx + T, ty, ty + T, B, h, stone);
    t += box(cam, tx - 0.6, tx + T + 0.6, ty - 0.6, ty + T + 0.6, h, h + 1.6, shade(stone, 1.04));
    if (capped) {
      t += pyramid(cam, tx, tx + T, ty, ty + T, h + 1.6, 8, cap, 0.8);
    } else {
      t += box(cam, tx, tx + T, ty, ty + T, h + 1.6, h + 1.61, top);
      t += crenels(tx - 0.6, tx + T + 0.6, ty - 0.6, ty + 0.6, h + 1.6, true);
      t += crenels(tx + T - 0.6, tx + T + 0.6, ty - 0.6, ty + T + 0.6, h + 1.6, false);
    }
    return t;
  };

  // back turrets first (painter's order), then the tower body
  s += turret(x0 - 1, D - T + 1, TH + 4, true); // stair turret, taller and capped
  s += turret(x1 - T + 1, D - T + 1, TH, false);
  s += box(cam, x0, x1, 0, D, B, H, stone, { front: shade(stone, 1.02) });
  // stone courses on the front face
  for (let z = B + 2.6, row = 0; z < H - 2; z += 2.6, row++) {
    s += `<line x1='${fmt(X(x0))}' y1='${fmt(Z(z))}' x2='${fmt(X(x1))}' y2='${fmt(Z(z))}' stroke='${shade(stone, 0.7)}' stroke-width='0.3' opacity='0.7'/>`;
    for (let x = x0 + (row % 2 ? 1.5 : 3.5); x < x1; x += 4) s += `<line x1='${fmt(X(x))}' y1='${fmt(Z(z))}' x2='${fmt(X(x))}' y2='${fmt(Z(z + 2.6))}' stroke='${shade(stone, 0.7)}' stroke-width='0.25' opacity='0.5'/>`;
  }
  // courses on the east face
  for (let z = B + 2.6; z < H - 2; z += 2.6) {
    const a = cam(v(x1 + 0.01, 0, z)), c = cam(v(x1 + 0.01, D, z));
    s += `<line x1='${fmt(a[0])}' y1='${fmt(a[1])}' x2='${fmt(c[0])}' y2='${fmt(c[1])}' stroke='${shade(stone, 0.5)}' stroke-width='0.3' opacity='0.6'/>`;
  }
  // central pilaster buttress on the front and on the east face
  const mid = (x0 + x1) / 2;
  s += box(cam, mid - 1.4, mid + 1.4, -1, 0, B, H - 2, stone);
  s += box(cam, x1, x1 + 1, D / 2 - 1.4, D / 2 + 1.4, B, H - 2, stone);

  // openings: arched windows on every floor of both visible faces (lit at random),
  // arrow slits at ground level and on the turrets. `plane(u, z)` maps face coords.
  const front = (u, z) => cam(v(u, -0.02, z));
  const east = (u, z) => cam(v(x1 + 0.02, u, z));
  const arch = (plane, u, z, w, h, lit, seed) => {
    const a = plane(u, z), bb = plane(u + w, z), c = plane(u + w, z + h), d = plane(u, z + h);
    const k = plane(u + w / 2, z + h + w);
    const path = `M${fmt(a[0])},${fmt(a[1])} L${fmt(d[0])},${fmt(d[1])} Q${fmt(k[0])},${fmt(k[1])} ${fmt(c[0])},${fmt(c[1])} L${fmt(bb[0])},${fmt(bb[1])} Z`;
    const m0 = plane(u + w / 2, z), m1 = plane(u + w / 2, z + h + w / 2);
    const sill0 = plane(u - 0.5, z - 0.1), sill1 = plane(u + w + 0.5, z - 0.1);
    return `<path d='${path}' fill='${shade(stone, 0.62)}' transform='translate(-0.35,-0.35)'/>` +
      `<path d='${path}' fill='${lit ? P.glass : '#24242c'}'>${lit ? flicker(seed) : ''}</path>` +
      `<line x1='${fmt(m0[0])}' y1='${fmt(m0[1])}' x2='${fmt(m1[0])}' y2='${fmt(m1[1])}' stroke='${shade(stone, 0.55)}' stroke-width='0.35'/>` +
      `<line x1='${fmt(sill0[0])}' y1='${fmt(sill0[1])}' x2='${fmt(sill1[0])}' y2='${fmt(sill1[1])}' stroke='${shade(stone, 1.15)}' stroke-width='0.6'/>`;
  };
  const slitAt = (plane, u, z) => {
    const a = plane(u, z), bb = plane(u + 0.9, z), c = plane(u + 0.9, z + 3.6), d = plane(u, z + 3.6);
    const e = plane(u - 0.75, z + 2.2), f = plane(u + 1.65, z + 2.2);
    return `<polygon points='${ptsStr([a, bb, c, d])}' fill='#1b1b20'/>` +
      `<line x1='${fmt(e[0])}' y1='${fmt(e[1])}' x2='${fmt(f[0])}' y2='${fmt(f[1])}' stroke='#1b1b20' stroke-width='0.7'/>`;
  };
  // front face shows between the turrets, split by the central pilaster
  for (const u of [mid - 6.6, mid + 2.6]) s += slitAt(front, u + 0.9, B + 3);
  for (const [i, z] of [B + 10, B + 18, B + 26].entries()) {
    for (const [j, u] of [mid - 6.6, mid + 2.6].entries()) {
      s += arch(front, u, z, 2.6, i ? 3.4 : 2.8, r() < 0.6, (i * 7 + j) * 37 + 11);
    }
  }
  // the upper hall: a taller paired window either side of the pilaster
  for (const [j, u] of [mid - 6.8, mid + 2.4].entries()) s += arch(front, u, H - 9, 3.2, 4.4, true, 91 + j * 13);
  // east face: between the turrets, either side of its pilaster
  for (const [i, z] of [B + 10, B + 18, B + 26, H - 9].entries()) {
    for (const [j, u] of [6.2, D / 2 + 2.6].entries()) {
      s += i === 0 ? slitAt(east, u + 1, z) : arch(east, u, z, 2.4, 3.2, r() < 0.45, (i * 5 + j) * 53 + 3);
    }
  }

  // corbelled machicolation band + parapet with merlons
  s += box(cam, x0 - 0.8, x1 + 0.8, -0.8, D + 0.8, H - 1.5, H + 0.8, shade(stone, 1.05));
  for (let x = x0; x < x1; x += 2.2) s += `<rect x='${fmt(X(x))}' y='${fmt(Z(H - 1.5))}' width='1' height='1.3' fill='${shade(stone, 0.55)}'/>`;
  s += box(cam, x0 - 0.8, x1 + 0.8, -0.8, D + 0.8, H + 0.8, H + 0.81, top);
  s += box(cam, x0 - 0.8, x1 + 0.8, D - 0.6, D + 0.8, H + 0.8, H + 2.6, stone);
  s += crenels(x0 - 0.8, x1 + 0.8, D - 0.6, D + 0.8, H + 2.6, true);
  s += box(cam, x0 - 0.8, x0 + 0.6, -0.8, D + 0.8, H + 0.8, H + 2.6, stone);
  s += crenels(x0 - 0.8, x0 + 0.6, -0.8, D + 0.8, H + 2.6, false);
  s += box(cam, x0 - 0.8, x1 + 0.8, -0.8, 0.6, H + 0.8, H + 2.6, stone);
  s += box(cam, x1 - 0.6, x1 + 0.8, -0.8, D + 0.8, H + 0.8, H + 2.6, stone);
  s += crenels(x0 - 0.8, x1 + 0.8, -0.8, 0.6, H + 2.6, true);
  s += crenels(x1 - 0.6, x1 + 0.8, -0.8, D + 0.8, H + 2.6, false);

  // front turrets over the body
  s += turret(x0 - 1, -1, TH, false);
  s += turret(x1 - T + 1, -1, TH, false);
  const tFront = (u, z) => cam(v(u, -1.02, z));
  for (const tx of [x0 - 1, x1 - T + 1]) {
    for (const z of [B + 10, B + 18, B + 26, H - 9]) s += slitAt(tFront, tx + T / 2 - 0.45, z); // level with the window rows
  }
  const tEast = (u, z) => cam(v(x1 + 1.02, u, z));
  for (const z of [B + 10, B + 18, B + 26, H - 9]) s += slitAt(tEast, -1 + T / 2 - 0.45, z);

  // forebuilding guarding the door, with its own crenellated top
  const fx0 = x0 + 1.5, fx1 = x0 + 12, fy0 = -8;
  s += box(cam, fx0, fx1, fy0, -1, 0, 15, stone, { front: shade(stone, 1.02) });
  s += box(cam, fx0, fx1, fy0, -1, 15, 15.01, top);
  s += crenels(fx0, fx1, fy0, fy0 + 1.2, 15, true);
  s += crenels(fx1 - 1.2, fx1, fy0, -1, 15, false);
  const fd = cam(v((fx0 + fx1) / 2 - 2.5, fy0, 0));
  s += `<path d='M${fmt(fd[0])},${fmt(fd[1])} v-6 q2.5,-3 5,0 v6 z' fill='${P.door}' stroke='${shade(stone, 0.55)}' stroke-width='0.6'/>`;
  const fs = cam(v((fx0 + fx1) / 2, fy0, 10));
  s += `<rect x='${fmt(fs[0] - 0.45)}' y='${fmt(fs[1] - 3)}' width='0.9' height='3' fill='#1b1b20'/>`;

  // banner on the stair turret
  const fl = cam(v(x0 - 1 + T / 2, D - T / 2 + 1, TH + 4 + 1.6 + 8));
  s += flag(fl[0], fl[1] + 0.5, sp.flag);
  return wrap(s);
};

const marketStall = (cam, ox, oy, r) => {
  const colors = ['#9a3f34', '#3f6f63', '#b07a3a', '#4f5f92'];
  const c1 = pick(r, colors);
  let s = '';
  const x0 = -15, x1 = 11, D = 16;
  s += castShadow(cam, x0, x1, D, 8);
  // counter + goods
  s += box(cam, x0 + 1, x1 - 1, 1, 6, 0, 4.5, P.wood);
  const goods = ['#c84a3a', '#d9a640', '#7aa04a', '#e3d6b0', '#8a5aa0'];
  for (let i = 0; i < 6; i++) {
    const g = cam([x0 + 3 + i * 3.7, 3.5, 4.5]);
    s += `<ellipse cx='${fmt(g[0])}' cy='${fmt(g[1] - 0.8)}' rx='1.5' ry='1.1' fill='${pick(r, goods)}'/>`;
  }
  // posts
  for (const [px, py] of [[x0, 0], [x1, 0], [x1, D], [x0, D]]) {
    const a = cam([px, py, 0]), b = cam([px, py, 13]);
    s += `<line x1='${fmt(a[0])}' y1='${fmt(a[1])}' x2='${fmt(b[0])}' y2='${fmt(b[1])}' stroke='${P.woodDark}' stroke-width='0.9'/>`;
  }
  // striped canopy (two-colour gable)
  const v = (x, y, z) => [x, y, z];
  const canopy = (xa, xb, col) => solid(cam, [
    { pts: [v(xa, -2, 12), v(xb, -2, 12), v(xb, D / 2, 16), v(xa, D / 2, 16)], color: col },
    { pts: [v(xa, D / 2, 16), v(xb, D / 2, 16), v(xb, D + 2, 12), v(xa, D + 2, 12)], color: col },
    { pts: [v(xb, -2, 12), v(xb, D + 2, 12), v(xb, D / 2, 16)], color: col },
    { pts: [v(xa, D + 2, 12), v(xa, -2, 12), v(xa, D / 2, 16)], color: col },
  ], [(xa + xb) / 2, D / 2, 13]);
  const n = 6, step = (x1 - x0 + 2) / n;
  for (let i = 0; i < n; i++) s += canopy(x0 - 1 + i * step, x0 - 1 + (i + 1) * step, i % 2 ? '#e9dfc6' : c1);
  // scalloped valance
  let val = '';
  for (let i = 0; i < n; i++) {
    const a = cam([x0 - 1 + i * step, -2, 12]);
    val += `<path d='M${fmt(a[0])},${fmt(a[1])} q${fmt(step / 2)},2.2 ${fmt(step)},0 z' fill='${i % 2 ? '#e9dfc6' : c1}'/>`;
  }
  s += val;
  s += box(cam, x1 + 1, x1 + 5, -4, 0, 0, 3.6, '#8a6440');
  return wrap(s);
};

// --- trees / props -------------------------------------------------------------------
const tree = (seed, kind) => {
  const r = rng(seed);
  const ox = 30, oy = 92;
  r(); r(); // (formerly the SMIL sway timing; kept so tree shapes stay the same per seed)
  const sway = (inner) => inner;
  let s = `<ellipse cx='${ox + 6}' cy='${oy - 2}' rx='12' ry='4.5' fill='#0d0f14' opacity='0.24' filter='url(#soft)'/>`;
  if (kind === 'pine') {
    let p = `<rect x='${ox - 1.2}' y='${oy - 8}' width='2.4' height='8' fill='${P.woodDark}'/>`;
    const base = r() < 0.5 ? '#2f5640' : '#365e44';
    for (let i = 0; i < 4; i++) {
      const y = oy - 6 - i * 7, w = 11 - i * 2.3;
      p += `<polygon points='${ox - w},${y} ${ox + w},${y} ${ox},${y - 11}' fill='${shade(base, 0.85 + i * 0.07)}'/>` +
        `<polygon points='${ox},${y} ${ox + w},${y} ${ox},${y - 11}' fill='${shade(base, 0.65)}' opacity='0.7'/>`;
    }
    s += sway(p);
    return wrap(s);
  }
  if (kind === 'bush') {
    const g = r() < 0.5 ? '#4f7340' : '#5a7a44';
    s = `<ellipse cx='${ox + 3}' cy='${oy - 2}' rx='8' ry='3' fill='#0d0f14' opacity='0.22' filter='url(#soft)'/>`;
    s += `<circle cx='${ox - 3}' cy='${oy - 5}' r='4.5' fill='${shade(g, 0.8)}'/><circle cx='${ox + 3}' cy='${oy - 5}' r='4.5' fill='${shade(g, 0.7)}'/><circle cx='${ox}' cy='${oy - 8}' r='4.6' fill='${shade(g, 1.05)}'/>`;
    if (r() < 0.5) s += `<circle cx='${ox - 2}' cy='${oy - 9}' r='0.8' fill='#c94a5a'/><circle cx='${ox + 2}' cy='${oy - 6}' r='0.8' fill='#c94a5a'/>`;
    return wrap(s);
  }
  if (kind === 'flowers') {
    s = '';
    const cols = ['#e8c95a', '#d96a7a', '#f2efe6', '#9a7ad0'];
    for (let i = 0; i < 9; i++) {
      const x = ox - 10 + r() * 20, y = oy - 4 - r() * 12;
      s += `<line x1='${fmt(x)}' y1='${fmt(y)}' x2='${fmt(x)}' y2='${fmt(y + 2.5)}' stroke='#4f7340' stroke-width='0.5'/><circle cx='${fmt(x)}' cy='${fmt(y)}' r='1' fill='${pick(r, cols)}'/>`;
    }
    return wrap(s);
  }
  // broadleaf
  const g = pick(r, ['#47703e', '#4f7a42', '#56763c', '#3f6a40']);
  let t = `<path d='M${ox - 1.6},${oy} L${ox - 1},${oy - 14} L${ox + 1},${oy - 14} L${ox + 1.8},${oy} Z' fill='${P.woodDark}'/>`;
  const blobs = [[-6, -18, 7], [6, -18, 7], [0, -25, 8], [-3, -13, 6], [4, -13, 6]];
  for (const [dx, dy, rr] of blobs) t += `<circle cx='${ox + dx}' cy='${oy + dy}' r='${rr}' fill='${shade(g, 0.72)}'/>`;
  for (const [dx, dy, rr] of blobs) t += `<circle cx='${ox + dx - 1.2}' cy='${oy + dy - 1.4}' r='${rr * 0.78}' fill='${g}'/>`;
  t += `<circle cx='${ox - 3}' cy='${oy - 27}' r='3.6' fill='${shade(g, 1.25)}' opacity='0.8'/><circle cx='${ox - 7.5}' cy='${oy - 20}' r='2.6' fill='${shade(g, 1.2)}' opacity='0.7'/>`;
  s += sway(t);
  return wrap(s);
};

const fountain = () => {
  const ox = 30, oy = 90;
  const cam = makeCam(ox, oy);
  let s = `<ellipse cx='${ox + 3}' cy='${oy - 4}' rx='15' ry='6' fill='#0d0f14' opacity='0.2' filter='url(#soft)'/>`;
  s += cylinder(cam, -2, 9, 12, 0, 3, P.stonePale, 16);
  const c = cam([-2, 9, 3]);
  s += `<ellipse cx='${fmt(c[0])}' cy='${fmt(c[1])}' rx='10.5' ry='5.6' fill='#4a7fa8'/>` +
    `<ellipse cx='${fmt(c[0])}' cy='${fmt(c[1])}' rx='7' ry='3.4' fill='none' stroke='#cfe6f5' stroke-width='0.5' opacity='0.6'><animate attributeName='rx' values='3;10' dur='2.4s' repeatCount='indefinite'/><animate attributeName='ry' values='1.5;5.4' dur='2.4s' repeatCount='indefinite'/><animate attributeName='opacity' values='0.8;0' dur='2.4s' repeatCount='indefinite'/></ellipse>`;
  s += cylinder(cam, -2, 9, 2, 3, 11, P.stonePale, 10);
  const top = cam([-2, 9, 11]);
  s += `<path d='M${fmt(top[0])},${fmt(top[1])} q-5,-6 -8,4 M${fmt(top[0])},${fmt(top[1])} q5,-6 8,4' stroke='#d8eefa' stroke-width='0.9' fill='none' opacity='0.85'><animate attributeName='opacity' values='0.5;0.95;0.5' dur='1.2s' repeatCount='indefinite'/></path>`;
  return wrap(s);
};

// --- town walls with height ------------------------------------------------------------
// mask: N=1 E=2 S=4 W=8 (same as townTileArt's autotiler). Straight runs are a single
// curtain wall; corners, junctions and ends get a square tower. Each wall has a paved
// wall-walk between two crenellated parapets, coursed masonry with a darker plinth,
// arrow slits and weathering on the faces the camera sees. `outward` says whether the
// south faces we see look out of the enclosure; slits are only cut in outward faces.
const wallSprite = (mask, keep, variant = 0, gate = null, flank = false, outward = true) => {
  const ox = 30, oy = 100; // tile spans world x -20..20, y 0..40 (front edge at the tile bottom)
  const cam = makeCam(ox, oy, 0, 1);
  const H = keep ? 20 : 15, t = keep ? 5 : 4;
  const col = keep ? '#8f877a' : P.stone;
  const r = rng(mask * 7919 + variant * 104729 + (keep ? 3 : 1));
  const v = (x, y, z) => [x, y, z];
  const cx = 0, cy = 20;
  const straight = (mask === 5 || mask === 10) && !flank;
  const tw = t + 2.2, TH = H + 6;
  const line = (p, q, c, w, o = 1) => `<line x1='${fmt(p[0])}' y1='${fmt(p[1])}' x2='${fmt(q[0])}' y2='${fmt(q[1])}' stroke='${c}' stroke-width='${w}' opacity='${o}'/>`;

  // the south-facing face of a block (y = y0 plane): masonry, plinth, weathering, slits
  const face = (x0, x1, y0, h, slits) => {
    const P2 = (x, z) => cam(v(x, y0 - 0.02, z));
    let f = `<polygon points='${ptsStr([P2(x0, 0), P2(x1, 0), P2(x1, 2), P2(x0, 2)])}' fill='${shade(col, 0.66)}'/>`;
    for (let z = 2, row = 0; z < h - 0.5; z += 1.9, row++) {
      f += line(P2(x0, z), P2(x1, z), shade(col, 0.6), 0.3, 0.75);
      for (let x = x0 + (row % 2 ? 1.2 : 2.6); x < x1 - 0.4; x += 2.8) f += line(P2(x, z), P2(x, Math.min(h, z + 1.9)), shade(col, 0.62), 0.25, 0.55);
    }
    // a few lighter / darker stones
    for (let i = 0; i < (x1 - x0) / 5; i++) {
      const x = x0 + 0.6 + r() * (x1 - x0 - 3), z = 2 + Math.floor(r() * ((h - 3) / 1.9)) * 1.9;
      f += `<polygon points='${ptsStr([P2(x, z), P2(x + 2.4, z), P2(x + 2.4, z + 1.9), P2(x, z + 1.9)])}' fill='${shade(col, r() < 0.5 ? 1.06 : 0.88)}' opacity='0.6'/>`;
    }
    // damp streaks and moss at the foot
    for (let i = 0; i < (x1 - x0) / 7; i++) {
      const x = x0 + 1 + r() * (x1 - x0 - 2), len = 3 + r() * (h * 0.4);
      f += line(P2(x, h - 1), P2(x, h - 1 - len), '#3f3a32', 0.7, 0.18);
      f += `<ellipse cx='${fmt(P2(x, 1)[0])}' cy='${fmt(P2(x, 1)[1])}' rx='${fmt(1 + r() * 1.6)}' ry='0.8' fill='#56693e' opacity='0.55'/>`;
    }
    for (const sx of outward ? slits : []) {
      f += `<polygon points='${ptsStr([P2(sx - 0.45, h * 0.42), P2(sx + 0.45, h * 0.42), P2(sx + 0.45, h * 0.42 + 3.6), P2(sx - 0.45, h * 0.42 + 3.6)])}' fill='#1b1b20'/>`;
      f += line(P2(sx - 1.2, h * 0.42 + 2.2), P2(sx + 1.2, h * 0.42 + 2.2), '#1b1b20', 0.7);
    }
    return f;
  };
  // wall-walk: flagstones between an inner and an outer parapet, each with merlons
  const walkX = (x0, x1, y0, y1, h) => { // runs east-west
    let w = '';
    for (let x = x0 + 1.5; x < x1; x += 2.6) w += line(cam(v(x, y0 + 1, h)), cam(v(x, y1 - 1, h)), shade(col, 0.7), 0.3, 0.7);
    w += box(cam, x0, x1, y1 - 1, y1, h, h + 1.3, col);
    for (let x = x0 + 0.4; x < x1 - 0.8; x += 2.8) w += box(cam, x, Math.min(x + 1.5, x1), y1 - 1, y1, h + 1.3, h + 2.8, col);
    w += box(cam, x0, x1, y0, y0 + 1, h, h + 1.3, col, { front: shade(col, 0.9) });
    for (let x = x0 + 0.4; x < x1 - 0.8; x += 2.8) w += box(cam, x, Math.min(x + 1.5, x1), y0, y0 + 1, h + 1.3, h + 2.8, col, { front: shade(col, 0.95) });
    return w;
  };
  const walkY = (x0, x1, y0, y1, h) => { // runs north-south: only tops show, so merlon fronts carry it
    let w = '';
    for (let y = y1 - 1.5; y > y0; y -= 2.6) w += line(cam(v(x0 + 1, y, h)), cam(v(x1 - 1, y, h)), shade(col, 0.7), 0.3, 0.7);
    for (const [a, b] of [[x0, x0 + 1], [x1 - 1, x1]]) {
      w += box(cam, a, b, y0, y1, h, h + 1.3, col);
      for (let y = y1 - 1.9; y > y0 - 0.2; y -= 2.8) w += box(cam, a, b, Math.max(y, y0), y + 1.5, h + 1.3, h + 2.8, col, { front: shade(col, 0.88) });
    }
    return w;
  };
  // Gatehouse over a gap in the wall. 'x': the wall runs east-west and the road passes
  // through towards the camera, so the arch, its voussoirs and the portcullis face us.
  // 'y': the wall runs north-south and the road crosses beneath, seen end-on, so the
  // gatehouse shows as a raised, crenellated span. Town gates have the portcullis
  // raised; the keep's gate has it half lowered.
  const gateHouse = (dir) => {
    const GH = keep ? H + 2 : H + 6, d = keep ? t + 1 : t + 2.5;
    let g = '';
    if (dir === 'y') {
      // wall arms run in from both tile edges to a square gatehouse straddling the road;
      // the arch mouths face east/west (edge-on here), so dark tunnel shadows on the road
      // either side show where the passage runs
      const hx = t + 5, hy = 11, gx0 = cx - hx, gx1 = cx + hx, gy0 = cy - hy, gy1 = cy + hy;
      g += shadow(gx0, gx1, gy0, gy1, GH);
      g += shadow(cx - t, cx + t, gy1, 40, H) + shadow(cx - t, cx + t, 0, gy0, H);
      for (const side of [-1, 1]) {
        const ex = side < 0 ? gx0 : gx1, ow2 = 6.5;
        const pts = [cam(v(ex, cy - ow2, 0)), cam(v(ex + side * 4, cy - ow2 + 1.5, 0)), cam(v(ex + side * 4, cy + ow2 - 1.5, 0)), cam(v(ex, cy + ow2, 0))];
        g += `<polygon points='${ptsStr(pts)}' fill='#0d0f14' opacity='0.45' filter='url(#soft)'/>`;
      }
      g += drawArmY(cx - t, cx + t, gy1, 40.01);
      g += box(cam, gx0, gx1, gy0, gy1, 0, GH, col, { front: shade(col, 0.84), top: shade(col, 0.82) });
      g += face(gx0, gx1, gy0, GH - 1.5, [cx]);
      // bevels down both edge-on sides, with the passage mouth suggested in each
      const e0 = cam(v(gx1, gy0, GH)), e1 = cam(v(gx1, gy1, GH));
      g += `<polygon points='${ptsStr([e0, e1, [e1[0] + 2.4, e1[1] + 1.6], [e0[0] + 2.4, e0[1] + 1.6]])}' fill='${shade(col, 0.6)}'/>`;
      g += box(cam, gx0 - 0.7, gx1 + 0.7, gy0 - 0.7, gy1 + 0.7, GH - 1.5, GH, shade(col, 1.06), { front: shade(col, 0.98) });
      for (let x = gx0; x < gx1; x += 2.1) {
        const q = cam(v(x, gy0 - 0.72, GH - 1.5));
        g += `<rect x='${fmt(q[0])}' y='${fmt(q[1])}' width='0.9' height='1.2' fill='${shade(col, 0.5)}'/>`;
      }
      for (const bx of [gx0 + 1.2, gx1 - 3.6]) {
        const p = cam(v(bx, gy0 - 0.75, GH - 2.2));
        g += `<path d='M${fmt(p[0])},${fmt(p[1])} h2.4 v5.4 l-1.2,-1 l-1.2,1 z' fill='#8a2f2a'/>` +
          `<circle cx='${fmt(p[0] + 1.2)}' cy='${fmt(p[1] + 2.2)}' r='0.6' fill='${P.gold}'/>`;
      }
      g += walkY(gx0 - 0.7, gx1 + 0.7, gy0 - 0.7, gy1 + 0.7, GH);
      g += walkX(gx0 + 0.3, gx1 - 0.3, gy0 - 0.7, gy1 + 0.7, GH);
      g += drawArmY(cx - t, cx + t, 0, gy0);
      return g;
    }
    const x0 = -20, x1 = 20, y0 = cy - d, y1 = cy + d;
    const ow = keep ? 6 : 7.5, spring = keep ? 6 : 8, top = spring + ow; // opening half-width, arch spring, crown
    g += shadow(x0, x1, y0, y1, GH);
    g += box(cam, x0, x1, y0, y1, 0, GH, col, { front: shade(col, 0.84), top: shade(col, 1.04) });
    g += face(x0, x1, y0, GH - 1.5, [x0 + 5, x1 - 5]);
    const F = (x, z) => cam(v(x, y0 - 0.03, z));
    const archPath = (hw, zs) => {
      const a = F(-hw, 0), b = F(-hw, zs), c = F(hw, zs), e = F(hw, 0);
      return `M${fmt(a[0])},${fmt(a[1])} L${fmt(b[0])},${fmt(b[1])} A${fmt(hw)},${fmt(hw)} 0 0 1 ${fmt(c[0])},${fmt(c[1])} L${fmt(e[0])},${fmt(e[1])} Z`;
    };
    // voussoir ring, then the dark passage with daylight showing at the far end
    g += `<path d='${archPath(ow + 1.4, spring)}' fill='${shade(col, 1.12)}'/>`;
    for (let i = 0; i <= 8; i++) {
      const ang = Math.PI - (i / 8) * Math.PI;
      const p0 = F(Math.cos(ang) * ow, spring + Math.sin(ang) * ow), p1 = F(Math.cos(ang) * (ow + 1.4), spring + Math.sin(ang) * (ow + 1.4));
      g += line(p0, p1, shade(col, 0.6), 0.3, 0.8);
    }
    const gid = `pg${keep ? 'k' : 't'}`;
    g += `<defs><linearGradient id='${gid}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#120f0c'/><stop offset='0.7' stop-color='#2a241d'/><stop offset='1' stop-color='#6b5a44'/></linearGradient>` +
      `<clipPath id='${gid}c'><path d='${archPath(ow, spring)}'/></clipPath></defs>`;
    g += `<path d='${archPath(ow, spring)}' fill='url(#${gid})'/>`;
    // portcullis: oak-and-iron grid with spiked feet, clipped to the arch
    const low = keep ? spring * 0.45 : spring + ow * 0.2; // bottom edge height
    let grid = '';
    for (let x = -ow + 0.9; x < ow; x += 1.7) grid += line(F(x, low), F(x, top + 1), '#2b2b30', 0.55);
    for (let z = low + 0.8; z < top; z += 1.8) grid += line(F(-ow, z), F(ow, z), '#2b2b30', 0.45);
    for (let x = -ow + 0.9; x < ow; x += 1.7) {
      const p = F(x, low);
      grid += `<path d='M${fmt(p[0] - 0.4)},${fmt(p[1])} l0.4,1.1 l0.4,-1.1 z' fill='#2b2b30'/>`;
    }
    g += `<g clip-path='url(#${gid}c)'>${grid}</g>`;
    // keystone and the machicolation band above the arch
    const k0 = F(-0.9, top + 0.1);
    g += `<rect x='${fmt(k0[0])}' y='${fmt(k0[1] - 1.8)}' width='1.8' height='2' fill='${shade(col, 1.15)}'/>`;
    g += box(cam, x0, x1, y0 - 0.7, y1 + 0.7, GH - 1.5, GH, shade(col, 1.06), { front: shade(col, 0.98) });
    for (let x = x0 + 0.5; x < x1; x += 2.1) {
      const q = cam(v(x, y0 - 0.72, GH - 1.5));
      g += `<rect x='${fmt(q[0])}' y='${fmt(q[1])}' width='0.9' height='1.2' fill='${shade(col, 0.5)}'/>`;
    }
    // banners either side of the arch (town gates)
    if (!keep) {
      for (const bx of [-ow - 4.2, ow + 1.8]) {
        const p = F(bx, GH - 2.2);
        g += `<path d='M${fmt(p[0])},${fmt(p[1])} h2.4 v5.4 l-1.2,-1 l-1.2,1 z' fill='#8a2f2a'/>` +
          `<circle cx='${fmt(p[0] + 1.2)}' cy='${fmt(p[1] + 2.2)}' r='0.6' fill='${P.gold}'/>`;
      }
    }
    g += walkX(x0, x1, y0 - 0.7, y1 + 0.7, GH);
    return g;
  };
  // a north-south wall segment (used by the side gatehouse)
  const drawArmY = (x0, x1, y0, y1) => {
    let a = box(cam, x0, x1, y0, y1, 0, H, col, { front: shade(col, 0.84), top: shade(col, 1.04) });
    const e0 = cam(v(x1, y0, H)), e1 = cam(v(x1, y1, H));
    a += `<polygon points='${ptsStr([e0, e1, [e1[0] + 2.4, e1[1] + 1.6], [e0[0] + 2.4, e0[1] + 1.6]])}' fill='${shade(col, 0.6)}'/>`;
    a += walkY(x0, x1, y0, y1, H);
    if (y0 < 0.5) a += face(x0, x1, y0, H, []);
    return a;
  };
  const shadow = (x0, x1, y0, y1, h) => {
    const g = (x, y) => cam([x, y, 0]);
    return `<polygon points='${ptsStr([g(x0, y0), g(x1, y0), g(x1 + h * 0.55, y0 + h * 0.45), g(x1 + h * 0.55, y1 + h * 0.45), g(x0 + h * 0.55, y1 + h * 0.45), g(x0, y1)])}' fill='#0d0f14' opacity='0.24'/>`;
  };

  if (gate) return wrap(gateHouse(gate));

  const arms = [];
  if (mask & 1) arms.push(['y', cx - t, cx + t, cy, 40.01]);
  if (mask & 8) arms.push(['x', -20, cx, cy - t, cy + t]);
  if (mask & 2) arms.push(['x', cx, 20, cy - t, cy + t]);
  const south = mask & 4 ? ['y', cx - t, cx + t, 0, cy] : null;
  let s = '';
  for (const [, x0, x1, y0, y1] of [...arms, ...(south ? [south] : [])]) s += shadow(x0, x1, y0, y1, H);
  if (!straight) s += shadow(cx - tw, cx + tw, cy - tw, cy + tw, TH);
  else if (mask === 5) arms.push(['y', cx - t, cx + t, cy - t, cy + t]);
  else arms.push(['x', cx - t, cx + t, cy - t, cy + t]);

  const drawArm = ([dir, x0, x1, y0, y1]) => {
    let a = box(cam, x0, x1, y0, y1, 0, H, col, { front: shade(col, 0.84), top: shade(col, 1.04) });
    if (dir === 'x') {
      // one slit per arm at most, so the face doesn't read as a repeating pattern
      a += face(x0, x1, y0, H, x1 - x0 > 12 && r() < 0.7 ? [(x0 + x1) / 2 + (r() - 0.5) * 6] : []);
      a += walkX(x0, x1, y0, y1, H);
      // buttresses where the run meets the tile centre and the tile edge
      for (const bx of [x0, x1]) {
        if (Math.abs(bx) > 19.5 || (straight && bx === 0)) {
          const b0 = Math.max(-20, bx - 0.9), b1 = Math.min(20, bx + 0.9);
          a += box(cam, b0, b1, y0 - 1.4, y0, 0, H - 3, col, { front: shade(col, 0.92), top: shade(col, 1.08) });
        }
      }
    } else {
      // bevel down the east side: a run seen end-on has no visible face, so suggest one
      const e0 = cam(v(x1, y0, H)), e1 = cam(v(x1, y1, H));
      a += `<polygon points='${ptsStr([e0, e1, [e1[0] + 2.4, e1[1] + 1.6], [e0[0] + 2.4, e0[1] + 1.6]])}' fill='${shade(col, 0.6)}'/>`;
      for (let y = y1 - 2.2; y > y0; y -= 1.9) {
        const q = cam(v(x1, y, H));
        a += line(q, [q[0] + 2.4, q[1] + 1.6], shade(col, 0.45), 0.25, 0.6);
      }
      a += walkY(x0, x1, y0, y1, H);
      if (y0 < 0.5) a += face(x0, x1, y0, H, []);
    }
    return a;
  };
  for (const arm of arms) s += drawArm(arm);

  if (!straight) {
    // corner / junction tower: taller, with a corbelled parapet and slits
    const x0 = cx - tw, x1 = cx + tw, y0 = cy - tw, y1 = cy + tw;
    s += box(cam, x0, x1, y0, y1, 0, TH, col, { front: shade(col, 0.86), top: shade(col, 0.8) });
    s += face(x0, x1, y0, TH - 1.5, [cx]);
    s += box(cam, x0 - 0.7, x1 + 0.7, y0 - 0.7, y1 + 0.7, TH - 1.5, TH, shade(col, 1.06), { front: shade(col, 0.98) });
    for (let x = x0; x < x1; x += 2.1) {
      const q = cam(v(x, y0 - 0.72, TH - 1.5));
      s += `<rect x='${fmt(q[0])}' y='${fmt(q[1])}' width='0.9' height='1.2' fill='${shade(col, 0.5)}'/>`;
    }
    s += walkY(x0 - 0.7, x1 + 0.7, y0 - 0.7, y1 + 0.7, TH);
    s += walkX(x0 - 0.7 + 1, x1 + 0.7 - 1, y0 - 0.7, y1 + 0.7, TH);
  }
  if (south) s += drawArm(south);
  return wrap(s);
};

// --- fields (ground layer) ------------------------------------------------------------
// A field tile in a 40 x 40 viewBox, drawn as ridge-and-furrow strips lit from the
// front-left. `mask` (N=1 E=2 S=4 W=8) marks neighbouring field tiles, so a hedge or a
// wattle fence runs only along the patch's outer edge. `crop` is chosen per patch by the
// caller so a whole field shares one crop.
export const FIELD_CROPS = ['wheat', 'barley', 'cabbage', 'beans', 'fallow', 'flax'];
const CROP_STYLE = {
  wheat: { soil: '#7a5a3a', plant: '#c9a84e', tip: '#e2c56c', dark: '#9a7c34', tall: true },
  barley: { soil: '#7a5a3a', plant: '#b9b06a', tip: '#d6cc86', dark: '#8a8448', tall: true },
  cabbage: { soil: '#6a4a30', plant: '#6f8f4c', tip: '#9ab86c', dark: '#4a6634', round: true },
  beans: { soil: '#6a4a30', plant: '#5a7a3c', tip: '#7c9c52', dark: '#3e5a2a', round: true, stakes: true },
  flax: { soil: '#735236', plant: '#6f8a54', tip: '#8fa8d8', dark: '#4e6a3c', tall: true },
  fallow: { soil: '#7a5838', plant: null },
};
const fieldTile = (crop, mask, variant, theme, edge) => {
  const st = CROP_STYLE[crop] || CROP_STYLE.fallow;
  const r = rng(variant * 7919 + crop.length * 131);
  const snow = theme === 'snow', dry = theme === 'desert';
  const soil = snow ? '#8a7f78' : dry ? mixHex(st.soil, '#b08a5a', 0.4) : st.soil;
  let s = `<rect width='40' height='40' fill='${soil}'/>`;
  // ridges: lit top edge, shadowed furrow below
  for (let y = 1; y < 40; y += 5) {
    s += `<rect x='0' y='${y}' width='40' height='3.2' fill='${shade(soil, 1.12)}'/>` +
      `<rect x='0' y='${y}' width='40' height='0.8' fill='${shade(soil, 1.3)}' opacity='0.7'/>` +
      `<rect x='0' y='${y + 3.2}' width='40' height='1.8' fill='${shade(soil, 0.72)}'/>`;
  }
  if (snow) {
    for (let y = 1; y < 40; y += 5) s += `<rect x='0' y='${y}' width='40' height='1.8' fill='#eef2f6' opacity='0.85'/>`;
  } else if (st.plant) {
    for (let y = 2.4; y < 40; y += 5) {
      for (let x = 1.5 + (r() * 1.5); x < 39; x += st.round ? 4.2 : 2.2) {
        const jx = x + (r() - 0.5) * 0.6;
        if (st.round) {
          s += `<ellipse cx='${fmt(jx + 0.4)}' cy='${fmt(y + 1.6)}' rx='1.7' ry='0.8' fill='#000' opacity='0.18'/>` +
            `<circle cx='${fmt(jx)}' cy='${fmt(y + 0.6)}' r='1.6' fill='${st.dark}'/>` +
            `<circle cx='${fmt(jx - 0.3)}' cy='${fmt(y + 0.2)}' r='1.05' fill='${st.plant}'/>` +
            `<circle cx='${fmt(jx - 0.6)}' cy='${fmt(y - 0.2)}' r='0.45' fill='${st.tip}'/>`;
          if (st.stakes && r() < 0.35) s += `<line x1='${fmt(jx)}' y1='${fmt(y + 0.8)}' x2='${fmt(jx)}' y2='${fmt(y - 2.6)}' stroke='#5a4630' stroke-width='0.35'/>`;
        } else {
          const h = 2.6 + r() * 0.8;
          s += `<path d='M${fmt(jx)},${fmt(y + 1.4)} l-0.5,-${fmt(h)} M${fmt(jx)},${fmt(y + 1.4)} l0.5,-${fmt(h * 0.9)} M${fmt(jx)},${fmt(y + 1.4)} v-${fmt(h * 1.05)}' stroke='${st.plant}' stroke-width='0.45' stroke-linecap='round'/>` +
            `<circle cx='${fmt(jx)}' cy='${fmt(y + 1.4 - h * 1.05)}' r='0.45' fill='${st.tip}'/>`;
        }
      }
    }
  }
  // patch edge: hedge (green) or wattle fence (woven hazel) on sides facing non-field
  const hedge = edge === 'hedge';
  const side = (x, y, w, h, horiz) => {
    if (hedge) {
      let e = `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${snow ? '#5f6e5a' : '#3f5a30'}'/>`;
      const n = Math.round((horiz ? w : h) / 2.6);
      for (let i = 0; i < n; i++) {
        const cx = horiz ? x + 1.3 + i * 2.6 : x + w / 2, cy = horiz ? y + h / 2 : y + 1.3 + i * 2.6;
        e += `<circle cx='${fmt(cx)}' cy='${fmt(cy - 0.4)}' r='1.6' fill='${snow ? '#dfe6ea' : '#55753e'}'/>`;
      }
      return e;
    }
    let e = `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='#6e5236'/>`;
    for (let i = 0; i < (horiz ? w : h); i += 1.4) {
      e += horiz ? `<line x1='${fmt(x + i)}' y1='${y}' x2='${fmt(x + i + 0.7)}' y2='${y + h}' stroke='#8a6a44' stroke-width='0.5'/>`
        : `<line x1='${x}' y1='${fmt(y + i)}' x2='${x + w}' y2='${fmt(y + i + 0.7)}' stroke='#8a6a44' stroke-width='0.5'/>`;
    }
    return e;
  };
  if (!(mask & 1)) s += side(0, 0, 40, 2.4, true);
  if (!(mask & 4)) s += side(0, 37.6, 40, 2.4, true);
  if (!(mask & 8)) s += side(0, 0, 2.4, 40, false);
  if (!(mask & 2)) s += side(37.6, 0, 2.4, 40, false);
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' preserveAspectRatio='none'>${s}</svg>`)}")`;
};
export const fieldTile3q = (crop = 'wheat', mask = 15, x = 0, y = 0, theme = 'grassland', edge = 'hedge') => {
  const variant = seedOf(x, y) % 4;
  return memo(`f|${crop}|${mask}|${variant}|${theme}|${edge}`, () => fieldTile(crop, mask, variant, theme, edge));
};

// Scarecrow sprite (same 60 x 100 canvas as buildings), stood in larger fields.
const scarecrow = () => {
  const ox = 30, oy = 84;
  const sway = `<animateTransform attributeName='transform' type='rotate' values='-2 ${ox} ${oy};2 ${ox} ${oy};-2 ${ox} ${oy}' dur='4.2s' repeatCount='indefinite'/>`;
  return wrap(`<ellipse cx='${ox + 3}' cy='${oy + 1}' rx='6' ry='1.6' fill='#0d0f14' opacity='0.25'/>` +
    `<g>${sway}<line x1='${ox}' y1='${oy}' x2='${ox}' y2='${oy - 22}' stroke='#5a4028' stroke-width='1.3'/>` +
    `<line x1='${ox - 7}' y1='${oy - 16}' x2='${ox + 7}' y2='${oy - 16}' stroke='#5a4028' stroke-width='1.1'/>` +
    `<path d='M${ox - 4},${oy - 17} h8 l1,8 h-10 z' fill='#7a5a3a'/>` +
    `<path d='M${ox - 7},${oy - 16.6} l3,-0.6 v1.6 l-3,0.4 z M${ox + 7},${oy - 16.6} l-3,-0.6 v1.6 l3,0.4 z' fill='#d1b26a'/>` +
    `<circle cx='${ox}' cy='${oy - 20}' r='2.6' fill='#d8c79a'/>` +
    `<path d='M${ox - 5},${oy - 21} q5,-2 10,0 l-2,-0.4 q-3,-4 -6,0 z' fill='#b8944a'/></g>`);
};
export const scarecrowSprite3q = () => memo('scarecrow', scarecrow);

// Townsfolk live in townsfolkSprites.js.

// --- public API (memoised) ---------------------------------------------------------------
const _cache = new Map();
const memo = (key, fn) => {
  let v = _cache.get(key);
  if (v === undefined) { v = fn(); _cache.set(key, v); }
  return v;
};

// Building sprite for a building tile. Houses vary per coordinate; civic buildings are
// stable per type (same as the flat art's cache keys).
const building = (buildingType, x, y, theme) => {
  const type = SPEC[buildingType] ? buildingType : 'house';
  const seed = type === 'house' ? seedOf(x, y) : seedOf(type.length * 31, type.charCodeAt(0));
  const variant = type === 'house' ? seed % 23 : 0;
  return memo(`b|${type}|${variant}|${theme}`, () => {
    _smokeOut = [];
    const bg = buildingSvg(type, type === 'house' ? variant * 7919 + 13 : seed, theme);
    const out = { bg, smoke: _smokeOut };
    _smokeOut = null;
    return out;
  });
};
export const buildingSprite3q = (buildingType = 'house', x = 0, y = 0, theme = 'grassland') => building(buildingType, x, y, theme).bg;
// Chimney smoke emitters for a building sprite, in sprite units (SPRITE_W x SPRITE_H):
// [{ x, y, dark, delay }]. Empty when the building has no lit chimney.
export const buildingSmoke3q = (buildingType = 'house', x = 0, y = 0, theme = 'grassland') => building(buildingType, x, y, theme).smoke;

const POI_KIND = { tree: 'tree', pine: 'pine', bush: 'bush', dead_bush: 'bush', flowers: 'flowers' };
// Sprite for a decoration POI, or null when this prototype has no 3/4 art for it
// (callers fall back to the existing emoji).
export const poiSprite3q = (poi, x = 0, y = 0) => {
  if (poi === 'fountain' || poi === 'well') return memo('fountain', fountain);
  const kind = POI_KIND[poi];
  if (!kind) return null;
  const variant = seedOf(x, y) % 9;
  return memo(`p|${kind}|${variant}`, () => tree(variant * 104729 + 7, kind));
};

// `x`/`y` pick one of a few weathering/slit variants so long runs don't repeat exactly.
// `flank` turns a straight run beside a gate into a tower that the gatehouse abuts.
// `outward` is false where the visible face looks into the town (or keep yard): no slits.
export const wallSprite3q = (mask, keep = false, x = 0, y = 0, flank = false, outward = true) => {
  const variant = seedOf(x, y) % 5;
  return memo(`w|${mask}|${keep ? 1 : 0}|${variant}|${flank ? 1 : 0}|${outward ? 1 : 0}`, () => wallSprite(mask, keep, variant, null, flank, outward));
};

// Gatehouse for a gap in a wall. `dir`: 'x' when the wall runs east-west (the road
// passes towards the camera), 'y' when it runs north-south. `keep` draws the smaller
// keep-compound gate with its portcullis half lowered.
export const gateSprite3q = (dir = 'x', keep = false, outward = true) =>
  memo(`g|${dir}|${keep ? 1 : 0}|${outward ? 1 : 0}`, () => wallSprite(dir === 'x' ? 10 : 5, keep, 0, dir === 'x' ? 'x' : 'y', false, outward));


export const BUILDING_TYPES_3Q = Object.keys(SPEC);
