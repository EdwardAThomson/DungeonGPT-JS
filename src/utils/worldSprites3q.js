// worldSprites3q.js
// PROTOTYPE (debug-only, /debug/world-3q): 3/4 sprites for the WORLD map, in the same
// camera, light and palette as the 3/4 town art (townSprites3q.js).
//
// Every POI tile becomes a list of "parts": upright sprites that stand on a point of
// their tile and may rise over the tile(s) behind them. The view sorts all parts by
// their ground y so nearer things overlap farther ones (World3QView.js).
//
// Pure view layer like the rest of the tile art: parts are derived only from tile
// fields + coordinates, so this re-skins existing saves without touching map data.
//
// Part shape: { bg, ax, ay, s, cw?, ch?, ox?, oy?, flat? }
//   bg      CSS url("data:image/svg+xml,...")
//   ax, ay  ground anchor inside the tile, in tile units (0..1, ay = how far down)
//   s       scale; at s = 1 one sprite unit is 1/40 of a tile
//   cw, ch  sprite canvas size in units (default 60 x 100, the town sprite canvas)
//   ox, oy  the canvas point that sits on the anchor (default 30, 92, as town sprites)
//   flat    a flat 40x40 tile icon drawn over the tile (fallback art), no anchor maths

import { kit3q, buildingSprite3q, poiSprite3q } from './townSprites3q';
import { poiSprite } from './worldTileArt';

const { makeCam, box, cone, cylinder, wrap, shade, mixHex, rng, seedOf, fmt, P } = kit3q;

const _cache = new Map();
const memo = (key, fn) => {
  let v = _cache.get(key);
  if (v === undefined) { v = fn(); _cache.set(key, v); }
  return v;
};

const groundShadow = (cx, cy, rx, ry, o = 0.24) =>
  `<ellipse cx='${fmt(cx)}' cy='${fmt(cy)}' rx='${fmt(rx)}' ry='${fmt(ry)}' fill='#0d0f14' opacity='${o}' filter='url(#soft)'/>`;

// Footing: what ties a sprite to the tile under it. A tight contact shadow, then a
// ragged fringe of ground (grass with tufts, snow drifts, sand) laid over the sprite's
// bottom edge so it sits IN the ground instead of on it; optional boulders for scree.
const FOOT = {
  grassland: { ground: '#7bae5e', blade: '#5b8c44', tip: '#98c579' },
  snow: { ground: '#f2f2f2', blade: '#d5dde6', tip: null },
  desert: { ground: '#e0c178', blade: '#cda85f', tip: null },
};
const footing = (x0, x1, by, theme, r, rocks = 0) => {
  const f = FOOT[theme] || FOOT.grassland;
  const cx = (x0 + x1) / 2;
  let s = `<ellipse cx='${fmt(cx + 1)}' cy='${fmt(by - 1.6)}' rx='${fmt((x1 - x0) / 2)}' ry='1.6' fill='#0d0f14' opacity='0.28' filter='url(#soft)'/>`;
  for (let i = 0; i < rocks; i++) { // scree at the foot
    const x = x0 + 3 + r() * (x1 - x0 - 6), y = by - 0.8 - r() * 1.2, w = 1.4 + r() * 1.6;
    s += `<path d='M${fmt(x - w)} ${fmt(y + 0.8)} Q${fmt(x - w * 0.8)} ${fmt(y - w * 0.9)} ${fmt(x + w * 0.2)} ${fmt(y - w * 0.8)} Q${fmt(x + w)} ${fmt(y - w * 0.4)} ${fmt(x + w)} ${fmt(y + 0.8)} Z' fill='#8a857c'/>` +
      `<path d='M${fmt(x - w)} ${fmt(y + 0.8)} Q${fmt(x - w * 0.8)} ${fmt(y - w * 0.9)} ${fmt(x + w * 0.2)} ${fmt(y - w * 0.8)} L${fmt(x)} ${fmt(y + 0.8)} Z' fill='#a39e94'/>`;
  }
  // ragged fringe: small rounded bumps of ground colour along the base line
  let d = `M${fmt(x0 - 2)} ${fmt(by + 1)}`;
  for (let x = x0 - 2; x < x1 + 2;) {
    const step = 2 + r() * 2.5, hgt = 0.8 + r() * 1.8;
    d += ` Q${fmt(x + step / 2)} ${fmt(by - hgt * 2)} ${fmt(x + step)} ${fmt(by)}`;
    x += step;
  }
  d += ` L${fmt(x1 + 4)} ${fmt(by + 1)} Z`;
  s += `<path d='${d}' fill='${f.ground}'/>`;
  if (theme !== 'desert') { // tufts on the fringe, in the ground tiles' own style
    for (let x = x0 + r() * 3; x < x1; x += 3 + r() * 4) {
      const y = by + 0.2 - r() * 0.8;
      s += `<path d='M${fmt(x)} ${fmt(y)} q-0.4 -1.3 -1.4 -1.9 M${fmt(x)} ${fmt(y)} q0.1 -1.5 0.4 -2.4 M${fmt(x)} ${fmt(y)} q0.6 -1.1 1.6 -1.6' stroke='${f.blade}' stroke-width='0.6' stroke-linecap='round' fill='none'/>` +
        (f.tip && r() > 0.5 ? `<path d='M${fmt(x)} ${fmt(y)} q0.1 -1.5 0.4 -2.4' stroke='${f.tip}' stroke-width='0.45' stroke-linecap='round' fill='none'/>` : '');
    }
  }
  return s;
};

// --- mountains ---------------------------------------------------------------------
const MOUNTAIN_PAL = {
  grassland: { lit: '#9a948a', dark: '#5f5a54', snow: '#f4f6f8', snowDark: '#c3cdd8', strata: '#6f6a62', snowFrac: 0.3 },
  snow: { lit: '#a3a7ad', dark: '#626871', snow: '#f7f9fb', snowDark: '#c8d3de', strata: '#717780', snowFrac: 0.55 },
  desert: { lit: '#c9a070', dark: '#8f6a45', snow: null, snowDark: null, strata: '#a37b52', snowFrac: 0 },
};

