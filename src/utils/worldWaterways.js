// worldWaterways.js
// Rivers, roads and bridges on the world map, drawn as one continuous layer instead of a
// separate line per tile (view layer only; reads the saved grid and never changes it, so
// every existing save gets it with no migration, see CLAUDE.md).
//
// Generation stores rivers and roads per tile (hasRiver/riverConnections, hasPath/
// pathConnections). Here they are traced back into whole lines, smoothed across tiles,
// and drawn: rivers as a water channel with banks that widens downstream and opens out
// where it meets the sea or a lake, roads as a dirt track, and a bridge wherever a road
// crosses a river. Where a road runs along the same tiles as a river (the generator lets
// it), the road is drawn on the bank beside the river instead of on top of it.
//
// All geometry is in tile units: tile (x, y) spans [x, x+1] x [y, y+1].

import { roadArms, roadBend } from './roadArms';

const OFF = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const ARM_OFF = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const key = (x, y) => `${x},${y}`;

// deterministic 0..1 per (x, y, salt)
const hash = (x, y, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const tileAt = (map, x, y) => map?.[y]?.[x];
const isWater = (t) => t?.biome === 'water';

// ---------------------------------------------------------------------------------------
// graph tracing

// Undirected graph -> list of node chains, split at every node whose degree is not 2.
const traceChains = (nodes, adj) => {
  const seen = new Set();
  const ek = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const chains = [];
  const walk = (start, next) => {
    const chain = [start];
    let prev = start, cur = next;
    seen.add(ek(prev, cur));
    while (true) {
      chain.push(cur);
      const nbrs = adj.get(cur) || [];
      if (nbrs.length !== 2) break;
      const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0];
      if (seen.has(ek(cur, nxt))) break;
      seen.add(ek(cur, nxt));
      prev = cur; cur = nxt;
    }
    return chain;
  };
  nodes.forEach((n) => {
    const nbrs = adj.get(n) || [];
    if (nbrs.length === 2) return;
    nbrs.forEach((m) => { if (!seen.has(ek(n, m))) chains.push(walk(n, m)); });
  });
  // loops with no endpoint
  nodes.forEach((n) => {
    (adj.get(n) || []).forEach((m) => { if (!seen.has(ek(n, m))) chains.push(walk(n, m)); });
  });
  return chains;
};

const addEdge = (adj, a, b) => {
  if (a === b) return;
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  if (!adj.get(a).includes(b)) adj.get(a).push(b);
  if (!adj.get(b).includes(a)) adj.get(b).push(a);
};

const parse = (k) => k.split(',').map(Number);

// ---------------------------------------------------------------------------------------
// rivers

/**
 * River network: chains of tile keys from source to mouth, plus per-node flow (tiles
 * from the nearest source), used for the downstream widening.
 */
export const riverNetwork = (map) => {
  const adj = new Map();
  const rows = map?.length || 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < (map[y]?.length || 0); x++) {
      const t = map[y][x];
      if (!t?.hasRiver || isWater(t)) continue;
      (t.riverConnections || []).forEach((c) => {
        const o = OFF[c];
        if (!o) return;
        const n = tileAt(map, x + o[0], y + o[1]);
        if (!n) return;
        // into water (the mouth), into a river tile, or through a town (generation skips
        // towns, so the river would otherwise break at every riverside town)
        if (isWater(n) || n.hasRiver || n.poi === 'town') addEdge(adj, key(x, y), key(x + o[0], y + o[1]));
      });
    }
  }
  // a town that a river only enters (no way out) is a dead end, not a crossing: keep it
  // only when the river continues out the other side
  [...adj.keys()].forEach((k) => {
    const [x, y] = parse(k);
    if (tileAt(map, x, y)?.poi === 'town' && adj.get(k).length < 2) {
      adj.get(k).forEach((m) => { adj.set(m, adj.get(m).filter((z) => z !== k)); });
      adj.delete(k);
    }
  });
  // water tiles are mouths: never walk on through open water
  [...adj.keys()].forEach((k) => {
    const [x, y] = parse(k);
    if (!isWater(tileAt(map, x, y))) return;
    adj.get(k).forEach((m) => {
      const [mx, my] = parse(m);
      if (isWater(tileAt(map, mx, my))) adj.set(k, adj.get(k).filter((z) => z !== m));
    });
  });

  // flow: BFS from sources (land ends that are not mouths)
  const nodes = [...adj.keys()];
  const flow = new Map();
  const queue = [];
  nodes.forEach((k) => {
    const [x, y] = parse(k);
    if (adj.get(k).length === 1 && !isWater(tileAt(map, x, y))) { flow.set(k, 0); queue.push(k); }
  });
  while (queue.length) {
    const k = queue.shift();
    adj.get(k).forEach((m) => { if (!flow.has(m)) { flow.set(m, flow.get(k) + 1); queue.push(m); } });
  }
  nodes.forEach((k) => { if (!flow.has(k)) flow.set(k, 0); });

  const chains = traceChains(nodes, adj).map((c) => (flow.get(c[0]) > flow.get(c[c.length - 1]) ? c.reverse() : c));
  return { chains, flow, adj };
};

