// LargeWorldTest.js  (/debug/large-world)
// Acceptance surface for the EXPERIMENTAL chunk-assembly prototype (issue #60, step 3 of
// docs/LARGER_WORLDS_PLAN.md). Assembles a chunksN x chunksN world via worldAssembler and
// renders it with the real worldTileArt at a small tile size in its own scroll container —
// the live WorldMapDisplay/MapModal are untouched. Toggle the chunk-boundary overlay and
// eyeball the seams; the stats panel mirrors the assembly report (per-chunk water %, town
// counts, ocean side, gate points, seam continuity, connectivity).

import React, { useMemo, useState } from 'react';
import { assembleWorld, CHUNK_SIZE } from '../utils/worldAssembler';
import { biomeBackground, poiSprite } from '../utils/worldTileArt';

const TILE = 24;

// Path geometry for river/road overlays (same shapes as WorldMapDisplay, viewBox 40x40).
const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40', EAST_WEST: 'M0,20 L40,20',
  NORTH_EAST: 'M20,0 Q20,20 40,20', NORTH_WEST: 'M20,0 Q20,20 0,20',
  SOUTH_EAST: 'M20,40 Q20,20 40,20', SOUTH_WEST: 'M20,40 Q20,20 0,20',
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20',
  START_NORTH: 'M20,20 L20,0', START_SOUTH: 'M20,20 L20,40', START_EAST: 'M20,20 L40,20', START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20', END_SOUTH: 'M20,0 L20,20', END_EAST: 'M0,20 L20,20', END_WEST: 'M40,20 L20,20',
};

const Overlay = ({ d, stroke, width, opacity }) => (
  <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
    <path d={d} stroke={stroke} strokeWidth={width} fill="none" opacity={opacity} strokeLinecap="round" />
  </svg>
);

const Toggle = ({ on, set, children }) => (
  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {children}
  </label>
);

const pct = (v) => `${Math.round(v * 100)}%`;