// One peak: a lit west face and a shaded east face meeting on a ridge line, a jagged
// snow cap, a few strata strokes. (cx, by) is the foot of the peak; hw half-width; h height.
// `o` shapes it: lean (-1..1, where the summit sits), drop (-1..1, which way the ridge
// runs down from it), bow (>1 a steep horn, <1 a rounded massif), shoulder (a secondary
// bump on the 'l' or 'r' flank) and snow (a factor on the palette's snowline).
const peak = (cx, by, hw, h, pal, r, o = {}) => {
  const lean = o.lean ?? (r() - 0.5) * 0.4, drop = o.drop ?? 0.2, bow = o.bow ?? 1;
  const px = cx + lean * hw * 0.45, py = by - h;
  const j = () => (r() - 0.5) * hw * 0.1;
  // a flank from the summit to a foot: f runs 0 (summit) -> 1 (foot); height falls as
  // f^bow, so bow > 1 keeps the top narrow and steep, bow < 1 makes broad shoulders
  const flank = (footX, sh) => {
    const pts = [];
    for (let i = 1; i <= 5; i++) {
      const f = i / 5;
      let y = py + h * Math.pow(f, 1 / bow);
      if (sh && i === 2) y -= h * 0.12; // the shoulder: a knob part way down
      if (sh && i === 3) y -= h * 0.05;
      pts.push([px + (footX - px) * f + (i < 5 ? j() : 0), i < 5 ? y + j() * 0.6 : by]);
    }
    return pts;
  };
  const lit = [[px, py], ...flank(cx - hw, o.shoulder === 'l')].reverse(); // foot -> summit
  const dark = [[px, py], ...flank(cx + hw, o.shoulder === 'r')]; // summit -> foot
  const rx = px + drop * hw * 0.55; // where the ridge reaches the ground
  const ridge = [[px, py], [px + (rx - px) * 0.3 + j() * 0.5, py + h * 0.3], [px + (rx - px) * 0.7 + j() * 0.5, py + h * 0.65], [rx, by]];
  const poly = (pts, fill) => `<polygon points='${pts.map(([a, b]) => `${fmt(a)},${fmt(b)}`).join(' ')}' fill='${fill}' stroke='${shade(fill, 0.7)}' stroke-width='0.4' stroke-linejoin='round'/>`;
  let s = poly([...lit, ...ridge.slice(1)], pal.lit);
  s += poly([...dark, ...ridge.slice().reverse().slice(0, -1)], pal.dark);
  // strata: short strokes following the slopes
  for (let i = 0; i < 4; i++) {
    const t = 0.45 + r() * 0.45, side = r() < 0.5 ? -1 : 1;
    const x = px + side * hw * t * 0.45, y = py + h * (0.12 + Math.pow(t, 1 / bow) * 0.8);
    if (side > 0 && x < rx + 1) continue; // keep each stroke on its own face
    const len = 2 + r() * 3;
    s += `<path d='M${fmt(x)} ${fmt(y)} l${fmt(side * len)} ${fmt(len * 0.5)}' stroke='${side < 0 ? shade(pal.lit, 0.82) : shade(pal.dark, 0.8)}' stroke-width='0.7' stroke-linecap='round'/>`;
  }
  const snowFrac = pal.snowFrac * (o.snow ?? 1);
  if (pal.snow && snowFrac > 0) {
    const sh = h * snowFrac;
    const at = (pts, y) => { // x on a polyline at height y
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return x0 + (x1 - x0) * ((y - y0) / ((y1 - y0) || 1));
      }
      return pts[pts.length - 1][0];
    };
    const yb = py + sh;
    const litTop = lit.slice().reverse(); // summit -> foot
    const litUp = litTop.filter(([, b]) => b < yb), darkUp = dark.filter(([, b]) => b < yb);
    const lx = at(litTop, yb), rgx = at(ridge, yb + 2), dx = at(dark, yb - 1);
    const pts = (a) => a.map(([x, y]) => `L${fmt(x)} ${fmt(y)}`).join(' ');
    const capL = `M${fmt(px)} ${fmt(py)} ${pts(litUp.slice(1))} L${fmt(lx)} ${fmt(yb)} l${fmt((rgx - lx) * 0.3)} ${fmt(-sh * 0.18)} l${fmt((rgx - lx) * 0.25)} ${fmt(sh * 0.22)} L${fmt(rgx)} ${fmt(yb + 2)} L${fmt(ridge[1][0])} ${fmt(Math.min(ridge[1][1], yb))} Z`;
    const capR = `M${fmt(px)} ${fmt(py)} L${fmt(ridge[1][0])} ${fmt(Math.min(ridge[1][1], yb))} L${fmt(rgx)} ${fmt(yb + 2)} l${fmt((dx - rgx) * 0.4)} ${fmt(-sh * 0.25)} l${fmt((dx - rgx) * 0.3)} ${fmt(sh * 0.15)} L${fmt(dx)} ${fmt(yb - 1)} ${pts(darkUp.slice(1).reverse())} Z`;
    s += `<path d='${capL}' fill='${pal.snow}'/><path d='${capR}' fill='${pal.snowDark}'/>`;
  }
  return s;
};