// river half-width (tile units) by flow
const riverHalf = (flow) => 0.075 + Math.min(flow, 12) * 0.0065;

// ---------------------------------------------------------------------------------------
// roads

export const roadNetwork = (map) => {
  const adj = new Map();
  const rows = map?.length || 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < (map[y]?.length || 0); x++) {
      roadArms(map, x, y).forEach((a) => {
        const [dx, dy] = ARM_OFF[a];
        const n = tileAt(map, x + dx, y + dy);
        if (!n || isWater(n)) return;
        addEdge(adj, key(x, y), key(x + dx, y + dy));
      });
    }
  }
  const nodes = [...adj.keys()];
  return { chains: traceChains(nodes, adj), adj };
};

// ---------------------------------------------------------------------------------------
// geometry

// Catmull-Rom through pts (open), sampled `per` times per segment.
const sampleSpline = (pts, per = 8) => {
  if (pts.length < 2) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({
        x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y),
        w: p1.w != null ? p1.w + (p2.w - p1.w) * t : undefined,
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
};

const r3 = (v) => Math.round(v * 1000) / 1000;
const polyD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r3(p.x)},${r3(p.y)}`).join('');

// closed outline of a variable-width ribbon along sampled pts (p.w = half-width)
const ribbonD = (pts, extra = 0) => {
  if (pts.length < 2) return '';
  const L = [], R = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const w = p.w + extra * (p.bk == null ? 1 : p.bk);
    L.push({ x: p.x - ty * w, y: p.y + tx * w });
    R.push({ x: p.x + ty * w, y: p.y - tx * w });
  });
  return `${polyD(L)}L${R.reverse().map((p) => `${r3(p.x)},${r3(p.y)}`).join('L')}Z`;
};

// segment intersection -> {x, y, t, u} or null
const segX = (a, b, c, d) => {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rx * t, y: a.y + ry * t };
};

// ---------------------------------------------------------------------------------------
// layout: everything the layer draws, in tile units

/**
 * @returns {{ rivers: {pts, mouth}[], roads: {pts}[], bridges: {x, y, angle, span}[] }}
 */
export const waterwaysLayout = (map) => {
  if (!Array.isArray(map) || !map.length) return { rivers: [], roads: [], bridges: [] };
  const { chains: rChains, flow, adj: rAdj } = riverNetwork(map);

  // river control points: tile centres, nudged a little off the grid line on interior
  // points so long straight runs meander instead of reading as ruled lines
  const riverPt = new Map(); // tile key -> centre used by the river there
  const center = (k) => {
    if (riverPt.has(k)) return riverPt.get(k);
    const [x, y] = parse(k);
    const nb = rAdj.get(k) || [];
    let px = x + 0.5, py = y + 0.5;
    if (nb.length === 2 && tileAt(map, x, y)?.poi !== 'town') {
      const [ax, ay] = parse(nb[0]), [bx, by] = parse(nb[1]);
      const straight = ax === bx || ay === by;
      const j = (hash(x, y, 7) - 0.5) * (straight ? 0.3 : 0.14);
      if (ax === bx) px += j; else if (ay === by) py += j; else { px += j * 0.6; py += j * 0.6; }
    }
    const p = { x: px, y: py };
    riverPt.set(k, p);
    return p;
  };

  const rivers = rChains.map((c) => {
    let pts = c.map((k) => ({ ...center(k), w: riverHalf(flow.get(k)) }));
    const last = parse(c[c.length - 1]);
    const mouth = isWater(tileAt(map, last[0], last[1])) && pts.length >= 2;
    const first = parse(c[0]);
    if (!mouth || c.length > 2) {
      const src = tileAt(map, first[0], first[1]);
      if (src && (rAdj.get(c[0]) || []).length === 1 && !isWater(src)) pts[0].w = 0.035; // a spring, not a cut-off end
    }
    let shore = -1; // control-point index of the waterline
    if (mouth) {
      // End at the waterline instead of running on into the lake or sea. A beach tile is
      // half water (its shoreline runs through the tile centre), so there the waterline
      // is the beach tile's own point; next to open water it is the shared tile edge.
      // Past the waterline the channel runs on a little in the same blue, so it merges
      // into the open water with no visible end.
      const land = pts[pts.length - 2], water = pts[pts.length - 1];
      const [lx, ly] = parse(c[c.length - 2]);
      const onBeach = tileAt(map, lx, ly)?.biome === 'beach';
      const dx = water.x - land.x, dy = water.y - land.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const sp0 = onBeach ? { x: lx + 0.5, y: ly + 0.5 } : { x: lx + 0.5 + ux * 0.5, y: ly + 0.5 + uy * 0.5 };
      const w0 = land.w * 1.2;
      const tail = { x: sp0.x + ux * 0.3, y: sp0.y + uy * 0.3, w: w0 * 1.5 };
      pts = onBeach
        ? [...pts.slice(0, -2), { ...sp0, w: w0 }, tail]
        : [...pts.slice(0, -1), { ...sp0, w: w0 }, tail];
      shore = pts.length - 2;
    }
    const PER = 10;
    const sp = sampleSpline(pts, PER);
    let shoreAt = -1;
    if (shore > 0) {
      // banks thin out over the last stretch before the waterline and are gone at it
      const si = shore * PER;
      for (let i = 0; i < sp.length; i++) {
        if (i >= si) sp[i].bk = 0;
        else if (i > si - PER) sp[i].bk = (si - i) / PER;
      }
      shoreAt = si;
    }
    return { pts: sp, mouth, shoreAt };
  });

  // roads: tile centres (beach tiles bend landward, as roadBend does for the flat art);
  // on a river tile the road moves onto the bank beside the river
  const { chains: dChains, adj: dAdj } = roadNetwork(map);
  // the river's direction through a tile, always pointing downstream so that "left bank"
  // means the same side all along a run
  const riverTangent = (k) => {
    const nb = (rAdj.get(k) || []).slice().sort((p, q) => flow.get(p) - flow.get(q));
    if (!nb.length) return null;
    const [x, y] = parse(k);
    let [ax, ay] = parse(nb[0]);
    let [bx, by] = nb.length > 1 ? parse(nb[nb.length - 1]) : [x, y];
    if (nb.length === 1 && flow.get(nb[0]) > flow.get(k)) { [ax, ay] = [x, y]; [bx, by] = parse(nb[0]); }
    let tx = bx - ax, ty = by - ay;
    const len = Math.hypot(tx, ty) || 1;
    return { tx: tx / len, ty: ty / len };
  };
  const shares = (k, m) => (rAdj.get(k) || []).includes(m);
  const isTown = (k) => tileAt(map, ...parse(k))?.poi === 'town';

  // one position per road tile, shared by every road through it
  const pos = new Map();
  dAdj.forEach((_, k) => {
    const [x, y] = parse(k);
    const bend = roadBend(tileAt(map, x, y));
    pos.set(k, { x: x + 0.5 + (bend ? bend.dx / 40 : 0), y: y + 0.5 + (bend ? bend.dy / 40 : 0) });
  });
  // tiles where a road runs along the river (shares a river edge) move onto one bank;
  // a connected run picks its bank from where the road leaves it
  const along = new Set();
  dAdj.forEach((nbrs, k) => { if (!isTown(k) && nbrs.some((m) => shares(k, m))) along.add(k); });
  const placed = new Set();
  along.forEach((k0) => {
    if (placed.has(k0)) return;
    const comp = [k0];
    placed.add(k0);
    for (let q = 0; q < comp.length; q++) {
      (dAdj.get(comp[q]) || []).forEach((m) => { if (along.has(m) && !placed.has(m)) { placed.add(m); comp.push(m); } });
    }
    let side = -1;
    for (const k of comp) {
      const exit = (dAdj.get(k) || []).find((m) => !along.has(m));
      if (!exit) continue;
      const rp = riverPt.get(k) || pos.get(k);
      const tg = riverTangent(k);
      if (!tg) continue;
      const [ex, ey] = parse(exit);
      side = tg.tx * (ey + 0.5 - rp.y) - tg.ty * (ex + 0.5 - rp.x) >= 0 ? 1 : -1;
      break;
    }
    comp.forEach((k) => {
      const rp = riverPt.get(k) || pos.get(k);
      const tg = riverTangent(k) || { tx: 1, ty: 0 };
      const off = 0.3;
      pos.set(k, { x: rp.x - tg.ty * off * side, y: rp.y + tg.tx * off * side });
    });
  });

  const roads = dChains.map((c) => {
    const base = c.map((k) => pos.get(k));
    return { pts: sampleSpline(base, 8) };
  });

  // bridges wherever a road crosses a river line
  const bridges = [];
  roads.forEach((rd) => {
    for (let a = 0; a < rd.pts.length - 1; a++) {
      const p = rd.pts[a], q = rd.pts[a + 1];
      rivers.forEach((rv) => {
        for (let b = 0; b < rv.pts.length - 1; b++) {
          const hit = segX(p, q, rv.pts[b], rv.pts[b + 1]);
          if (!hit) continue;
          // skip crossings hidden under a town (the town itself is the crossing)
          if (tileAt(map, Math.floor(hit.x), Math.floor(hit.y))?.poi === 'town') continue;
          if (bridges.some((br) => Math.hypot(br.x - hit.x, br.y - hit.y) < 0.35)) continue;
          bridges.push({
            x: hit.x, y: hit.y,
            angle: Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI,
            span: rv.pts[b].w * 2 + 0.16,
          });
        }
      });
    }
  });

  return { rivers, roads, bridges };
};

// ---------------------------------------------------------------------------------------
// paint

const PAL = {
  grassland: { bank: '#5d6b3a', bankLite: '#8a8a52', water: '#3f7cc2', waterLight: '#5a93d6', ripple: '#8cb6e6', foam: '#bcd8f5', verge: '#5f7d3e', dirt: '#a8865a', dirtDark: '#7d6240', dirtLite: '#c2a477' },
  desert: { bank: '#b8995e', bankLite: '#d9c08a', water: '#3f7cc2', waterLight: '#5a93d6', ripple: '#8cb6e6', foam: '#cfe6f2', verge: '#c9ad74', dirt: '#c9a36a', dirtDark: '#9c7c4c', dirtLite: '#e0c48f' },
  snow: { bank: '#9aa5ab', bankLite: '#d8dee2', water: '#3f7cc2', waterLight: '#5a93d6', ripple: '#8cb6e6', foam: '#e2eef7', verge: '#c9d3d8', dirt: '#a08a6e', dirtDark: '#76664f', dirtLite: '#bcab92' },
};

export const WATERWAY_PALETTES = PAL;

let svgSeq = 0;

// SVG for a stone bridge centred on 0,0 running along +x, `span` long (tile units).
// Light from the top-left like the sprites: a soft shadow down-right, a lit north parapet,
// and, when the road runs east-west, the arched south face of the bridge below the deck.
const bridgeSvg = (b) => {
  const half = b.span / 2 + 0.07;
  const w = 0.1; // half deck width, a little wider than the road
  const p = 0.03; // parapet thickness
  const rad = b.angle * Math.PI / 180;
  const face = 0.09 * Math.abs(Math.cos(rad)); // how much of the south face shows
  const flip = Math.cos(rad) < 0 ? -1 : 1; // keep the face on the screen's south side
  const stone = '#c4b597', stoneDark = '#7d6f55', stoneLite = '#e2d8bf', deck = '#a9916c', line = '#4f4434';
  let g = `<g transform="translate(${r3(b.x)},${r3(b.y)}) rotate(${r3(b.angle)})">`;
  g += `<rect x="${r3(-half + 0.03)}" y="${r3(-w + 0.04)}" width="${r3(2 * half)}" height="${r3(2 * w + 0.06)}" rx="0.04" fill="rgba(15,25,35,0.32)"/>`;
  if (face > 0.01) {
    const fy = flip * w, fd = flip * face;
    g += `<path d="M${r3(-half)},${r3(fy)} L${r3(half)},${r3(fy)} L${r3(half)},${r3(fy + fd)} L${r3(half * 0.62)},${r3(fy + fd)} Q0,${r3(fy - fd * 0.35)} ${r3(-half * 0.62)},${r3(fy + fd)} L${r3(-half)},${r3(fy + fd)} Z" fill="${stoneDark}" stroke="${line}" stroke-width="0.012"/>`;
  }
  g += `<rect x="${r3(-half)}" y="${r3(-w)}" width="${r3(2 * half)}" height="${r3(2 * w)}" fill="${deck}" stroke="${line}" stroke-width="0.014"/>`;
  g += `<rect x="${r3(-half)}" y="${r3(-w)}" width="${r3(2 * half)}" height="${p}" fill="${flip > 0 ? stoneLite : stone}" stroke="${line}" stroke-width="0.01"/>`;
  g += `<rect x="${r3(-half)}" y="${r3(w - p)}" width="${r3(2 * half)}" height="${p}" fill="${flip > 0 ? stone : stoneLite}" stroke="${line}" stroke-width="0.01"/>`;
  [-1, 1].forEach((e) => {
    g += `<rect x="${r3(e * half - 0.035)}" y="${r3(-w - 0.015)}" width="0.07" height="${r3(2 * w + 0.03)}" rx="0.012" fill="${stone}" stroke="${line}" stroke-width="0.012"/>`;
  });
  return `${g}</g>`;
};

// Ripples on a river: short curved streaks scattered across the channel (never one
// line down the middle, which read as a road's centre line), each drifting downstream
// and fading in and out on its own timing, like the ripples on the lakes.
const riverRipples = (r, ri, pal, animate) => {
  const pts = r.pts;
  const shore = r.shoreAt >= 0 ? r.shoreAt : pts.length;
  let out = '';
  // one ripple centred on (cx, cy), lying along (tx, ty), drifting that way by `drift`
  const ripple = (cx, cy, tx, ty, L, peak, drift, h1, h2, h3) => {
    const bow = (h3 > 0.5 ? 1 : -1) * 0.02;
    const x0 = cx - tx * L, y0 = cy - ty * L, x1 = cx + tx * L, y1 = cy + ty * L;
    const qx = cx - ty * bow, qy = cy + tx * bow;
    const d = `M${r3(x0)},${r3(y0)}Q${r3(qx)},${r3(qy)} ${r3(x1)},${r3(y1)}`;
    if (!animate) {
      out += `<path d="${d}" fill="none" stroke="${pal.ripple}" stroke-width="0.032" stroke-linecap="round" opacity="${r3(peak * 0.85)}"/>`;
      return;
    }
    const dur = (2.6 + h2 * 1.6).toFixed(1);
    const begin = (-(h1 * 4)).toFixed(1);
    out += `<path d="${d}" fill="none" stroke="${pal.ripple}" stroke-width="0.032" stroke-linecap="round" opacity="0">`
      + `<animateTransform attributeName="transform" type="translate" values="0 0;${r3(tx * drift)} ${r3(ty * drift)}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`
      + `<animate attributeName="opacity" values="0;${r3(peak)};${r3(peak)};0" keyTimes="0;0.3;0.7;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></path>`;
  };
  let next = 0.1 + hash(ri, 3, 11) * 0.2;
  let run = 0;
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (!seg) continue;
    // past the waterline the ripples carry on but fade with the channel
    const past = i > shore ? (i - shore) / Math.max(1, pts.length - 1 - shore) : 0;
    while (run + seg >= next) {
      const f = (next - run) / seg;
      const tx = (b.x - a.x) / seg, ty = (b.y - a.y) / seg;
      const w = a.w + (b.w - a.w) * f;
      const h1 = hash(ri, n, 1), h2 = hash(ri, n, 2), h3 = hash(ri, n, 3);
      const off = (h1 * 2 - 1) * w * 0.55;
      const cx = a.x + (b.x - a.x) * f - ty * off, cy = a.y + (b.y - a.y) * f + tx * off;
      ripple(cx, cy, tx, ty, 0.09 + h2 * 0.08, 0.95 * (1 - past * 0.5), 0.16 + h3 * 0.08, h1, h2, h3);
      n++;
      next += 0.16 + hash(ri, n, 4) * 0.16;
    }
    run += seg;
  }
  // at a mouth the current fans out into the lake or sea: a few ripples spreading
  // outward from the river's end and fading as they go
  if (r.shoreAt >= 0 && pts.length >= 2) {
    const e = pts[pts.length - 1], p = pts[pts.length - 2];
    const base = Math.atan2(e.y - p.y, e.x - p.x);
    for (let k = 0; k < 7; k++) {
      const h1 = hash(ri, 900 + k, 1), h2 = hash(ri, 900 + k, 2), h3 = hash(ri, 900 + k, 3);
      const dist = 0.04 + (k / 6) * 0.38;
      const ang = base + (h1 * 2 - 1) * (0.35 + dist * 1.4);
      const tx = Math.cos(ang), ty = Math.sin(ang);
      ripple(e.x + tx * dist, e.y + ty * dist, tx, ty, 0.07 + h2 * 0.06, 0.75 * (1 - dist / 0.5), 0.14 + h3 * 0.08, h1, h2, h3);
    }
  }
  return out;
};

