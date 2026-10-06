// Town3QView.js
// The "3/4 top-down" town renderer: generateTownMap() output drawn with upright, lit
// building sprites (townSprites3q.js) that stand on their tile and overlap the row
// above, walls with height, swaying trees, wandering townsfolk drawn from the town's
// roster, drifting cloud shadows and a warm colour grade.
//
// A pure view over the saved map: it reads tile fields only and never writes to the map,
// so every existing save renders with it. Used by the live TownMapDisplay (under its
// click grid, passed as `children`) and by the /debug/town-3q prototype page.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tileBackground, waterwayMask, jettyInfo, OFF_MAP, POI_EMOJI } from '../utils/townTileArt';
import { SPRITE_W, snowLane3q, bridgeSprite3q, jettySprite3q, squareFaceSprite3q, squareParapetSprite3q, buildingSprite3q, buildingSmoke3q, poiSprite3q, wallSprite3q, gateSprite3q, fieldTile3q, scarecrowSprite3q, FIELD_CROPS } from '../utils/townSprites3q';
import { townsfolkStrip, NPC_LOOK_COUNT, NPC_SKIN_COUNT, lookForResident, FIG_W, FIG_H } from '../utils/townsfolkSprites';
import { buildStreetGraph, createTownsfolk, stepTownsfolk } from '../game/ambientTownsfolk';

const STEP_MS = 950; // one tile per tick: an unhurried walk
const STRIDE_S = 0.62; // one walk cycle (matches townsfolkSprites)

// Headroom above the map for the top row's tall sprites, in tiles.
export const TOWN3Q_HEADROOM = 1.5;

export const TOWN3Q_KEYFRAMES = `@keyframes town3qDrift { from { transform: translateX(0); } to { transform: translateX(330%); } }
  @keyframes town3qWalk { from { transform: translateX(0); } to { transform: translateX(-100%); } }
  @keyframes town3qSway { from { transform: rotate(-1.2deg); } to { transform: rotate(1.4deg); } }
  @keyframes town3qSmoke {
    0% { transform: translate(0, 0) scale(0.9); opacity: 0; }
    30% { opacity: 0.55; }
    100% { transform: translate(150%, -500%) scale(2.2); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .town3q-view * { animation: none !important; } }`;

// A townsperson's figure: a static strip of poses stepped through by a CSS animation
// (transform only, so the compositor runs it without repainting).
export const Figure = ({ look, skin, dir, moving, theme }) => {
  const strip = townsfolkStrip(look, skin, moving ? dir : (dir === 'n' ? 's' : dir), moving, theme);
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', transform: dir === 'w' ? 'scaleX(-1)' : 'none' }}>
      <div style={{
        width: `${strip.frames * 100}%`, height: '100%', backgroundImage: strip.url, backgroundSize: '100% 100%',
        animation: strip.frames > 1 ? `town3qWalk ${STRIDE_S}s steps(${strip.frames}) infinite` : 'none',
      }} />
    </div>
  );
};

