// Town3QTest.js  (/debug/town-3q)
// PROTOTYPE of a "3/4 top-down" town: the same generateTownMap() output as the live
// game, rendered with upright, lit building sprites (townSprites3q.js) that stand on
// their tile and overlap the row above, walls with height, swaying trees, wandering
// townsfolk (ambientTownsfolk.js), drifting cloud shadows and a warm colour grade.
// A toggle shows the current flat art for the same seed, for side-by-side judgement.
// Nothing here touches the live TownMapDisplay.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import { tileBackground, waterwayMask, OFF_MAP, POI_EMOJI } from '../utils/townTileArt';
import { SPRITE_W, buildingSprite3q, buildingSmoke3q, poiSprite3q, wallSprite3q, gateSprite3q, fieldTile3q, scarecrowSprite3q, FIELD_CROPS, BUILDING_TYPES_3Q } from '../utils/townSprites3q';
import { townsfolkStrip, NPC_LOOK_COUNT, NPC_SKIN_COUNT, TOWNSFOLK_ROLES, lookForRole, lookForResident, FIG_W, FIG_H } from '../utils/townsfolkSprites';
import { buildStreetGraph, createTownsfolk, stepTownsfolk } from '../game/ambientTownsfolk';
import { populateTown } from '../utils/npcGenerator';

const SIZES = ['hamlet', 'village', 'town', 'city'];
const THEMES = ['grassland', 'desert', 'snow'];
const STEP_MS = 950; // one tile per tick: an unhurried walk
const STRIDE_S = 0.62; // one walk cycle (matches townsfolkSprites)

// A townsperson's figure: a static strip of poses stepped through by a CSS animation
// (transform only, so the compositor runs it without repainting).
const Figure = ({ look, skin, dir, moving }) => {
  const strip = townsfolkStrip(look, skin, moving ? dir : (dir === 'n' ? 's' : dir), moving);
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', transform: dir === 'w' ? 'scaleX(-1)' : 'none' }}>
      <div style={{
        width: `${strip.frames * 100}%`, height: '100%', backgroundImage: strip.url, backgroundSize: '100% 100%',
        animation: strip.frames > 1 ? `town3qWalk ${STRIDE_S}s steps(${strip.frames}) infinite` : 'none',
      }} />
    </div>
  );
};

const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The ground under a sprite: buildings and walls stand on plain ground in the 3/4 view.
const groundTypeFor = (tile, theme) => {
  if (tile.type === 'building' || tile.type === 'wall' || tile.type === 'keep_wall') {
    return { ...tile, type: 'grass', poi: null };
  }
  return tile;
};