// Desert high ground: flat-topped mesas and buttes with banded cliffs over a scree
// slope (pointed sandstone peaks read as pyramids).
const MESA = { lit: '#d2a673', dark: '#97693f', top: '#e3c08b', talus: '#c39866', band: '#b98a5a' };
const mesa = (cx, by, hw, h, r) => {
  const p = (pts, fill) => `<polygon points='${pts.map(([a, b]) => `${fmt(a)},${fmt(b)}`).join(' ')}' fill='${fill}' stroke='${shade(fill, 0.72)}' stroke-width='0.4' stroke-linejoin='round'/>`;
  const ty = by - h, sy = by - h * 0.32, tw = hw * (0.5 + r() * 0.15), split = cx + tw * 0.25;
  let s = p([[cx - hw, by], [cx - hw * 0.78, sy], [cx + hw * 0.82, sy], [cx + hw, by]], MESA.talus);
  s += p([[cx - hw * 0.72, sy], [cx - tw, ty], [split, ty], [split + hw * 0.12, sy]], MESA.lit);
  s += p([[split, ty], [cx + tw, ty], [cx + hw * 0.76, sy], [split + hw * 0.12, sy]], MESA.dark);
  s += p([[cx - tw, ty], [cx - tw + 2.5, ty - 3], [cx + tw + 2.5, ty - 3], [cx + tw, ty]], MESA.top);
  for (let i = 1; i < 4; i++) { // strata bands across both cliff faces
    const t = i / 4 + (r() - 0.5) * 0.06, y = ty + (sy - ty) * t;
    const xl = cx - tw + (cx - hw * 0.72 - (cx - tw)) * t, xr = cx + tw + (cx + hw * 0.76 - (cx + tw)) * t;
    s += `<path d='M${fmt(xl + 0.6)} ${fmt(y)} L${fmt(xr - 0.6)} ${fmt(y)}' stroke='${MESA.band}' stroke-width='0.8' opacity='0.7'/>`;
  }
  for (let i = 0; i < 4; i++) { // scree
    const x = cx - hw * 0.7 + r() * hw * 1.4, y = by - 1 - r() * (by - sy) * 0.6;
    s += `<ellipse cx='${fmt(x)}' cy='${fmt(y)}' rx='1.2' ry='0.7' fill='${shade(MESA.talus, 0.8)}'/>`;
  }
  return s;
};
const mesaSvg = (v) => {
  const r = rng(v * 6151 + 7);
  const by = 93;
  let s = groundShadow(38, by - 6, 22, 5, 0.2);
  const kind = v % 3;
  if (kind === 0) s += mesa(30, by, 25, 34 + r() * 8, r);
  else if (kind === 1) { s += mesa(40, by - 6, 13, 30 + r() * 6, r); s += mesa(24, by, 19, 28 + r() * 6, r); }
  else { s += mesa(18, by - 5, 11, 36 + r() * 6, r); s += mesa(36, by, 18, 24 + r() * 6, r); }
  s += footing(4, 56, by, 'desert', r, 2);
  return wrap(s);
};

// A mountain massif: ONE landform per tile, like the hills. Peaks rise out of a shared
// ridge and meet at saddles (a smooth maximum of their profiles), with a craggy outline.
// Each peak owns the stretch between the gullies that run down from the saddles either
// side of it; a ridge line from its summit splits that stretch into a sunlit west face
// and a shaded east face, each with its own snow cap above the snowline. Nothing is
// layered over anything else, so no slope can lie across a neighbouring peak.
// peaks: [cx, h, w, bow (>1 steep horn, <1 rounded), drop (-1..1 ridge direction), snow]
const mountainMass = (id, peaks, by, pal, r) => {
  const H = Math.max(...peaks.map((p) => p[1]));
  const xs0 = Math.min(...peaks.map((p) => p[0] - p[2])), xs1 = Math.max(...peaks.map((p) => p[0] + p[2]));
  const ridgeH = H * (0.32 + r() * 0.12); // the shared ridge the peaks rise from
  const noise = Array.from({ length: 62 }, () => r() - 0.5);
  const jag = (x) => { const i = Math.floor(x), f = x - i; return noise[i] * (1 - f) + noise[i + 1] * f; };
  const prof = (x) => {
    const k = 1.6;
    let sum = 0;
    const add = (y) => { sum += Math.exp(y / k) - 1; };
    for (const [cx, h, w, bow = 1] of peaks) {
      const t = Math.abs(x - cx) / w;
      if (t < 1) add(h * Math.pow(1 - t, bow));
    }
    // the ridge: a broad, low back joining the outer peaks
    const span = (xs1 - xs0) / 2, mid = (xs0 + xs1) / 2, t = Math.abs(x - mid) / (span * 0.92);
    if (t < 1) add(ridgeH * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * t), 0.6));
    const y = k * Math.log(1 + sum) * Math.min(1, x / 5, (60 - x) / 5); // taper off before the canvas edge
    return y > 0.3 ? Math.max(0, y + jag(x) * (0.6 + y * 0.05)) : 0;
  };
  const top = [];
  for (let x = 0; x <= 60; x += 0.5) top.push([x, prof(x)]);
  const live = top.filter(([, y]) => y > 0.05);
  const x0 = live[0][0], x1 = live[live.length - 1][0];
  const outline = `M${fmt(x0)} ${by} ` + live.map(([x, y]) => `L${fmt(x)} ${fmt(by - y)}`).join(' ') + ` L${fmt(x1)} ${by} Z`;
  const yAt = (x) => prof(x);
  const ps = peaks.slice().sort((a, b) => a[0] - b[0]);
  // summit of each peak (highest outline point near its centre) and saddles between
  const summits = ps.map(([cx, , w]) => {
    let best = [cx, -1];
    for (let x = cx - w * 0.3; x <= cx + w * 0.3; x += 0.5) { const y = yAt(x); if (y > best[1]) best = [x, y]; }
    return best;
  });
  const saddles = [];
  for (let i = 0; i < summits.length - 1; i++) {
    let best = [summits[i][0], 1e9];
    for (let x = summits[i][0]; x <= summits[i + 1][0]; x += 0.5) { const y = yAt(x); if (y < best[1]) best = [x, y]; }
    saddles.push(best);
  }
  const line = (pts) => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
  // a gully: from a saddle down to the ground, leaning to one side so the neighbouring
  // faces fan out below it rather than standing as straight panels
  const gully = ([sx, sy]) => {
    const g = (r() < 0.5 ? -1 : 1) * (3 + r() * 4);
    return [[sx, by - sy], [sx + g * 0.35 + (r() - 0.5), by - sy * 0.5], [sx + g, by + 2]];
  };
  const gullies = saddles.map(gully);
  let defs = `<clipPath id='${id}'><path d='${outline}'/></clipPath>`;
  let body = `<path d='${outline}' fill='${pal.dark}'/>`;
  let faces = '';
  ps.forEach(([cx, h, w, , drop = 0.2, snow = 1], i) => {
    const [sx, sy] = summits[i];
    const left = i > 0 ? gullies[i - 1] : [[-2, by - 60], [-2, by + 2]];
    const right = i < ps.length - 1 ? gullies[i] : [[62, by - 60], [62, by + 2]];
    const lx = left[left.length - 1][0], rxB = right[right.length - 1][0];
    // ridge line from the summit down to the ground, kept inside this peak's stretch
    let bx = sx + drop * w * 0.75;
    bx = Math.max(lx + 3, Math.min(rxB - 3, bx));
    const ridge = [[sx, by - sy], [sx + (bx - sx) * 0.3 + (r() - 0.5), by - sy * 0.62], [sx + (bx - sx) * 0.7 + (r() - 0.5), by - sy * 0.28], [bx, by + 2]];
    const litZone = [[left[0][0], 0], ...left, ...ridge.slice().reverse(), [sx, 0]];
    const darkZone = [[sx, 0], ...ridge, ...right.slice().reverse(), [right[0][0], 0]];
    defs += `<clipPath id='${id}l${i}'><polygon points='${line(litZone)}'/></clipPath><clipPath id='${id}d${i}'><polygon points='${line(darkZone)}'/></clipPath>`;
    faces += `<polygon points='${line(litZone)}' fill='${pal.lit}'/>`;
    // strata: short strokes down each face
    for (let k = 0; k < 5; k++) {
      const onLit = r() < 0.55, t = 0.35 + r() * 0.55;
      const x = onLit ? sx - (sx - lx) * t * 0.7 : sx + (rxB - sx) * t * 0.7, yt = yAt(x);
      if (yt < 5) continue;
      const y = by - yt + 2 + r() * Math.min(10, yt - 4), len = 2 + r() * 3;
      faces += `<path d='M${fmt(x)} ${fmt(y)} l${fmt(onLit ? -len : len)} ${fmt(len * 0.55)}' stroke='${onLit ? shade(pal.lit, 0.82) : shade(pal.dark, 0.8)}' stroke-width='0.7' stroke-linecap='round'/>`;
    }
    // snow cap above a ragged snowline, lit and shaded halves
    const frac = pal.snow ? pal.snowFrac * snow : 0;
    if (frac > 0 && h > H * 0.6) {
      const yl = by - sy + sy * frac;
      const pts = [[left[0][0] - 1, 0]];
      for (let x = Math.min(lx, left[0][0]) - 1; x <= Math.max(rxB, right[0][0]) + 1; x += 1.6) {
        pts.push([x, yl + (r() - 0.5) * 3 + (Math.abs(x - sx) < 2 ? 2 : 0)]);
      }
      pts.push([right[0][0] + 1, 0]);
      faces += `<g clip-path='url(#${id}l${i})'><polygon points='${line(pts)}' fill='${pal.snow}'/></g>` +
        `<g clip-path='url(#${id}d${i})'><polygon points='${line(pts)}' fill='${pal.snowDark}'/></g>`;
    }
    faces += `<polyline points='${line(ridge.slice(0, 3))}' fill='none' stroke='${shade(pal.dark, 0.85)}' stroke-width='0.5' opacity='0.6'/>`;
  });
  // gullies read as soft creases
  for (const g of gullies) faces += `<polyline points='${line(g.slice(0, 2))}' fill='none' stroke='${shade(pal.dark, 0.75)}' stroke-width='0.8' opacity='0.35' stroke-linecap='round'/>`;
  defs += `<linearGradient id='${id}ao' x1='0' y1='${fmt(by - H * 0.35)}' x2='0' y2='${by}' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#1b1a1f' stop-opacity='0'/><stop offset='1' stop-color='#1b1a1f' stop-opacity='0.28'/></linearGradient>`;
  return `<defs>${defs}</defs>${body}<g clip-path='url(#${id})'>${faces}<rect x='0' y='${fmt(by - H)}' width='60' height='${fmt(H)}' fill='url(#${id}ao)'/></g>` +
    `<path d='${outline}' fill='none' stroke='${shade(pal.dark, 0.7)}' stroke-width='0.45' stroke-linejoin='round'/>`;
};

