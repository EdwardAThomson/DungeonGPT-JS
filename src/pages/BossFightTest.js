// BossFightTest.js — /debug/boss-fight
// Playtest harness for template boss fights (esp. t2, unreachable in normal play until
// quest chaining ships): pick any authored boss, configure a party (size / level /
// gear loadout via the balance sim's hero builder), see the sim's expected odds for
// that exact configuration, then fight it through the REAL EncounterActionModal
// (formation phase, Lead + Support, damage, KO — the #43 flow).

import React, { useMemo, useState } from 'react';
import EncounterActionModal from '../components/EncounterActionModal';
import { useModal } from '../contexts/ModalContext';
import { storyTemplates } from '../data/storyTemplates';
import { DIFFICULTY_DC } from '../data/encounters';
import { buildSimHero, simulateEncounter } from '../game/balanceSim';

const CLASS_ROTATION = ['Fighter', 'Rogue', 'Cleric', 'Wizard'];

// All authored bosses across playable templates: [{ label, encounter, tier, level }]
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
      intendedLevel: m.minLevel || (t.levelRange ? t.levelRange[0] : 1)
    };
  })
  .filter(Boolean);

const buildParty = ({ size, level, loadout, tier }) =>
  Array.from({ length: size }, (_, i) =>
    ({
      ...buildSimHero({ level, characterClass: CLASS_ROTATION[i % CLASS_ROTATION.length], loadout, tier }),
      characterName: `${CLASS_ROTATION[i % CLASS_ROTATION.length]} (Lv ${level})`,
      characterId: `bosstest_${i}`
    }));

const Stat = ({ label, value }) => (
  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-secondary)' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
  </div>
);

const BossFightTest = () => {
  const { open: openEncounterAction } = useModal('encounterAction');
  const [bossKey, setBossKey] = useState(BOSSES.find((b) => b.tier === 2)?.key || BOSSES[0]?.key);
  const [size, setSize] = useState(3);
  const [level, setLevel] = useState(4);
  const [loadout, setLoadout] = useState('mid');
  const [party, setParty] = useState(null);
  const [odds, setOdds] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [log, setLog] = useState([]);

  const boss = useMemo(() => BOSSES.find((b) => b.key === bossKey), [bossKey]);
  const dc = boss ? (boss.encounter.dc || DIFFICULTY_DC[boss.encounter.difficulty] || '?') : '?';

  const addLog = (msg) => setLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 30));

  const freshParty = () => {
    const p = buildParty({ size, level, loadout, tier: boss?.tier || 1 });
    setParty(p);
    return p;
  };

  const runOdds = async () => {
    if (!boss) return;
    setSimBusy(true);
    setOdds(null);
    // Yield a frame so the button state paints before the sim loop runs.
    await new Promise((r) => setTimeout(r, 30));
    const hero = buildParty({ size, level, loadout, tier: boss.tier });
    const result = await simulateEncounter(boss.encounter, hero, {
      trials: 800,
      seed: 1,
      settings: { tier: boss.tier }
    });
    setOdds(result);
    setSimBusy(false);
  };

  const startFight = () => {
    if (!boss) return;
    freshParty();
    addLog(`⚔️ Fight started: ${boss.encounter.name} (DC ${dc}, ${boss.encounter.enemyHP} HP) vs ${size}× Lv${level} ${loadout}-gear party`);
    openEncounterAction({ encounter: { ...boss.encounter, enemyId: boss.enemyId } });
  };

  const handleResolve = (result) => {
    const tag = result?.success ? '🏆 VICTORY' : '💀 DEFEAT/RETREAT';
    addLog(`${tag} — outcome: ${result?.outcome || result?.outcomeTier || 'n/a'}${result?.rewards?.xp ? `, ${result.rewards.xp} XP` : ''}`);
  };

  const handleHeroUpdate = (updatedHero) => {
    setParty((prev) => prev
      ? prev.map((h) => (h.characterId === updatedHero.characterId ? updatedHero : h))
      : prev);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: 'var(--text)' }}>
      <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)' }}>⚔️ Boss Fight Test</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        Fight any authored boss with a configurable party through the real encounter flow
        (Lead + Support, bosses that hit back). t2 bosses are otherwise unreachable until
        quest chaining ships.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0' }}>
        <label>
          Boss
          <select value={bossKey} onChange={(e) => { setBossKey(e.target.value); setOdds(null); }} style={{ width: '100%', padding: 6 }}>
            {BOSSES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </label>
        <label>
          Party size
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setOdds(null); }} style={{ width: '100%', padding: 6 }}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} hero{n > 1 ? 'es' : ''}</option>)}
          </select>
        </label>
        <label>
          Level
          <select value={level} onChange={(e) => { setLevel(Number(e.target.value)); setOdds(null); }} style={{ width: '100%', padding: 6 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>Lv {n}{boss && n === boss.intendedLevel ? ' (intended)' : ''}</option>)}
          </select>
        </label>
        <label>
          Gear loadout
          <select value={loadout} onChange={(e) => { setLoadout(e.target.value); setOdds(null); }} style={{ width: '100%', padding: 6 }}>
            <option value="none">None</option>
            <option value="mid">Mid</option>
            <option value="best">Best obtainable</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button className="primary-button" onClick={startFight}>⚔️ Fight</button>
        <button className="secondary-button" onClick={runOdds} disabled={simBusy}>
          {simBusy ? 'Simulating…' : '🎲 Expected odds (800 sims)'}
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {boss ? `DC ${dc} · ${boss.encounter.enemyHP} HP · ${boss.encounter.difficulty}` : ''}
        </span>
      </div>

      {odds && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
          <Stat label="Win rate" value={`${(odds.winRate * 100).toFixed(1)}%`} />
          <Stat label="Mean rounds" value={odds.meanRounds?.toFixed(1)} />
          <Stat label="Wipe risk" value={`${((odds.tpkRisk || 0) * 100).toFixed(1)}%`} />
          <Stat label="Stalemate" value={`${((odds.stalemateRate || 0) * 100).toFixed(1)}%`} />
        </div>
      )}

      {party && (
        <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Party: {party.map((h) => `${h.characterName} ${h.currentHP}/${h.maxHP} HP`).join(' · ')}
        </div>
      )}

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, minHeight: 80 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-secondary)', marginBottom: 6 }}>Fight log</div>
        {log.length === 0
          ? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No fights yet</span>
          : log.map((l, i) => <div key={i} style={{ fontSize: 13, marginBottom: 3 }}>{l}</div>)}
      </div>

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

export default BossFightTest;
