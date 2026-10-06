// Town3QTest.js  (/debug/town-3q)
// Preview harness for the "3/4 top-down" town renderer (components/Town3QView.js): the
// same generateTownMap() output as the live game, with controls for size, theme, water,
// zoom and townsfolk, plus a toggle showing the classic flat art for the same seed.

import React, { useMemo, useState } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import { tileBackground, waterwayMask, OFF_MAP, POI_EMOJI } from '../utils/townTileArt';
import { bridgeSprite3q, jettySprite3q, buildingSprite3q, BUILDING_TYPES_3Q } from '../utils/townSprites3q';
import { NPC_SKIN_COUNT, TOWNSFOLK_ROLES, lookForRole, FIG_W, FIG_H } from '../utils/townsfolkSprites';
import { populateTown } from '../utils/npcGenerator';
import Town3QView, { Figure, TOWN3Q_KEYFRAMES } from '../components/Town3QView';

const SIZES = ['hamlet', 'village', 'town', 'city'];
const THEMES = ['grassland', 'desert', 'snow'];
// Water contexts, as the world map would pass them (see townWater.analyzeTownWater).
const WATERS = {
  none: { river: false, water: null },
  river: { river: true, water: null },
  riverfork: { river: true, water: { archetype: 'riverfork' } },
  riverside: { river: false, water: { kind: 'riverside', edges: { N: false, E: true, S: false, W: false } } },
  lake: { river: false, water: { kind: 'lake', edges: { N: true, E: false, S: false, W: false } } },
  coast: { river: false, water: { kind: 'coast', edges: { N: false, E: false, S: false, W: true } } },
  canal: { river: false, water: { kind: 'coast', edges: { N: false, E: false, S: false, W: true }, archetype: 'canal' } },
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
  const [waterKind, setWaterKind] = useState('none');

  const town = useMemo(() => {
    const w = WATERS[waterKind] || WATERS.none;
    return generateTownMap(size, `Demo ${size}`, allGates ? ['south', 'north', 'east', 'west'] : 'south', seed, w.river, 'NORTH_SOUTH', theme, w.water);
  }, [size, seed, theme, allGates, waterKind]);
  const grid = town.mapData;
  const W = town.width, H = town.height;
  const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] : null);
  const wetAt = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] || null : OFF_MAP);
  const neighbours = (x, y) => ({ n: at(x, y - 1)?.type, e: at(x + 1, y)?.type, s: at(x, y + 1)?.type, w: at(x - 1, y)?.type });
  const wetMask = (t, x, y) => waterwayMask(t, { n: wetAt(x, y - 1), e: wetAt(x + 1, y), s: wetAt(x, y + 1), w: wetAt(x - 1, y) });

  const roster = useMemo(() => populateTown(town, seed), [town, seed]);
  const T = tile;

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

  const view3q = <Town3QView town={town} theme={theme} tile={T} roster={roster} npcCount={npcCount} seed={seed} clouds={clouds} grade={grade} />;

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
          <h3 style={heading}>Bridges and jetties</h3>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {[
              ['bridge, east-west', [[{ axis: 'ew', ends: { w: true } }, 0], [{ axis: 'ew', ends: {} }, 1], [{ axis: 'ew', ends: { e: true } }, 2]], 'row'],
              ['bridge, north-south', [[{ axis: 'ns', ends: { n: true } }, 0], [{ axis: 'ns', ends: {} }, 1], [{ axis: 'ns', ends: { s: true } }, 2]], 'col'],
            ].map(([label, parts, dir]) => (
              <div key={label} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ position: 'relative', width: dir === 'row' ? 180 : 60, height: dir === 'row' ? 110 : 230 }}>
                  {parts.map(([b, i]) => {
                    const px = dir === 'row' ? i * 60 : 0, py = dir === 'row' ? 45 : i * 60 + 45;
                    return (
                      <React.Fragment key={i}>
                        <div style={{ position: 'absolute', left: px, top: py, width: 60, height: 60, backgroundImage: tileBackground({ type: 'water' }, {}, i, 3, theme), backgroundSize: '100% 100%' }} />
                        <div style={{ position: 'absolute', left: px - 15, top: py - 90, width: 90, height: 150, zIndex: i + 1, backgroundImage: bridgeSprite3q(b.axis, b.ends, i, 3), backgroundSize: '100% 100%' }} />
                      </React.Fragment>
                    );
                  })}
                </div>
                {label}
              </div>
            ))}
            {['n', 'e', 's', 'w'].map((d) => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ width: 90, height: 150, backgroundImage: `${jettySprite3q(d, 1, 1)}, ${tileBackground({ type: 'water' }, {}, 1, 1, theme)}`, backgroundSize: '100% 100%, 60px 60px', backgroundPosition: '0 0, 15px 90px', backgroundRepeat: 'no-repeat' }} />
                jetty, water to {d.toUpperCase()}
              </div>
            ))}
          </div>
        </section>
        <section style={{ marginTop: 24 }}>
          <h3 style={heading}>Townsfolk ({theme}): front, profile, back, walking</h3>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {TOWNSFOLK_ROLES.map((role, i) => (
              <div key={role} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', gap: 2, padding: 6, borderRadius: 4, backgroundImage: tileBackground({ type: 'dirt_path' }, {}, i, 2, theme), backgroundSize: '48px 48px' }}>
                  {['s', 'e', 'n'].map((v) => (
                    <div key={v} style={{ width: 40, height: (40 * (FIG_H + 1)) / FIG_W }}><Figure look={lookForRole(role, i)} skin={i % NPC_SKIN_COUNT} dir={v} moving theme={theme} /></div>
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
      <style>{TOWN3Q_KEYFRAMES}</style>
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
        <label style={{ fontSize: 12 }}>water{' '}
          <select value={waterKind} onChange={(e) => setWaterKind(e.target.value)}>
            {Object.keys(WATERS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {(mode === '3q' || mode === 'both') && <div><h3 style={heading}>3/4 prototype</h3>{view3q}</div>}
        {(mode === 'flat' || mode === 'both') && <div><h3 style={heading}>Current art</h3>{flatGrid}</div>}
      </div>
      {gallery}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 900, marginTop: 12 }}>
        Same generateTownMap() output and renderer as the live game. Buildings are composed from lit 3D solids
        (boxes, roof prisms, cones) under one oblique camera, so every type shares a light
        direction, cast shadow and material palette; sprites stand 1.5 tiles tall and overlap the
        row behind. Townsfolk are cosmetic only (not persisted, never block the player). Ground
        terrain, paths and water still use the current tileset, colour-graded.
      </p>
    </div>
  );
};

export default Town3QTest;