// Each variant is one massif: the highest peak is never on the end of a group of three
// or more, the group is mirrored at random, and every peak draws its own steepness,
// ridge direction and snowline.
const mountainSvg = (v, theme) => {
  if (theme === 'desert') return mesaSvg(v);
  const pal = MOUNTAIN_PAL[theme] || MOUNTAIN_PAL.grassland;
  const r = rng(v * 7919 + 101);
  const by = 93;
  // rock tone per massif: warm, cool or neutral grey, a touch lighter or darker
  const tone = [[1, 0], [0.94, 0.08], [1.06, -0.06], [0.9, 0]][Math.floor(r() * 4)];
  const tint = (c, w) => mixHex(shade(c, tone[0]), w > 0 ? '#8a6e52' : '#5f7286', Math.abs(w));
  const P2 = { ...pal, lit: tint(pal.lit, tone[1]), dark: tint(pal.dark, tone[1]), strata: tint(pal.strata, tone[1]) };
  // [cx, size 0..1, half-width]
  const LAYOUTS = [
    [[16, 0.55, 12], [31, 1, 14], [45, 0.7, 12]], // a peak between two lesser ones
    [[19, 0.82, 13], [39, 1, 14]], // twin summits on one ridge
    [[11, 0.45, 9], [23, 0.75, 11], [35, 1, 12], [48, 0.6, 10]], // a ridge of four
    [[22, 1, 16], [42, 0.62, 12]], // a big peak with a shoulder peak
    [[14, 0.42, 10], [30, 1, 18, 'massif'], [47, 0.48, 10]], // a broad massif
    [[13, 0.6, 10], [26, 0.86, 11], [39, 1, 12], [51, 0.5, 8]], // a climbing ridge
  ];
  const flip = r() < 0.5;
  const H = 38 + r() * 8;
  const peaks = LAYOUTS[v % LAYOUTS.length].map(([cx, size, w, kind]) => [
    (flip ? 60 - cx : cx) + (r() - 0.5) * 3,
    H * size * (0.92 + r() * 0.16),
    w * (1 + r() * 0.15),
    kind === 'massif' ? 0.7 + r() * 0.15 : r() < 0.35 ? 1.25 + r() * 0.3 : 0.85 + r() * 0.3,
    (r() < 0.75 ? 1 : -1) * (0.35 + r() * 0.65),
    0.6 + r() * 0.8,
  ]);
  let s = groundShadow(38, by - 6, 22, 5, 0.2);
  s += mountainMass(`m${v}`, peaks, by, P2, r);
  s += footing(4, 56, by, theme === 'snow' ? 'snow' : 'grassland', r, 3 + Math.floor(r() * 3));
  return wrap(s);
};