/**
 * The whole layer as SVG markup (viewBox in tile units). `animate` adds slow flowing
 * ripples on the rivers.
 */
export const waterwaysSvg = (map, { theme = 'grassland', animate = true } = {}) => {
  const pal = PAL[theme] || PAL.grassland;
  const { rivers, roads, bridges } = waterwaysLayout(map);
  const seq = ++svgSeq; // gradient ids stay unique when several maps share a page
  let s = '';
  // banks under everything, then water, so joining rivers merge cleanly
  const banked = (r) => (r.shoreAt < 0 ? r.pts : r.pts.slice(0, r.shoreAt + 1));
  rivers.forEach((r) => { s += `<path d="${ribbonD(banked(r), 0.045)}" fill="${pal.bank}" opacity="0.75"/>`; });
  rivers.forEach((r) => { s += `<path d="${ribbonD(banked(r), 0.022)}" fill="${pal.bankLite}" opacity="0.55"/>`; });
  rivers.forEach((r, i) => {
    if (r.shoreAt < 0) { s += `<path d="${ribbonD(r.pts)}" fill="${pal.water}"/>`; return; }
    // past the waterline the channel fades out over the open water, so the river mouth
    // has no visible edge against the lake or sea and its ripples
    const a = r.pts[r.shoreAt], b = r.pts[r.pts.length - 1];
    s += `<linearGradient id="ww${seq}-mouth-${i}" gradientUnits="userSpaceOnUse" x1="${r3(a.x)}" y1="${r3(a.y)}" x2="${r3(b.x)}" y2="${r3(b.y)}">`
      + `<stop offset="0" stop-color="${pal.water}" stop-opacity="1"/><stop offset="1" stop-color="${pal.water}" stop-opacity="0"/></linearGradient>`;
    s += `<path d="${ribbonD(r.pts.slice(0, r.shoreAt + 1))}" fill="${pal.water}"/>`;
    s += `<path d="${ribbonD(r.pts.slice(r.shoreAt))}" fill="url(#ww${seq}-mouth-${i})"/>`;
  });
  rivers.forEach((r, ri) => { s += riverRipples(r, ri, pal, animate); });
  // roads: verge, edge, dirt
  roads.forEach((r) => { s += `<path d="${polyD(r.pts)}" fill="none" stroke="${pal.verge}" stroke-width="0.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`; });
  roads.forEach((r) => { s += `<path d="${polyD(r.pts)}" fill="none" stroke="${pal.dirtDark}" stroke-width="0.13" stroke-linecap="round" stroke-linejoin="round"/>`; });
  roads.forEach((r) => { s += `<path d="${polyD(r.pts)}" fill="none" stroke="${pal.dirt}" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round"/>`; });
  bridges.forEach((b) => { s += bridgeSvg(b); });
  return s;
};