const Btn = ({ on, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    style={{
      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border, #444)', cursor: 'pointer',
      background: on ? 'var(--accent, #e0b04a)' : 'transparent', color: on ? '#1b1a1f' : 'inherit', fontWeight: 600,
    }}
  >
    {children}
  </button>
);

const Town3QTest = () => {
  const [size, setSize] = useState('town');
  const [theme, setTheme] = useState('grassland');
  const [seed, setSeed] = useState(12345);
  const [tile, setTile] = useState(40);
  const [mode, setMode] = useState('3q'); // '3q' | 'flat' | 'both'
  const [npcCount, setNpcCount] = useState(14);
  const [clouds, setClouds] = useState(true);
  const [grade, setGrade] = useState(true);
  const [allGates, setAllGates] = useState(false);

  const town = useMemo(() => generateTownMap(size, `Demo ${size}`, allGates ? ['south', 'north', 'east', 'west'] : 'south', seed, false, 'NORTH_SOUTH', theme), [size, seed, theme, allGates]);
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
        } else if (t.poi) {
          const bg = poiSprite3q(t.poi, x, y);
          const sway = bg && (t.poi === 'tree' || t.poi === 'pine') ? 4 + ((x * 7 + y * 13) % 30) / 10 : 0;
          out.push(bg ? { k: `p${x},${y}`, x, y, bg, sway } : { k: `e${x},${y}`, x, y, emoji: POI_EMOJI[t.poi] || null });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [town, theme, fields, outside]);

  // Townsfolk: a fixed-rate tick moves each person at most one tile; CSS transitions glide.
  const graph = useMemo(() => buildStreetGraph(grid), [grid]);
  const roster = useMemo(() => populateTown(town, seed), [town, seed]);
  const randRef = useRef(rngFrom(seed));
  // Each tick moves a person at most one tile. The glide between tiles is a Web
  // Animation on the figure's transform, run by the compositor (no per-frame script),
  // and each one is pinned to the tick's scheduled time, so a late timer never makes a
  // walker pause and restart. Ticks are skipped while the tab is hidden; on return the
  // walk resumes from where it was instead of catching up.
  const [folk, setFolk] = useState([]);
  const folkRef = useRef([]);
  const elsRef = useRef(new Map()); // id -> element
  const animsRef = useRef(new Map()); // id -> running glide
  const [selected, setSelected] = useState(null); // id of the clicked townsperson
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  const tileRef = useRef(tile);
  tileRef.current = tile;
  const figW = (T) => T * 0.46;
  const figH = (T) => (figW(T) * (FIG_H + 1)) / FIG_W;
  // Screen position (as a transform) of a townsperson standing on their tile.
  const placeOf = (n) => {
    const T = tileRef.current;
    const px = (n.x + 0.5 + n.ox) * T - figW(T) / 2;
    const py = (n.y + 0.8 + n.oy) * T - figH(T) * (31.5 / (FIG_H + 1)); // feet on the tile
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
  }, [tile]);

  // Name card data comes straight from the roster entry the walker represents.
  const identity = (n) => {
    const npc = roster[n.ref];
    return npc ? { name: npc.name, title: npc.title || npc.role, job: npc.job } : { name: 'Townsperson', title: '' };
  };

  const T = tile;
  const pad = Math.round(T * 1.5); // headroom for the top row's tall sprites (sky above the map)

  const flatGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${W}, ${T}px)`, width: W * T, border: '2px solid #1b1a1f' }}>
      {grid.flat().map((t) => (
        <div key={`f${t.x},${t.y}`} style={{
          width: T, height: T, backgroundImage: tileBackground(t, neighbours(t.x, t.y), t.x, t.y, theme, wetMask(t, t.x, t.y)),
          backgroundSize: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T * 0.55,
        }}>
          {t.poi ? POI_EMOJI[t.poi] : null}
        </div>
      ))}
    </div>
  );

  // Ground, buildings, walls and trees never change while townsfolk walk, so they are
  // built once per town/zoom rather than on every walk tick.
  const staticLayer = useMemo(() => (
    <>
      {/* ground */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${W}, ${T}px)`, filter: grade ? 'saturate(0.8) brightness(0.95) contrast(1.04)' : 'none' }}>
        {grid.flat().map((t) => {
          const g = groundTypeFor(t, theme);
          const bg = t.type === 'farm_field' ? fieldBg(t) : tileBackground(g, neighbours(t.x, t.y), t.x, t.y, theme, wetMask(g, t.x, t.y));
          return <div key={`g${t.x},${t.y}`} style={{ width: T, height: T, backgroundImage: bg, backgroundSize: '100% 100%' }} />;
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

  const view3q = (
    <div className="town3q-view" onClick={() => setSelected(null)} style={{ position: 'relative', width: W * T, height: H * T + pad, paddingTop: 0, overflow: 'hidden', borderRadius: 4, background: 'transparent' }}>
      <div style={{ position: 'absolute', left: 0, top: pad, width: W * T, height: H * T }}>
        {staticLayer}
        {/* townsfolk (positioned by the walk loop, not by React) */}
        {folk.map((n) => (
          <div key={`n${n.id}`} title={n.inside ? undefined : identity(n).name}
            ref={(el) => {
              if (el) { elsRef.current.set(n.id, el); if (!el.style.transform) el.style.transform = placeOf(n); } else elsRef.current.delete(n.id);
            }}
            onClick={(e) => { e.stopPropagation(); if (!n.inside) setSelected(n.id === selected ? null : n.id); }}
            style={{
              position: 'absolute', left: 0, top: 0, width: figW(T), height: figH(T), zIndex: n.id === selected ? 99990 : n.y * 10 + 5,
              pointerEvents: n.inside ? 'none' : 'auto', cursor: 'pointer', willChange: 'transform',
              transition: 'opacity 400ms', opacity: n.inside ? 0 : 1,
            }}>
            {n.id === selected && (
              <div style={{ position: 'absolute', left: '-15%', width: '130%', bottom: figH(T) * 0.02, height: figH(T) * 0.14, borderRadius: '50%', border: '2px solid #f2c46a', boxShadow: '0 0 6px rgba(242,196,106,0.8)' }} />
            )}
            <Figure look={n.look} skin={n.skin} dir={n.dir} moving={n.moving} />
          </div>
        ))}
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
      {/* atmosphere */}
      {clouds && (
        <div className="town3q-clouds" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: pad, pointerEvents: 'none', zIndex: 100000, overflow: 'hidden' }}>
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
          position: 'absolute', left: 0, right: 0, bottom: 0, top: pad, pointerEvents: 'none', zIndex: 100001,
          background: 'linear-gradient(160deg, rgba(255,214,150,0.10), rgba(255,214,150,0) 45%, rgba(30,40,70,0.16))',
          boxShadow: 'inset 0 0 90px rgba(8,8,14,0.55)',
          mixBlendMode: 'normal',
        }} />
      )}
    </div>
  );

  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };
  const gallery = useMemo(() => (
    <>
        <section style={{ marginTop: 24 }}>
          <h3 style={heading}>Every building type ({theme})</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {BUILDING_TYPES_3Q.map((b) => (
              <div key={b} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ width: 90, height: 150, backgroundImage: `${buildingSprite3q(b, 3, 7, theme)}, ${tileBackground({ type: 'grass' }, {}, 1, 1, theme)}`, backgroundSize: '100% 100%, 60px 60px', backgroundPosition: '0 0, 15px 90px', backgroundRepeat: 'no-repeat', borderRadius: 4 }} />
                {b}
              </div>
            ))}
          </div>
        </section>
        <section style={{ marginTop: 24 }}>
          <h3 style={heading}>Townsfolk (medieval Europe): front, profile, back, walking</h3>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {TOWNSFOLK_ROLES.map((role, i) => (
              <div key={role} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', gap: 2, padding: 6, borderRadius: 4, backgroundImage: tileBackground({ type: 'dirt_path' }, {}, i, 2, theme), backgroundSize: '48px 48px' }}>
                  {['s', 'e', 'n'].map((v) => (
                    <div key={v} style={{ width: 40, height: (40 * (FIG_H + 1)) / FIG_W }}><Figure look={lookForRole(role, i)} skin={i % NPC_SKIN_COUNT} dir={v} moving /></div>
                  ))}
                </div>
                {role}
              </div>
            ))}
          </div>
        </section>
    </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [theme]);
  return (
    <div>
      <style>{`@keyframes town3qDrift { from { transform: translateX(0); } to { transform: translateX(330%); } }
        @keyframes town3qWalk { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        @keyframes town3qSway { from { transform: rotate(-1.2deg); } to { transform: rotate(1.4deg); } }
        @keyframes town3qSmoke {
          0% { transform: translate(0, 0) scale(0.9); opacity: 0; }
          30% { opacity: 0.55; }
          100% { transform: translate(150%, -500%) scale(2.2); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .town3q-view * { animation: none !important; } }`}</style>
      <h2 style={{ marginTop: 0 }}>Town 3/4 view <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— prototype: implied-3D sprites, townsfolk, light</span></h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {SIZES.map((s) => <Btn key={s} on={size === s} onClick={() => setSize(s)}>{s}</Btn>)}
        <span style={{ width: 8 }} />
        {THEMES.map((t) => <Btn key={t} on={theme === t} onClick={() => setTheme(t)}>{t}</Btn>)}
        <span style={{ width: 8 }} />
        <Btn onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>🎲 reseed</Btn>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>seed {seed}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <Btn on={mode === '3q'} onClick={() => setMode('3q')}>3/4 view</Btn>
        <Btn on={mode === 'flat'} onClick={() => setMode('flat')}>current art</Btn>
        <Btn on={mode === 'both'} onClick={() => setMode('both')}>side by side</Btn>
        <span style={{ width: 8 }} />
        <label style={{ fontSize: 12 }}>tile {T}px <input type="range" min={28} max={64} step={4} value={T} onChange={(e) => setTile(Number(e.target.value))} /></label>
        <label style={{ fontSize: 12 }}>townsfolk {npcCount} <input type="range" min={0} max={40} value={npcCount} onChange={(e) => setNpcCount(Number(e.target.value))} /></label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={clouds} onChange={(e) => setClouds(e.target.checked)} /> cloud shadows</label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={grade} onChange={(e) => setGrade(e.target.checked)} /> colour grade</label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={allGates} onChange={(e) => setAllGates(e.target.checked)} /> gates on all sides</label>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {(mode === '3q' || mode === 'both') && <div><h3 style={heading}>3/4 prototype</h3>{view3q}</div>}
        {(mode === 'flat' || mode === 'both') && <div><h3 style={heading}>Current art</h3>{flatGrid}</div>}
      </div>
      {gallery}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 900, marginTop: 12 }}>
        Same generateTownMap() output as the live game. Buildings are composed from lit 3D solids
        (boxes, roof prisms, cones) under one oblique camera, so every type shares a light
        direction, cast shadow and material palette; sprites stand 1.5 tiles tall and overlap the
        row behind. Townsfolk are cosmetic only (not persisted, never block the player). Ground
        terrain, paths and water still use the current tileset, colour-graded.
      </p>
    </div>
  );
};

export default Town3QTest;