// --- hills -------------------------------------------------------------------------
const HILL_PAL = {
  grassland: { lit: '#b6da88', mid: '#79a856', dark: '#365c2b', rim: '#cfe8a6', ground: '#7bae5e', bush: true, rock: '#8f8a80' },
  snow: { lit: '#ffffff', mid: '#e3eaf1', dark: '#9fb0c2', rim: '#ffffff', ground: '#f2f2f2', bush: null, rock: '#7d7a76' },
  desert: { lit: '#e8cf96', mid: '#d4b373', dark: '#b08d55', tuft: null },
};
// Rolling hills: ONE landform per tile with two to four crowns. The outline is a smooth
// maximum of the crowns' profiles, so the crowns merge through soft valleys and no hill
// can lie across another (separately layered hills kept reading as one hill's foot
// draped over the next). Each crown is form-shaded under the west light inside the
// shared silhouette, and the whole mass fades into the ground at its foot.
// bumps: [cx, h, w, skew (-1..1), flat (0..1)]
const hillMass = (id, bumps, by, pal, r, feature) => {
  const prof = (x) => { // smooth max of raised-cosine crowns
    const k = 1.3;
    let sum = 0;
    for (const [cx, h, w, skew = 0, flat = 0] of bumps) {
      const ww = x < cx ? w * (1 + skew * 0.3) : w * (1 - skew * 0.3);
      const t = Math.abs(x - cx) / ww;
      const y = t >= 1 ? 0 : h * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * t), 0.75 - flat * 0.35);
      sum += Math.exp(y / k) - 1;
    }
    return k * Math.log(1 + sum);
  };
  let x0 = 60, x1 = 0;
  const pts = [];
  for (let x = 0; x <= 60; x += 0.5) {
    const y = prof(x);
    if (y > 0.05) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    pts.push([x, y]);
  }
  const top = pts.filter(([x]) => x >= x0 && x <= x1);
  const d = `M${fmt(x0)} ${by} ` + top.map(([x, y]) => `L${fmt(x)} ${fmt(by - y)}`).join(' ') + ` L${fmt(x1)} ${by} Z`;
  // sunlit edge: only the stretches of outline that rise to the east face the light
  let rim = '';
  for (let i = 1; i < top.length; i++) {
    const [xa, ya] = top[i - 1], [xb, yb] = top[i];
    if (yb > ya + 0.02 && yb > 2) rim += `M${fmt(xa)} ${fmt(by - ya)} L${fmt(xb)} ${fmt(by - yb)} `;
  }
  const H = Math.max(...bumps.map((b) => b[1]));
  let s = `<defs><clipPath id='${id}'><path d='${d}'/></clipPath>` +
    `<radialGradient id='${id}l'><stop offset='0' stop-color='${pal.lit}' stop-opacity='1'/><stop offset='1' stop-color='${pal.lit}' stop-opacity='0'/></radialGradient>` +
    `<radialGradient id='${id}d'><stop offset='0.25' stop-color='${pal.dark}' stop-opacity='0.95'/><stop offset='1' stop-color='${pal.dark}' stop-opacity='0'/></radialGradient>` +
    `<linearGradient id='${id}f' x1='0' y1='${fmt(by - H * 0.3)}' x2='0' y2='${by}' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='${pal.ground}' stop-opacity='0'/><stop offset='1' stop-color='${pal.ground}' stop-opacity='0.55'/></linearGradient></defs>`;
  s += `<path d='${d}' fill='${pal.mid}'/><g clip-path='url(#${id})'>`;
  for (const [cx, h, w] of bumps) { // shadow on each crown's east flank, light on its west
    s += `<ellipse cx='${fmt(cx + w * 0.65)}' cy='${fmt(by - h * 0.3)}' rx='${fmt(w * 0.75)}' ry='${fmt(h * 1.1)}' fill='url(#${id}d)'/>`;
  }
  for (const [cx, h, w] of bumps) {
    s += `<ellipse cx='${fmt(cx - w * 0.3)}' cy='${fmt(by - h * 0.8)}' rx='${fmt(w * 0.8)}' ry='${fmt(h * 0.6)}' fill='url(#${id}l)' opacity='0.9'/>`;
  }
  s += `<rect x='${fmt(x0)}' y='${fmt(by - H)}' width='${fmt(x1 - x0)}' height='${fmt(H)}' fill='url(#${id}f)'/>`;
  if (pal.bush) { // grass tufts over the face
    for (let i = 0; i < 6 + bumps.length * 3; i++) {
      const x = x0 + 2 + r() * (x1 - x0 - 4), yt = prof(x);
      if (yt < 4) continue;
      const y = by - yt + 2.2 + r() * (yt - 4.5);
      const lit = prof(x + 1) > yt; // on a west-facing (rising) slope
      const c = lit ? shade(pal.lit, 0.82) : shade(pal.mid, 0.8);
      s += `<path d='M${fmt(x)} ${fmt(y)} q-0.4 -1.2 -1.2 -1.7 M${fmt(x)} ${fmt(y)} q0.1 -1.4 0.3 -2.1 M${fmt(x)} ${fmt(y)} q0.5 -1.1 1.3 -1.5' stroke='${c}' stroke-width='0.5' fill='none' stroke-linecap='round'/>`;
    }
  }
  s += `<path d='${rim}' stroke='${pal.rim}' stroke-width='1.3' fill='none' stroke-linecap='round' opacity='0.55'/></g>`;
  // what stands on it, placed on the outline so nothing hovers
  const tree = (x, y, k = 1) =>
    `<ellipse cx='${fmt(x + 2 * k)}' cy='${fmt(y + 0.6)}' rx='${fmt(2.6 * k)}' ry='0.9' fill='#0d0f14' opacity='0.22'/>` +
    `<rect x='${fmt(x - 0.4)}' y='${fmt(y - 2.4 * k)}' width='0.8' height='${fmt(2.6 * k)}' fill='#563c27'/>` +
    `<circle cx='${fmt(x)}' cy='${fmt(y - 4 * k)}' r='${fmt(2.6 * k)}' fill='#3e6634'/><circle cx='${fmt(x - 0.7 * k)}' cy='${fmt(y - 4.7 * k)}' r='${fmt(1.6 * k)}' fill='#5a8a45'/>`;
  const main = bumps.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (pal.bush && feature === 'trees') { // one or two trees on a slope
    for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
      const [cx, , w] = bumps[Math.floor(r() * bumps.length)];
      const x = cx + (r() - 0.3) * w * 0.8, yt = prof(x);
      if (yt > 4) s += tree(x, by - yt * (0.35 + r() * 0.3));
    }
  } else if (pal.bush && feature === 'copse') { // a clump of trees on the highest crown
    const x0c = main[0] - 2 + r() * 3;
    [[-3, 0.4, 0.9], [3, 0.2, 0.95], [0, 1.6, 1.1], [-5.5, 2.4, 0.85], [5, 2.6, 0.9]].slice(0, 3 + Math.floor(r() * 3))
      .sort((a, b) => a[1] - b[1]).forEach(([dx, dy, k]) => { s += tree(x0c + dx, by - prof(x0c + dx) + 2.5 + dy, k); });
  } else if (feature === 'rocks') { // rocks breaking the snow
    for (let i = 0; i < 2; i++) {
      const [cx, , w] = bumps[Math.floor(r() * bumps.length)];
      const x = cx + (r() - 0.5) * w * 0.8, yt = prof(x);
      if (yt < 4) continue;
      const y = by - yt * (0.4 + r() * 0.3);
      s += `<path d='M${fmt(x - 2)} ${fmt(y + 1)} L${fmt(x - 0.6)} ${fmt(y - 1.6)} L${fmt(x + 1.6)} ${fmt(y - 0.8)} L${fmt(x + 2.2)} ${fmt(y + 1)} Z' fill='${pal.rock}'/><path d='M${fmt(x - 2)} ${fmt(y + 1)} L${fmt(x - 0.6)} ${fmt(y - 1.6)} L${fmt(x)} ${fmt(y + 1)} Z' fill='${shade(pal.rock, 1.25)}'/>`;
    }
  }
  return s;
};
// Sand dunes: a long lit windward slope up to a sharp crest, a short shaded lee face.
const dune = (cx, by, w, h, pal) => {
  const kx = cx + w * 0.25, ky = by - h;
  return `<path d='M${fmt(cx - w)} ${by} Q${fmt(cx - w * 0.15)} ${fmt(by - h * 0.95)} ${fmt(kx)} ${fmt(ky)} Q${fmt(cx + w * 0.55)} ${fmt(by - h * 0.45)} ${fmt(cx + w)} ${by} Z' fill='${pal.dark}'/>` +
    `<path d='M${fmt(cx - w)} ${by} Q${fmt(cx - w * 0.15)} ${fmt(by - h * 0.95)} ${fmt(kx)} ${fmt(ky)} Q${fmt(kx - w * 0.1)} ${fmt(by - h * 0.4)} ${fmt(kx + w * 0.05)} ${by} Z' fill='${pal.mid}'/>` +
    `<path d='M${fmt(cx - w * 0.55)} ${fmt(by - h * 0.35)} Q${fmt(cx - w * 0.1)} ${fmt(by - h * 0.85)} ${fmt(kx - 0.6)} ${fmt(ky + 0.6)}' stroke='${pal.lit}' stroke-width='1' fill='none' stroke-linecap='round'/>`;
};
const hillsSvg = (v, theme) => {
  const pal = HILL_PAL[theme] || HILL_PAL.grassland;
  const r = rng(v * 104729 + 33);
  const by = 93;
  let s = '';
  if (theme === 'desert') {
    const kind = v % 3;
    const dunes = kind === 0 ? [[22, by - 5, 14, 13], [38, by, 17, 16]]
      : kind === 1 ? [[40, by - 5, 13, 12], [18, by - 2, 13, 11], [30, by, 15, 14]]
        : [[30, by, 22, 18]];
    for (const [cx, b, rx, ry] of dunes) s += dune(cx + (r() - 0.5) * 3, b, rx * 1.4, ry * 0.75, pal);
    s += footing(6, 54, by, 'desert', r);
    return wrap(s);
  }
  // crowns per layout: [cx, height, half-width]. With three or more, the highest is
  // never on the end, so a group does not step down one way.
  const LAYOUTS = [
    [[22, 12, 13], [40, 17, 15]],
    [[14, 9, 10], [30, 17, 14], [46, 11, 11]],
    [[30, 16, 21]],
    [[14, 12, 11], [30, 8, 10], [45, 16, 13]],
    [[12, 7, 8], [27, 15, 13], [43, 11, 12], [53, 6, 6]],
    [[20, 14, 15], [40, 13, 14]],
  ];
  const flip = r() < 0.5;
  const bumps = LAYOUTS[v % LAYOUTS.length].map(([cx, h, w]) => [
    (flip ? 60 - cx : cx) + (r() - 0.5) * 3,
    h * (0.88 + r() * 0.24),
    w * 1.25 * (0.92 + r() * 0.16),
    (r() - 0.5) * 1.2,
    r() < 0.3 ? 0.4 + r() * 0.5 : r() * 0.2,
  ]);
  const features = theme === 'snow' ? ['rocks', null, 'rocks'] : ['trees', 'copse', null, 'trees'];
  s += hillMass(`h${v}`, bumps, by, pal, r, features[Math.floor(r() * features.length)]);
  s += footing(4, 56, by, theme === 'snow' ? 'snow' : 'grassland', r);
  return wrap(s);
};

