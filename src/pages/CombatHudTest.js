// CombatHudTest.js — /debug/combat-hud
// Harness for the MAP-CONTEXT COMBAT HUD (COMBAT_UX_PLAN.md §0, 2026-07-21).
//
// The end-state: combat is a HUD docked over the EXISTING map, entered by walking the
// party into an enemy that lives on the map (roaming mob / boss guardian), not a button
// that launches a fight from nowhere. This harness reuses the REAL site-play loop
// (computeWalkPath + runTileWalk + stepMobs) so it behaves like a live site: click to
// walk, the site's own mobs chase and engage on contact, and the fight (Lead + Support)
// opens over the map. Drop the selected boss on the map to walk into it specifically.
//
// Step 1 (this page): the fight still opens as the current centered modal, but it is now
// entered spatially, over a live map. Step 2: extract the panel out of ModalShell into a
// dockable CombatHud and anchor it on the map, iterated here.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import EncounterActionModal from '../components/EncounterActionModal';
import SiteMapDisplay from '../components/SiteMapDisplay';
import { useModal } from '../contexts/ModalContext';
import { storyTemplates } from '../data/storyTemplates';
import { DIFFICULTY_DC } from '../data/encounters';
import { buildSimHero, simulateEncounter } from '../game/balanceSim';
import { generateSiteMap } from '../utils/siteMapGenerator';
import { populateSite } from '../game/sitePopulator';
import { computeWalkPath, runTileWalk, TILE_STEP_MS } from '../game/tileWalk';
import { stepMobs, makeMob } from '../game/mobMovement';
import { isEncounterVictory, isFleeOutcome } from '../game/encounterController';

const CLASS_ROTATION = ['Fighter', 'Rogue', 'Cleric', 'Wizard'];
const SITE_TYPES = ['cave', 'ruins', 'forest', 'hills', 'mountain'];
const SITE_NAMES = { cave: 'Hollow Deep', ruins: 'Old Ruins', forest: 'Mistwood', hills: 'Windswept Hills', mountain: 'The Jagged Pass' };
const isSiteWalkable = (t) => !!t && t.walkable;
const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Authored bosses across playable templates (same source as BossFightTest).
const BOSSES = storyTemplates
  .filter((t) => !t.comingSoon)
  .map((t) => {
    const m = (t.settings?.milestones || []).find((ms) => ms.encounter);
    if (!m) return null;
    return {
      key: `${t.id}:${m.encounter.name}`,
      label: `${m.encounter.name} — ${t.name} (t${t.tier || 1})`,
      encounter: m.encounter,
      enemyId: m.trigger?.enemy,
      tier: t.tier || 1,
    };
  })
  .filter(Boolean);

const buildParty = ({ size, level, loadout, tier }) =>
  Array.from({ length: size }, (_, i) => ({
    ...buildSimHero({ level, characterClass: CLASS_ROTATION[i % CLASS_ROTATION.length], loadout, tier }),
    characterName: `${CLASS_ROTATION[i % CLASS_ROTATION.length]} (Lv ${level})`,
    characterId: `combathud_${i}`,
  }));

const ctrl = (active) => ({
  padding: '5px 10px',
  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  borderRadius: 6,
  background: active ? 'var(--primary)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--text)',
  cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
});