export const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// A stable seed for a town that has none stored (saved maps carry no seed): its name.
export const seedForTown = (town) => {
  const s = `${town?.townName || ''}|${town?.width || 0}x${town?.height || 0}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The ground under a sprite: buildings and walls stand on plain ground in the 3/4 view;
// bridges and jetties stand over water.
const groundTypeFor = (tile) => {
  if (tile.type === 'building' || tile.type === 'wall' || tile.type === 'keep_wall') {
    return { ...tile, type: 'grass', poi: null };
  }
  if (tile.type === 'bridge') return { ...tile, type: 'water' };
  return tile;
};

// How a crossing (non-jetty bridge tile) is drawn: walk axis, and which sides meet land.
const PATHISH = new Set(['bridge', 'dirt_path', 'stone_path', 'town_square']);
const bridgeShape = (nb) => {
  const wat = (t) => !t || t === 'water';
  const ew = PATHISH.has(nb.e) || PATHISH.has(nb.w), ns = PATHISH.has(nb.n) || PATHISH.has(nb.s);
  const axis = ew && !ns ? 'ew' : ns && !ew ? 'ns' : (wat(nb.n) || wat(nb.s) ? 'ew' : 'ns');
  const land = (t) => !!t && t !== 'bridge' && t !== 'water';
  return { axis, ends: axis === 'ew' ? { e: land(nb.e), w: land(nb.w) } : { n: land(nb.n), s: land(nb.s), sw: nb.s === 'water' } };
};

/**
 * @param {Object} town - generateTownMap() output (mapData, width, height, theme)
 * @param {string} theme - ground/building theme ('grassland' | 'desert' | 'snow')
 * @param {number} tile - tile size in px
 * @param {Array} roster - the town's residents (townMapData.npcs); walkers are drawn from it
 * @param {number} npcCount - how many walkers
 * @param {number} seed - seeds field crops and the walk
 * @param {boolean} interactiveFolk - clicking a walker shows their name card
 * @param {ReactNode} children - drawn over the map, in map coordinates (tile 0,0 at 0,0)
 */
const Town3QView = ({ town, theme = 'grassland', tile: T, roster = [], npcCount = 14, seed = 0, clouds = true, grade = true, interactiveFolk = true, children }) => {
  const grid = town.mapData;
  const W = town.width, H = town.height;
  const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] : null);
  const wetAt = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] || null : OFF_MAP);
  const neighbours = (x, y) => ({ n: at(x, y - 1)?.type, e: at(x + 1, y)?.type, s: at(x, y + 1)?.type, w: at(x - 1, y)?.type });
  const wetMask = (t, x, y) => waterwayMask(t, { n: wetAt(x, y - 1), e: wetAt(x + 1, y), s: wetAt(x, y + 1), w: wetAt(x - 1, y) });

  // Field patches: connected farm_field tiles share one crop and one edge style; larger
  // patches get a scarecrow on one tile.
  const fields = useMemo(() => {
    const info = new Map();
    const scarecrows = [];
    const r = rngFrom(seed ^ 0x51f1e1d);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x].type !== 'farm_field' || info.has(`${x},${y}`)) continue;
        const crop = FIELD_CROPS[Math.floor(r() * FIELD_CROPS.length)];
        const edge = r() < 0.6 ? 'hedge' : 'wattle';
        const patch = [];
        const stack = [[x, y]];
        info.set(`${x},${y}`, { crop, edge });
        while (stack.length) {
          const [cx, cy] = stack.pop();
          patch.push([cx, cy]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (at(nx, ny)?.type === 'farm_field' && !info.has(`${nx},${ny}`)) { info.set(`${nx},${ny}`, { crop, edge }); stack.push([nx, ny]); }
          }
        }
        if (patch.length >= 4 && crop !== 'fallow') scarecrows.push(patch[Math.floor(r() * patch.length)]);
      }
    }
    return { info, scarecrows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [town, seed]);
  const fieldBg = (t) => {
    const f = fields.info.get(`${t.x},${t.y}`);
    const isF = (n) => n?.type === 'farm_field';
    const mask = (isF(at(t.x, t.y - 1)) ? 1 : 0) | (isF(at(t.x + 1, t.y)) ? 2 : 0) | (isF(at(t.x, t.y + 1)) ? 4 : 0) | (isF(at(t.x - 1, t.y)) ? 8 : 0);
    return fieldTile3q(f?.crop, mask, t.x, t.y, theme, f?.edge);
  };

  // Which tiles lie outside each enclosure, by flood fill from the map edge: past the
  // town walls (gates count as wall), and past the keep's walls. A wall's visible south
  // face looks outward when the tile below it is outside; only those faces get slits.
  const outside = useMemo(() => {
    const fill = (blocks) => {
      const seen = new Set();
      const stack = [];
      for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
      for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
      while (stack.length) {
        const [x, y] = stack.pop();
        const k = `${x},${y}`;
        const t = at(x, y);
        if (!t || seen.has(k) || blocks(t)) continue;
        seen.add(k);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return seen;
    };
    return {
      town: fill((t) => t.type === 'wall' || t.isGate),
      keep: fill((t) => t.type === 'keep_wall'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [town]);
  const facesOut = (x, y, keep) => y + 1 >= H || (keep ? outside.keep : outside.town).has(`${x},${y + 1}`);

  // Static sprite list (buildings, walls, decorations), y-sorted via zIndex.
  const sprites = useMemo(() => {
    const out = [];
    for (const [x, y] of fields.scarecrows) out.push({ k: `s${x},${y}`, x, y, bg: scarecrowSprite3q(), sway: 4.2 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = grid[y][x];
        // a town square built over the river: parapets where it meets water, and its
        // arched front face on the water tile just south of it
        if (t.type === 'town_square') {
          const wet = (tx, ty) => at(tx, ty)?.type === 'water';
          const sq = (tx, ty) => at(tx, ty)?.type === 'town_square';
          const side = (wx, wy, ax, ay, bx, by) => (wet(x + wx, y + wy)
            ? 1 | (sq(x + ax, y + ay) && wet(x + ax + wx, y + ay + wy) ? 0 : 2) | (sq(x + bx, y + by) && wet(x + bx + wx, y + by + wy) ? 0 : 4)
            : 0);
          const sides = { n: side(0, -1, -1, 0, 1, 0), s: side(0, 1, -1, 0, 1, 0), w: side(-1, 0, 0, 1, 0, -1), e: side(1, 0, 0, 1, 0, -1) };
          if (sides.n || sides.e || sides.s || sides.w) out.push({ k: `q${x},${y}`, x, y, bg: squareParapetSprite3q(sides) });
        } else if (t.type === 'water' && at(x, y - 1)?.type === 'town_square') {
          out.push({ k: `qf${x},${y}`, x, y, bg: squareFaceSprite3q(x, y) });
        }
        if (t.type === 'building') out.push({ k: `b${x},${y}`, x, y, bg: buildingSprite3q(t.buildingType, x, y, theme), smoke: buildingSmoke3q(t.buildingType, x, y, theme) });
        else if (t.type === 'keep_wall' && at(x, y - 1)?.buildingType === 'keep' && at(x - 1, y)?.type === 'keep_wall' && at(x + 1, y)?.type === 'keep_wall') {
          // the keep's front wall carries its gate (view only; the tile stays a wall)
          out.push({ k: `g${x},${y}`, x, y, bg: gateSprite3q('x', true, facesOut(x, y, true)) });
        } else if (t.isGate) {
          const nb = neighbours(x, y);
          const isWall = (v) => v === 'wall';
          if (isWall(nb.w) || isWall(nb.e)) out.push({ k: `g${x},${y}`, x, y, bg: gateSprite3q('x', false, facesOut(x, y, false)) });
          else if (isWall(nb.n) || isWall(nb.s)) out.push({ k: `g${x},${y}`, x, y, bg: gateSprite3q('y', false, facesOut(x, y, false)) });
        } else if (t.type === 'wall' || t.type === 'keep_wall') {
          // gate tiles count as wall so runs reach the gatehouse; a wall beside a gate
          // becomes a flanking tower
          const nbs = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
          const joins = (n) => n && (n.type === 'wall' || n.type === 'keep_wall' || n.isGate);
          const mask = nbs.reduce((m, n, i) => m | (joins(n) ? 1 << i : 0), 0);
          const flank = nbs.some((n) => n?.isGate);
          const keep = t.type === 'keep_wall';
          out.push({ k: `w${x},${y}`, x, y, bg: wallSprite3q(mask, keep, x, y, flank, facesOut(x, y, keep)) });
        } else if (t.type === 'bridge') {
          const nb = neighbours(x, y);
          const jetty = jettyInfo(t, nb);
          // a bridge at the map edge is a road leaving town, not a jetty
          const toWater = jetty && { n: [x, y - 1], e: [x + 1, y], s: [x, y + 1], w: [x - 1, y] }[jetty.waterEnd];
          if (jetty && at(toWater[0], toWater[1])) out.push({ k: `j${x},${y}`, x, y, bg: jettySprite3q(jetty.waterEnd, x, y) });
          else { const b = bridgeShape(nb); out.push({ k: `br${x},${y}`, x, y, bg: bridgeSprite3q(b.axis, b.ends, x, y) }); }
        } else if (t.poi) {
          const bg = poiSprite3q(t.poi, x, y, theme);
          const sway = bg && (t.poi === 'tree' || t.poi === 'pine' || t.poi === 'cactus') ? 4 + ((x * 7 + y * 13) % 30) / 10 : 0;
          out.push(bg ? { k: `p${x},${y}`, x, y, bg, sway } : { k: `e${x},${y}`, x, y, emoji: POI_EMOJI[t.poi] || null });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [town, theme, fields, outside]);

  // Townsfolk: a fixed-rate tick moves each person at most one tile. The glide between
  // tiles is a Web Animation on the figure's transform, run by the compositor (no
  // per-frame script), and each one is pinned to the tick's scheduled time, so a late
  // timer never makes a walker pause and restart. Ticks are skipped while the tab is
  // hidden; on return the walk resumes from where it was instead of catching up.
  const graph = useMemo(() => buildStreetGraph(grid), [grid]);
  const randRef = useRef(rngFrom(seed));
  const [folk, setFolk] = useState([]);
  const folkRef = useRef([]);
  const elsRef = useRef(new Map()); // id -> element
  const animsRef = useRef(new Map()); // id -> running glide
  const [selected, setSelected] = useState(null); // id of the clicked townsperson
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  const tileRef = useRef(T);
  tileRef.current = T;
  const figW = (t) => t * 0.46;
  const figH = (t) => (figW(t) * (FIG_H + 1)) / FIG_W;
  // Screen position (as a transform) of a townsperson standing on their tile.
  const placeOf = (n) => {
    const t = tileRef.current;
    const px = (n.x + 0.5 + n.ox) * t - figW(t) / 2;
    const py = (n.y + 0.8 + n.oy) * t - figH(t) * (31.5 / (FIG_H + 1)); // feet on the tile
    return `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  };
  useEffect(() => {
    randRef.current = rngFrom(seed ^ 0xabcdef);
    // Walkers are drawn from the town's roster (the same residents the building modals
    // list): a seeded sample, each dressed for their role and heading between the
    // doorsteps nearest their workplace and home.
    const r = randRef.current;
    const pool = roster.map((npc, i) => ({ npc, i, k: r() })).sort((a, b) => a.k - b.k).slice(0, npcCount);
    const doorNear = (p) => {
      if (!p || !graph.doors.length) return null;
      let best = null, bd = Infinity;
      for (const d of graph.doors) { const dd = Math.abs(d.x - p.x) + Math.abs(d.y - p.y); if (dd < bd) { bd = dd; best = d; } }
      return best;
    };
    const people = pool.map(({ npc, i }) => ({
      ref: i,
      look: lookForResident(npc, i),
      anchors: [doorNear(npc.location), doorNear(npc.location?.homeCoords)],
    }));
    const start = createTownsfolk(graph, npcCount, r, NPC_LOOK_COUNT, NPC_SKIN_COUNT, people);
    folkRef.current = start;
    animsRef.current.forEach((a) => a.cancel());
    animsRef.current.clear();
    for (const n of start) { const el = elsRef.current.get(n.id); if (el) el.style.transform = placeOf(n); }
    setFolk(start);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, npcCount, seed, roster]);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const advance = (startAt) => {
      const cur = folkRef.current;
      const sel = selectedRef.current;
      // the selected townsperson stands still (facing the viewer) while their card is open
      const next = stepTownsfolk(cur, graph, randRef.current).map((n, i) => (n.id === sel ? { ...cur[i], moving: false, dir: 's' } : n));
      next.forEach((n, i) => {
        const el = elsRef.current.get(n.id);
        if (!el) return;
        const from = placeOf(cur[i]), to = placeOf(n);
        if (from === to) return;
        animsRef.current.get(n.id)?.cancel();
        el.style.transform = to;
        const glide = el.animate([{ transform: from }, { transform: to }], { duration: STEP_MS, easing: 'linear' });
        glide.startTime = startAt;
        animsRef.current.set(n.id, glide);
      });
      folkRef.current = next;
      setFolk(next);
    };
    let due = performance.now() + STEP_MS;
    let timer = 0;
    const run = () => {
      const now = performance.now();
      if (document.hidden) { due = now + STEP_MS; timer = setTimeout(run, STEP_MS); return; }
      if (now - due > STEP_MS) due = now; // resumed after a stall: don't fast-forward
      advance(due);
      due += STEP_MS;
      timer = setTimeout(run, Math.max(0, due - performance.now()));
    };
    timer = setTimeout(run, STEP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);
  // a zoom change re-places everyone at once
  useEffect(() => {
    for (const n of folkRef.current) {
      const el = elsRef.current.get(n.id);
      if (!el) continue;
      animsRef.current.get(n.id)?.cancel();
      el.style.transform = placeOf(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T]);

  // Name card data comes straight from the roster entry the walker represents.
  const identity = (n) => {
    const npc = roster[n.ref];
    return npc ? { name: npc.name, title: npc.title || npc.role, job: npc.job } : { name: 'Townsperson', title: '' };
  };

  const pad = Math.round(T * TOWN3Q_HEADROOM);

  // Ground, buildings, walls and trees never change while townsfolk walk, so they are
  // built once per town/zoom rather than on every walk tick.
  const staticLayer = useMemo(() => (
    <>
      {/* ground */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${W}, ${T}px)`, gridAutoRows: `${T}px`, filter: grade ? 'saturate(0.8) brightness(0.95) contrast(1.04)' : 'none' }}>
        {grid.flat().map((t) => {
          const g = groundTypeFor(t);
          const bg = t.type === 'farm_field' ? fieldBg(t)
            : theme === 'snow' && t.type === 'dirt_path' && !wetMask(g, t.x, t.y) ? snowLane3q(t.x, t.y)
            : tileBackground(g, neighbours(t.x, t.y), t.x, t.y, theme, wetMask(g, t.x, t.y));
          // 1px oversize so a scaled-down map (the docked stage) shows no seams between tiles
          return <div key={`g${t.x},${t.y}`} style={{ width: T + 1, height: T + 1, backgroundImage: bg, backgroundSize: '100% 100%' }} />;
        })}
      </div>
      {/* sprites: 1.5 x 2.5 tiles, tile occupies the bottom-centre 1 x 1. Trees sway by a
          CSS rotation about the trunk foot (compositor-only). */}
      {sprites.map((s) => (
        <div key={s.k} style={{
          position: 'absolute', left: (s.x - 0.25) * T, top: (s.y - 1.5) * T, width: T * 1.5, height: T * 2.5,
          zIndex: s.y * 10 + 2, pointerEvents: 'none',
          backgroundImage: s.bg || 'none', backgroundSize: '100% 100%',
          filter: grade ? 'saturate(0.92)' : 'none',
          transformOrigin: '50% 92%',
          animation: s.sway ? `town3qSway ${s.sway}s ease-in-out ${-s.sway * 0.37}s infinite alternate` : 'none',
          display: s.emoji ? 'flex' : 'block', alignItems: 'flex-end', justifyContent: 'center', fontSize: T * 0.6, paddingBottom: s.emoji ? T * 0.15 : 0,
        }}>{s.emoji}</div>
      ))}
      {/* chimney smoke: small CSS puffs over each lit chimney */}
      {sprites.filter((s) => s.smoke && s.smoke.length).flatMap((s) => s.smoke.map((e, j) => {
        const k = (T * 1.5) / SPRITE_W, d = 3.2 * k;
        return [0, 1, 2].map((i) => (
          <div key={`${s.k}m${j}${i}`} style={{
            position: 'absolute', left: (s.x - 0.25) * T + e.x * k - d / 2, top: (s.y - 1.5) * T + e.y * k - d / 2, width: d, height: d,
            borderRadius: '50%', background: e.dark ? '#55504a' : '#d9d6d0', opacity: 0, zIndex: s.y * 10 + 3, pointerEvents: 'none',
            animation: `town3qSmoke 3.9s linear ${-(e.delay + i * 1.3)}s infinite`,
          }} />
        ));
      }))}
    </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [town, theme, T, grade, sprites, fields]);

  return (
    <div className="town3q-view" onClick={() => setSelected(null)} style={{ position: 'relative', width: W * T, height: H * T + pad, overflow: 'hidden', borderRadius: 4, background: 'transparent' }}>
      <style>{TOWN3Q_KEYFRAMES}</style>
      <div style={{ position: 'absolute', left: 0, top: pad, width: W * T, height: H * T }}>
        {staticLayer}
        {/* townsfolk (positioned by the walk loop, not by React) */}
        {folk.map((n) => (
          <div key={`n${n.id}`} title={!interactiveFolk || n.inside ? undefined : identity(n).name}
            ref={(el) => {
              if (el) { elsRef.current.set(n.id, el); if (!el.style.transform) el.style.transform = placeOf(n); } else elsRef.current.delete(n.id);
            }}
            onClick={interactiveFolk ? (e) => { e.stopPropagation(); if (!n.inside) setSelected(n.id === selected ? null : n.id); } : undefined}
            style={{
              position: 'absolute', left: 0, top: 0, width: figW(T), height: figH(T), zIndex: n.id === selected ? 99990 : n.y * 10 + 5,
              pointerEvents: interactiveFolk && !n.inside ? 'auto' : 'none', cursor: 'pointer', willChange: 'transform',
              transition: 'opacity 400ms', opacity: n.inside ? 0 : 1,
            }}>
            {n.id === selected && (
              <div style={{ position: 'absolute', left: '-15%', width: '130%', bottom: figH(T) * 0.02, height: figH(T) * 0.14, borderRadius: '50%', border: '2px solid #f2c46a', boxShadow: '0 0 6px rgba(242,196,106,0.8)' }} />
            )}
            <Figure look={n.look} skin={n.skin} dir={n.dir} moving={n.moving} theme={theme} />
          </div>
        ))}
        {/* atmosphere */}
        {clouds && (
          <div className="town3q-clouds" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100000, overflow: 'hidden' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                position: 'absolute', top: `${15 + i * 28}%`, left: '-40%', width: '45%', height: '38%', borderRadius: '50%',
                background: 'radial-gradient(closest-side, rgba(10,14,24,0.22), rgba(10,14,24,0))',
                animation: `town3qDrift ${70 + i * 25}s linear ${-i * 23}s infinite`, willChange: 'transform',
              }} />
            ))}
          </div>
        )}
        {grade && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100001,
            background: 'linear-gradient(160deg, rgba(255,214,150,0.10), rgba(255,214,150,0) 45%, rgba(30,40,70,0.16))',
            boxShadow: 'inset 0 0 90px rgba(8,8,14,0.55)',
          }} />
        )}
        {/* caller overlay (click grid, markers), above everything */}
        {children && <div style={{ position: 'absolute', inset: 0, zIndex: 100002 }}>{children}</div>}
      </div>
      {/* name card for the selected townsperson */}
      {(() => {
        const n = folk.find((f) => f.id === selected);
        if (!n) return null;
        const id = identity(n);
        const cx = (n.x + 0.5 + n.ox) * T, top = pad + (n.y + n.oy) * T - T * 0.95;
        return (
          <div onClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', left: Math.min(Math.max(cx - 90, 4), W * T - 184), top: Math.max(top - 78, 4), width: 180, zIndex: 100005,
            background: 'rgba(24,20,16,0.94)', border: '1px solid #8a6a3a', borderRadius: 6, padding: '8px 10px', color: '#efe3c8',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)', fontSize: 12,
          }}>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close"
              style={{ all: 'unset', position: 'absolute', right: 8, top: 4, color: '#bba', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#f2c46a' }}>{id.name}</div>
            <div style={{ opacity: 0.8, marginBottom: id.job ? 2 : 6 }}>{id.title}</div>
            {id.job && <div style={{ opacity: 0.65, fontSize: 11, marginBottom: 6 }}>{id.job}</div>}
            <button type="button" disabled title="Speech comes later"
              style={{ width: '100%', padding: '3px 0', borderRadius: 4, border: '1px solid #6a5636', background: '#3a3024', color: '#9a8f7a', cursor: 'not-allowed' }}>
              Talk (coming soon)
            </button>
          </div>
        );
      })()}
    </div>
  );
};

export default Town3QView;