// --- cave mouth ----------------------------------------------------------------------
const caveSvg = (theme) => {
  const pal = theme === 'desert' ? { ...MOUNTAIN_PAL.desert, lit: MESA.lit, dark: MESA.dark } : (MOUNTAIN_PAL[theme] || MOUNTAIN_PAL.grassland);
  const r = rng(77);
  const by = 93;
  let s = groundShadow(34, by - 1, 24, 4.5);
  s += theme === 'desert' ? mesa(30, by, 23, 28, r) : peak(30, by, 23, 30, { ...pal, snowFrac: theme === 'snow' ? 0.35 : 0 }, r);
  // the mouth: a dark arch in the lit face, with a lip of rock over it
  s += `<path d='M19 ${by} L19 ${by - 8} Q19 ${by - 15} 26 ${by - 15} Q33 ${by - 15} 33 ${by - 8} L33 ${by} Z' fill='#16151a'/>`;
  s += `<path d='M21 ${by} L21 ${by - 7} Q21 ${by - 12.5} 26 ${by - 12.5} Q31 ${by - 12.5} 31 ${by - 7} L31 ${by} Z' fill='#0b0b0e'/>`;
  s += `<path d='M17.5 ${by - 9} Q19 ${by - 17} 26 ${by - 17} Q34 ${by - 17} 35 ${by - 9}' stroke='${shade(pal.lit, 0.75)}' stroke-width='1.6' fill='none' stroke-linecap='round'/>`;
  // a couple of boulders by the entrance
  s += `<ellipse cx='14' cy='${by - 1}' rx='3.4' ry='2.4' fill='${pal.dark}'/><ellipse cx='13.4' cy='${by - 1.8}' rx='2.6' ry='1.6' fill='${pal.lit}'/>`;
  s += `<ellipse cx='38' cy='${by}' rx='2.6' ry='1.8' fill='${pal.dark}'/><ellipse cx='37.6' cy='${by - 0.6}' rx='2' ry='1.2' fill='${pal.lit}'/>`;
  return wrap(s);
};