const CombatHudTest = () => {
  const { open: openEncounterAction } = useModal('encounterAction');
  const [bossKey, setBossKey] = useState(BOSSES.find((b) => b.tier === 2)?.key || BOSSES[0]?.key);
  const [size, setSize] = useState(3);
  const [level, setLevel] = useState(4);
  const [loadout, setLoadout] = useState('mid');
  const [siteType, setSiteType] = useState('cave');
  const [seed, setSeed] = useState(123);
  const [odds, setOdds] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const [site, setSite] = useState(null);
  const [playerPos, setPlayerPos] = useState(null);
  const [party, setParty] = useState(null);

  // Refs so the async walk loop always reads fresh state (and never a stale closure).
  const siteRef = useRef(null);
  const playerPosRef = useRef(null);
  const walkCancelRef = useRef(null);
  const activeMobIdRef = useRef(null);
  useEffect(() => { siteRef.current = site; }, [site]);
  useEffect(() => { playerPosRef.current = playerPos; }, [playerPos]);

  const boss = useMemo(() => BOSSES.find((b) => b.key === bossKey), [bossKey]);
  const dc = boss ? (boss.encounter.dc || DIFFICULTY_DC[boss.encounter.difficulty] || '?') : '?';

  // (Re)build the site when its inputs change: a real populated site (roaming mobs + loot).
  useEffect(() => {
    if (walkCancelRef.current) { walkCancelRef.current(); walkCancelRef.current = null; }
    const s = populateSite(generateSiteMap(siteType, SITE_NAMES[siteType] || siteType, 'south', seed, { biome: 'grassland' }), seed, level);
    setSite(s);
    setPlayerPos(s.entryPoint);
    activeMobIdRef.current = null;
    setNotice(`New ${siteType} (seed ${seed}) — ${(s.mobs || []).length} roaming mob(s). Click a floor tile to walk; walk into a mob to fight.`);
  }, [siteType, seed, level]);

  // Rebuild the party when its inputs change (fresh HP each config change).
  useEffect(() => {
    setParty(buildParty({ size, level, loadout, tier: boss?.tier || 1 }));
  }, [size, level, loadout, boss?.tier]);

  // Mirror Game.js advanceMobs: step the site's mobs, copy positions onto the shared
  // objects, re-render, and return the mob (if any) now in contact.
  const stepHarnessMobs = (pos) => {
    const s = siteRef.current;
    const mobs = s?.mobs;
    if (!Array.isArray(mobs) || mobs.length === 0 || !s.mapData) return null;
    const { mobs: nextMobs, combatMob } = stepMobs(mobs, pos, { mapData: s.mapData });
    mobs.forEach((m, i) => {
      const n = nextMobs[i];
      if (m && n) { m.x = n.x; m.y = n.y; m.state = n.state; m.defeated = n.defeated; }
    });
    setSite((prev) => (prev ? { ...prev } : prev));
    return combatMob;
  };

  const openCombatWithMob = (mob) => {
    if (!mob || mob.defeated) return;
    activeMobIdRef.current = mob.id;
    openEncounterAction({
      encounter: mob.isBoss ? { ...mob.encounter, enemyId: mob.enemyId } : mob.encounter,
    });
  };

  // Click a floor tile → walk there, stepping mobs each tile; engage on contact (halts).
  const handleTileClick = (x, y) => {
    const s = siteRef.current;
    const start = playerPosRef.current;
    if (!s || !start) return;
    if (walkCancelRef.current) { walkCancelRef.current(); walkCancelRef.current = null; }
    const path = computeWalkPath(s.mapData, start, { x, y }, isSiteWalkable);
    if (!path || path.length === 0) return;
    walkCancelRef.current = runTileWalk({
      path,
      stepIntervalMs: TILE_STEP_MS,
      onEnterTile: (pos) => {
        setPlayerPos(pos);
        playerPosRef.current = pos;
        const combatMob = stepHarnessMobs(pos);
        if (combatMob) { openCombatWithMob(combatMob); return 'halt'; }
        return 'continue';
      },
    });
  };

  // Click a mob directly → engage it (harness convenience; live game walks up first).
  const handleAttackMob = (mob) => openCombatWithMob(mob);

  // Drop the selected boss on the map as a stationary guardian at the reachable tile
  // farthest from the entry, so you can walk up to that specific boss.
  const placeBossOnMap = () => {
    const s = siteRef.current;
    if (!s || !boss) return;
    const start = s.entryPoint;
    const reachable = (s.contentSlots || []).filter((c) => {
      const p = computeWalkPath(s.mapData, start, c, isSiteWalkable);
      return p && p.length > 0;
    });
    if (reachable.length === 0) { setNotice('No reachable slot to place the boss (try another seed).'); return; }
    const spot = reachable.reduce((far, c) => (md(c, start) > md(far, start) ? c : far), reachable[0]);
    const bossMob = makeMob({
      x: spot.x, y: spot.y, encounter: boss.encounter, enemyId: boss.enemyId, isBoss: true, milestoneId: 'harness',
    });
    s.mobs = [...(s.mobs || []).filter((m) => !(m.x === spot.x && m.y === spot.y)), bossMob];
    setSite((prev) => (prev ? { ...prev } : prev));
    setNotice(`${boss.encounter.name} placed at (${spot.x}, ${spot.y}) — walk to it (👹) to fight.`);
  };

  const runOdds = async () => {
    if (!boss) return;
    setSimBusy(true); setOdds(null);
    await new Promise((r) => setTimeout(r, 30));
    const hero = buildParty({ size, level, loadout, tier: boss.tier });
    const result = await simulateEncounter(boss.encounter, hero, { trials: 800, seed: 1, settings: { tier: boss.tier } });
    setOdds(result); setSimBusy(false);
  };

  // Clear the engaged mob, mirroring Game.js handleEncounterResolve exactly: a SINGLE-ROUND
  // mob (a one-shot hazard like a rat/bat swarm — no enemy HP, so it can never report
  // 'victory') clears on ANY non-flee outcome; a multi-round fight clears only on a real
  // victory. Checking result.success (which single-round fights never set) was the bug that
  // let the first rat respawn.
  const handleResolve = (result) => {
    const id = activeMobIdRef.current;
    const s = siteRef.current;
    if (id && s?.mobs) {
      const mob = s.mobs.find((m) => m.id === id);
      if (mob) {
        const singleRound = !mob.encounter?.multiRound;
        const cleared = (singleRound && !isFleeOutcome(result)) || isEncounterVictory(result);
        if (cleared) { mob.defeated = true; setSite((prev) => (prev ? { ...prev } : prev)); }
      }
    }
    activeMobIdRef.current = null;
  };
  const handleHeroUpdate = (updatedHero) =>
    setParty((prev) => (prev ? prev.map((h) => (h.characterId === updatedHero.characterId ? updatedHero : h)) : prev));

  const liveMobs = (site?.mobs || []).filter((m) => !m.defeated).length;

  return (
    <div style={{ color: 'var(--text)' }}>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>⚔️ Combat HUD (map-context) — harness</h2>
      <p style={{ color: 'var(--text-muted,#888)', fontSize: 13, maxWidth: 780 }}>
        The real site-play loop (walk + roaming mobs that chase and engage on contact) over a
        live populated map, per COMBAT_UX_PLAN.md §0. <strong>Click a floor tile to walk</strong>;
        walk into a mob (or click it) to open the fight over the map. Step 1 baseline: the fight
        still opens as the current centered modal, but it is now <em>entered spatially</em>. This
        is where we iterate the docked HUD before re-homing the panel out of <code>ModalShell</code>.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', margin: '12px 0' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Backdrop</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {SITE_TYPES.map((t) => <button key={t} style={ctrl(siteType === t)} onClick={() => setSiteType(t)}>{t}</button>)}
            <button style={ctrl(false)} onClick={() => setSeed((s) => s + 1)}>seed +</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Party</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[1, 2, 3, 4].map((n) => <button key={n} style={ctrl(size === n)} onClick={() => setSize(n)}>{n}</button>)}
            <span style={{ fontSize: 12, color: 'var(--text-muted,#888)', marginLeft: 4 }}>Lv</span>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} style={ctrl(level === n)} onClick={() => setLevel(n)}>{n}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Gear</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['none', 'mid', 'best'].map((l) => <button key={l} style={ctrl(loadout === l)} onClick={() => setLoadout(l)}>{l}</button>)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>
          <span style={{ fontWeight: 700, marginRight: 6 }}>Boss</span>
          <select value={bossKey} onChange={(e) => { setBossKey(e.target.value); setOdds(null); }} style={{ padding: 5, maxWidth: 260 }}>
            {BOSSES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </label>
        <button className="primary-button" onClick={placeBossOnMap}>👹 Place boss on map</button>
        <button className="secondary-button" onClick={runOdds} disabled={simBusy}>
          {simBusy ? 'Simulating…' : '🎲 Expected odds'}
        </button>
        <span style={{ color: 'var(--text-muted,#888)', fontSize: 13 }}>
          {boss ? `DC ${dc} · ${boss.encounter.enemyHP} HP · ${boss.encounter.difficulty}` : ''}
          {odds ? ` · win ${(odds.winRate * 100).toFixed(0)}% · ${odds.meanRounds?.toFixed(1)} rounds` : ''}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted,#888)', marginBottom: 8 }}>
        {notice} {site ? `· ${liveMobs} live mob(s) on the map` : ''}
      </div>

      {/* The live, walkable map. Combat opens over this. */}
      <div style={{ border: '2px solid #1b1a1f', borderRadius: 8, overflow: 'auto', maxWidth: '100%', background: '#1b1a1f' }}>
        {site && (
          <SiteMapDisplay
            siteMapData={site}
            playerPosition={playerPos}
            partyLevel={level}
            firstHero={party ? party[0] : null}
            onTileClick={handleTileClick}
            onAttackMob={handleAttackMob}
            showLeaveButton={false}
          />
        )}
      </div>

      {/* Real combat flow. Opens as the centered modal for now (step 1). */}
      <EncounterActionModal
        party={party || []}
        character={party ? party[0] : null}
        onResolve={handleResolve}
        onCharacterUpdate={handleHeroUpdate}
        fullSizeImage
      />
    </div>
  );
};

export default CombatHudTest;