const LargeWorldTest = () => {
  const [seed, setSeed] = useState(4242);
  const [seedInput, setSeedInput] = useState('4242');
  const [chunksN, setChunksN] = useState(3);
  const [showChunkGrid, setShowChunkGrid] = useState(true);
  const [showGates, setShowGates] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [showRivers, setShowRivers] = useState(true);
  const [theme, setTheme] = useState('grassland');

  const { mapData, report } = useMemo(
    () => assembleWorld({ worldSeed: seed, chunksX: chunksN, chunksY: chunksN, theme }),
    [seed, chunksN, theme]
  );
  const cols = mapData[0].length;
  const gateSet = useMemo(() => {
    const s = new Set();
    report.gates.forEach((g) => { s.add(`${g.a.x},${g.a.y}`); s.add(`${g.b.x},${g.b.y}`); });
    return s;
  }, [report]);

  const applySeed = () => {
    const n = parseInt(seedInput, 10);
    if (Number.isFinite(n)) setSeed(n);
  };
  const reseed = () => {
    const n = Math.floor(Math.random() * 100000);
    setSeedInput(String(n));
    setSeed(n);
  };

  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };
  const td = { padding: '2px 8px', borderBottom: '1px solid var(--border)', fontSize: 12 };

  const landSeams = report.seams;
  const worstSeam = landSeams.reduce((m, s) => Math.min(m, s.biomeMatchPct), 1);
  const coastSeams = landSeams.filter((s) => s.crossesCoast);
  const coastOk = coastSeams.every((s) => s.coastBandOk);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>
        Large World <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— chunk-assembly prototype (EXPERIMENTAL, debug-only, seed scheme NOT frozen)</span>
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          seed{' '}
          <input
            type="number" value={seedInput} style={{ width: 90 }}
            onChange={(e) => setSeedInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySeed(); }}
            onBlur={applySeed}
          />
        </label>
        <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={reseed}>🎲 regenerate</button>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          size{' '}
          <select value={chunksN} onChange={(e) => setChunksN(Number(e.target.value))}>
            <option value={1}>1x1 (10x10 — today's world)</option>
            <option value={2}>2x2 (20x20)</option>
            <option value={3}>3x3 (30x30)</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          theme{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="grassland">grassland</option>
            <option value="desert">desert</option>
            <option value="snow">snow</option>
          </select>
        </label>
        <Toggle on={showChunkGrid} set={setShowChunkGrid}>chunk boundaries</Toggle>
        <Toggle on={showGates} set={setShowGates}>gate points</Toggle>
        <Toggle on={showPois} set={setShowPois}>POIs</Toggle>
        <Toggle on={showPaths} set={setShowPaths}>roads</Toggle>
        <Toggle on={showRivers} set={setShowRivers}>rivers</Toggle>
      </div>

      <div style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${cols}, ${TILE}px)`, width: cols * TILE }}>
          {mapData.flat().map((tile) => {
            const poi = showPois ? poiSprite(tile) : null;
            const isGate = gateSet.has(`${tile.x},${tile.y}`);
            return (
              <div key={`${tile.x},${tile.y}`} style={{
                width: TILE, height: TILE, backgroundImage: biomeBackground(tile, tile.x, tile.y), backgroundSize: 'cover', position: 'relative',
              }}>
                {showRivers && tile.hasRiver && tile.biome !== 'water' && (
                  <Overlay d={pathSVGs[tile.riverDirection] || pathSVGs.NORTH_SOUTH} stroke="#3f7cc2" width={4} opacity={0.85} />
                )}
                {showPaths && tile.hasPath && (
                  <Overlay d={pathSVGs[tile.pathDirection] || pathSVGs.NORTH_SOUTH} stroke="#7a5230" width={3} opacity={0.8} />
                )}
                {poi && <div style={{ position: 'absolute', inset: 0, zIndex: 2, backgroundImage: poi, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />}
                {tile.isStartingTown && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 3, border: '2px solid #ffcf4d', borderRadius: 2, pointerEvents: 'none' }} />
                )}
                {showGates && isGate && (
                  <div style={{ position: 'absolute', inset: 2, zIndex: 4, border: '2px dashed #d94a4a', borderRadius: '50%', pointerEvents: 'none' }} />
                )}
              </div>
            );
          })}
          {showChunkGrid && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
              {Array.from({ length: chunksN - 1 }, (_, i) => (
                <React.Fragment key={i}>
                  <div style={{ position: 'absolute', left: (i + 1) * CHUNK_SIZE * TILE - 1, top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.65)', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
                  <div style={{ position: 'absolute', top: (i + 1) * CHUNK_SIZE * TILE - 1, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.65)', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      <section style={{ marginTop: 16 }}>
        <h3 style={heading}>Assembly report</h3>
        <p style={{ fontSize: 13, margin: '4px 0' }}>
          Ocean side: <strong>{report.oceanSide}</strong> (heart coast depth {report.heartCoastDepth}) ·
          heart chunk ({report.heart.cx},{report.heart.cy}) ·
          connectivity: <strong style={{ color: report.connectivity.ok ? 'inherit' : '#d94a4a' }}>
            {report.connectivity.reachableTowns}/{report.connectivity.totalTowns} towns reach the starting town over land
          </strong> ·
          lakes: <strong>{report.totalLakes}</strong> total ({report.lakesPerLandChunk.toFixed(2)}/land chunk) ·
          seams: worst biome match {pct(worstSeam)}{coastSeams.length > 0 && <> · coast depths {coastOk ? 'matched at seams' : 'MISMATCHED'}</>}
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['chunk', 'kind', 'seed', 'water', 'towns', 'lakes', 'coast depth'].map((h) => <th key={h} style={{ ...td, textAlign: 'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {report.chunks.map((c) => {
                const depths = c.coastDepths
                  ? `${Math.min(...c.coastDepths)}-${Math.max(...c.coastDepths)}`
                  : (c.coastDepth ?? '—');
                return (
                  <tr key={`${c.cx},${c.cy}`}>
                    <td style={td}>({c.cx},{c.cy})</td>
                    <td style={td}>{c.kind}</td>
                    <td style={td}>{c.seed}</td>
                    <td style={td}>{pct(c.waterPct)}</td>
                    <td style={td}>{c.towns}</td>
                    <td style={td}>{c.lakes}{c.kind === 'coastal' || c.kind === 'inland' ? (c.lakesGranted ? '' : ' (skip)') : ''}</td>
                    <td style={td}>{depths}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['gate edge', 'offset', 'tiles', 'roads'].map((h) => <th key={h} style={{ ...td, textAlign: 'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {report.gates.length === 0 && <tr><td style={td} colSpan={4}>none (1x1 world)</td></tr>}
              {report.gates.map((g) => (
                <tr key={g.edgeId}>
                  <td style={td}>{g.edgeId}</td>
                  <td style={td}>{g.offset}</td>
                  <td style={td}>({g.a.x},{g.a.y})↔({g.b.x},{g.b.y})</td>
                  <td style={td}>{g.connected.a && g.connected.b ? '✓ both' : 'partial'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['seam', 'kinds', 'biome match', 'no hard edge', 'coast band'].map((h) => <th key={h} style={{ ...td, textAlign: 'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {landSeams.length === 0 && <tr><td style={td} colSpan={5}>none</td></tr>}
              {landSeams.map((s, i) => (
                <tr key={i}>
                  <td style={td}>({s.between[0].join(',')})↔({s.between[1].join(',')})</td>
                  <td style={td}>{s.kinds.join('/')}</td>
                  <td style={td}>{pct(s.biomeMatchPct)}</td>
                  <td style={td}>{pct(s.compatiblePct)}</td>
                  <td style={td}>{s.crossesCoast ? (s.coastBandOk ? '✓ =' : '✗') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          Heart chunk interior is the legacy <code>generateMapData(10,10,seed)</code> world (roads to gate points are an
          additive overlay). Outer land chunks: seeded via <code>chunkSeed(worldSeed,cx,cy)</code>, lakes granted on a
          seeded ~32% per-chunk roll (and kept 2 tiles off seams), ~65% settlement density, no coast except the ocean
          side. Coast depth follows one world-level profile (<code>buildCoastProfile</code>) anchored on the heart's own
          depth: it wobbles in 3-5 tile runs along the coastline but never steps at a chunk seam, so both sides of every
          seam share the same band depth. Red dashed circles are gate tiles. This page and <code>worldAssembler.js</code>
          are the whole prototype — nothing touches New Game or saves.
        </p>
      </section>
    </div>
  );
};

export default LargeWorldTest;