// --- ruins ---------------------------------------------------------------------------
const ruinsSvg = (theme) => {
  const ox = 30, oy = 90;
  const cam = makeCam(ox, oy);
  const stone = theme === 'desert' ? '#cdb48a' : P.stonePale;
  const moss = theme === 'desert' ? null : '#6f7d55';
  let s = groundShadow(36, oy - 2, 24, 5, 0.22);
  // back wall (receding), broken to different heights
  s += box(cam, -16, -13, 16, 24, 0, 9, stone);
  s += box(cam, -16, -13, 8, 16, 0, 15, stone);
  s += box(cam, -16, -13, 2, 8, 0, 6, stone);
  // a toppled column drum lying behind
  s += cylinder(cam, 6, 20, 2.6, 0, 3, stone, 10);
  // standing columns, one snapped
  s += cylinder(cam, 2, 10, 2.2, 0, 19, stone, 10);
  s += box(cam, -1, 5, 7, 13, 19, 21, stone);
  s += cylinder(cam, 12, 10, 2.2, 0, 8, stone, 10);
  // front wall stub
  s += box(cam, -14, -4, 0, 3, 0, 7, stone);
  s += box(cam, -4, 2, 0, 3, 0, 3.5, stone);
  // rubble
  s += box(cam, 9, 12, -1, 2, 0, 2, shade(stone, 0.95));
  s += box(cam, 14, 16, 1, 3, 0, 1.5, shade(stone, 0.9));
  if (moss) s += `<path d='M${ox - 14} ${oy - 7} q3 2 6 0 q2 1 4 0' stroke='${moss}' stroke-width='1.2' fill='none' opacity='0.8'/>`;
  return wrap(s);
};

// --- snowy pine (the town pine with snow on its boughs) ------------------------------
const snowPineSvg = (v) => {
  const r = rng(v * 31 + 5);
  const ox = 30, oy = 92;
  let s = groundShadow(ox + 6, oy - 2, 11, 4, 0.2);
  s += `<rect x='${ox - 1.2}' y='${oy - 8}' width='2.4' height='8' fill='${P.woodDark}'/>`;
  const base = r() < 0.5 ? '#2f5640' : '#365e44';
  for (let i = 0; i < 4; i++) {
    const y = oy - 6 - i * 7, w = 11 - i * 2.3;
    s += `<polygon points='${ox - w},${y} ${ox + w},${y} ${ox},${y - 11}' fill='${shade(base, 0.85 + i * 0.07)}'/>` +
      `<polygon points='${ox},${y} ${ox + w},${y} ${ox},${y - 11}' fill='${shade(base, 0.65)}' opacity='0.7'/>` +
      `<path d='M${fmt(ox - w * 0.75)} ${fmt(y - 2.2)} Q${ox} ${fmt(y - 4.5)} ${fmt(ox + w * 0.7)} ${fmt(y - 2.4)} L${ox} ${y - 11} Z' fill='#f2f6f9' opacity='0.92'/>`;
  }
  return wrap(s);
};

// --- city wall ring (split so the town's buildings sit between back and front) --------
const WALL_D = 30; // depth of the walled enclosure, world units
const wallColorFor = (theme) => (theme === 'desert' ? P.mudbrick : P.stone);
const crenels = (cam, x0, x1, y0, y1, z, color) => {
  let s = '';
  const alongX = Math.abs(x1 - x0) > Math.abs(y1 - y0);
  const len = alongX ? x1 - x0 : y1 - y0;
  for (let t = 0; t < len - 1; t += 3) {
    s += alongX ? box(cam, x0 + t, x0 + t + 1.5, y0, y1, z, z + 1.6, color) : box(cam, x0, x1, y0 + t, y0 + t + 1.5, z, z + 1.6, color);
  }
  return s;
};
const tower = (cam, x, y, color, roof) =>
  cylinder(cam, x, y, 3.4, 0, 11, color, 10) + cone(cam, x, y, 4.2, 11, 6, roof, 10);
const wallBackSvg = (theme) => {
  const ox = 30, oy = 66; // anchor = the back wall line; side walls run forward of it
  const cam = makeCam(ox, oy);
  const c = wallColorFor(theme), roof = theme === 'desert' ? '#a87f55' : P.slate;
  let s = '';
  s += box(cam, -18, 18, 0, 2.5, 0, 7, c) + crenels(cam, -18, 18, 0, 2.5, 7, c);
  s += tower(cam, -18, 1, c, roof) + tower(cam, 18, 1, c, roof);
  s += box(cam, -18, -15.5, -WALL_D, 0, 0, 7, c) + crenels(cam, -18, -15.5, -WALL_D, 0, 7, c);
  s += box(cam, 15.5, 18, -WALL_D, 0, 0, 7, c) + crenels(cam, 15.5, 18, -WALL_D, 0, 7, c);
  return wrap(s);
};
const wallFrontSvg = (theme) => {
  const ox = 30, oy = 92;
  const cam = makeCam(ox, oy);
  const c = wallColorFor(theme), roof = theme === 'desert' ? '#a87f55' : P.slate;
  let s = groundShadow(36, oy, 26, 3, 0.18);
  s += box(cam, -18, 18, 0, 2.5, 0, 7, c) + crenels(cam, -18, 18, 0, 2.5, 7, c);
  // gate: a dark arch with a timber door
  s += `<path d='M${ox - 3.6} ${oy} L${ox - 3.6} ${oy - 3.6} Q${ox} ${oy - 7.4} ${ox + 3.6} ${oy - 3.6} L${ox + 3.6} ${oy} Z' fill='#2a1d14'/>`;
  s += tower(cam, -18, 1, c, roof) + tower(cam, 18, 1, c, roof);
  return wrap(s);
};

// --- POI -> parts ----------------------------------------------------------------------
const themeOf = (tile, fallback = 'grassland') =>
  (tile.biome === 'desert' ? 'desert' : tile.biome === 'snow' ? 'snow' : fallback);

// Building lists per settlement size: [type, ax, ay, s]
const TOWN_LAYOUT = {
  hamlet: [['house', 0.3, 0.6, 0.6], ['house', 0.7, 0.84, 0.6]],
  village: [['house', 0.26, 0.48, 0.56], ['house', 0.72, 0.54, 0.56], ['barn', 0.74, 0.92, 0.5], ['house', 0.3, 0.9, 0.56]],
  town: [['temple', 0.62, 0.4, 0.5], ['house', 0.2, 0.5, 0.5], ['inn', 0.46, 0.7, 0.5], ['house', 0.84, 0.68, 0.5], ['house', 0.2, 0.94, 0.5], ['house', 0.72, 0.97, 0.5]],
  city: [['keep', 0.52, 0.62, 0.42], ['house', 0.24, 0.76, 0.42], ['house', 0.8, 0.78, 0.42], ['house', 0.38, 0.93, 0.4], ['house', 0.66, 0.94, 0.4]],
};

const forestParts = (tile, theme) => {
  const x = tile.x || 0, y = tile.y || 0;
  const r = rng(seedOf(x, y) + 17);
  const parts = [];
  if (theme === 'desert') {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) parts.push({ bg: poiSprite3q('cactus', x * 3 + i, y * 5 + i, 'desert'), ax: 0.2 + r() * 0.6, ay: 0.45 + r() * 0.5, s: 0.62 });
    parts.push({ bg: poiSprite3q('dead_bush', x + 1, y, 'desert'), ax: 0.2 + r() * 0.6, ay: 0.85 + r() * 0.12, s: 0.6 });
    return parts;
  }
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const ax = 0.14 + r() * 0.72, ay = 0.3 + r() * 0.66;
    let bg;
    if (theme === 'snow') bg = memo(`spine|${(x * 3 + i * 7 + y) % 6}`, () => snowPineSvg((x * 3 + i * 7 + y) % 6));
    else bg = poiSprite3q(r() < 0.45 ? 'pine' : 'tree', x * 7 + i * 3, y * 11 + i, 'grassland');
    parts.push({ bg, ax, ay, s: 0.5 + r() * 0.12 });
  }
  return parts;
};

const townParts = (tile, theme) => {
  const size = TOWN_LAYOUT[tile.townSize] ? tile.townSize : 'village';
  const x = tile.x || 0, y = tile.y || 0;
  const parts = TOWN_LAYOUT[size].map(([type, ax, ay, s], i) => ({
    bg: buildingSprite3q(type, x * 13 + i * 5, y * 17 + i * 3, theme), ax, ay, s,
  }));
  if (size === 'city') {
    // the back wall's canvas anchor (30, 66) is its back line; at s = 1 the enclosure is
    // WALL_D * 0.7 units deep, i.e. this many tiles in front of the back wall:
    const front = 0.97, back = front - (WALL_D * 0.7) / 40;
    parts.push({ bg: memo(`wallB|${theme}`, () => wallBackSvg(theme)), ax: 0.5, ay: back, s: 1, oy: 66 });
    parts.push({ bg: memo(`wallF|${theme}`, () => wallFrontSvg(theme)), ax: 0.5, ay: front, s: 1 });
  }
  return parts;
};

// Parts for one world tile, or [] when it has no POI art. `mapTheme` is the map's
// theme; each tile still follows its own biome (a desert tile in a grassland world).
export const worldPoiParts3q = (tile, mapTheme = 'grassland') => {
  if (!tile || !tile.poi) return [];
  const theme = themeOf(tile, mapTheme === 'desert' || mapTheme === 'snow' ? mapTheme : 'grassland');
  const v = seedOf(tile.x || 0, tile.y || 0);
  switch (tile.poi) {
    case 'forest': return forestParts(tile, theme);
    case 'mountain': return [{ bg: memo(`mtn|${v % 24}|${theme}`, () => mountainSvg(v % 24, theme)), ax: 0.5, ay: 0.94, s: 1 }];
    case 'hills': return [{ bg: memo(`hill|${v % 24}|${theme}`, () => hillsSvg(v % 24, theme)), ax: 0.5, ay: 0.92, s: 1 }];
    case 'cave_entrance': return [{ bg: memo(`cave|${theme}`, () => caveSvg(theme)), ax: 0.5, ay: 0.92, s: 1 }];
    case 'ruins': return [{ bg: memo(`ruins|${theme}`, () => ruinsSvg(theme)), ax: 0.5, ay: 0.9, s: 0.95 }];
    case 'town': return townParts(tile, theme);
    default: {
      // authored milestone locations keep their flat icon until they get 3/4 art
      const flat = poiSprite(tile);
      return flat ? [{ bg: flat, flat: true, ax: 0.5, ay: 1 }] : [];
    }
  }
};

// Gallery accessors for the debug page.
export const sampleWorld3q = {
  mountain: () => mountainSvg(0, 'grassland'),
  'mtn twin': () => mountainSvg(1, 'grassland'),
  'mtn range': () => mountainSvg(2, 'grassland'),
  'mtn snow': () => mountainSvg(1, 'snow'),
  'mtn desert': () => mountainSvg(2, 'desert'),
  hills: () => hillsSvg(0, 'grassland'),
  'hills 3': () => hillsSvg(1, 'grassland'),
  'hills sand': () => hillsSvg(1, 'desert'),
  'hills snow': () => hillsSvg(2, 'snow'),
  cave: () => caveSvg('grassland'),
  ruins: () => ruinsSvg('grassland'),
  'snow pine': () => snowPineSvg(1),
};

// Every drawn variant, for the debug page's variant strip.
export const worldVariants3q = {
  mountain: { count: 24, svg: mountainSvg },
  hills: { count: 24, svg: hillsSvg },
};
