// CombatStage.js — the encounter art becomes the combat "stage" (COMBAT_UX_PLAN.md
// Thread A juice + §0 overload cut): the enemy HP bar is overlaid along the TOP of the
// image (reclaiming the row it used below), and damage numbers rise-and-fade over the art
// each round instead of living in "Damage Dealt / Taken" text sections. Pure presentation:
// it reads values the fight already computed (roundState HP, roundResult damage) and never
// changes an outcome. Reused by the live EncounterActionModal and (later) the docked HUD.

import React, { useEffect, useRef, useState } from 'react';
import ClickableImage from './ClickableImage';

let floaterSeq = 0;

const CombatStage = ({
  image,
  alt,
  height,
  maxWidth,
  objectPosition,
  icon,
  // Enemy HP (multi-round fights only; omit for single-round / non-combat)
  enemyName,
  enemyCurrentHP,
  enemyMaxHP,
  // The latest resolved round; its identity change spawns one burst of floaters.
  roundResult,
}) => {
  const [floaters, setFloaters] = useState([]);
  const lastResultRef = useRef(null);

  useEffect(() => {
    if (!roundResult || roundResult === lastResultRef.current) return;
    lastResultRef.current = roundResult;
    const next = [];
    if (roundResult.enemyDamage > 0) next.push({ id: ++floaterSeq, text: `-${roundResult.enemyDamage}`, kind: 'dealt' });
    if (roundResult.hpDamage > 0) next.push({ id: ++floaterSeq, text: `-${roundResult.hpDamage}`, kind: 'taken' });
    if (next.length === 0) return;
    setFloaters((prev) => [...prev, ...next]);
    const ids = new Set(next.map((f) => f.id));
    // Keep mounted through the full 1.8s damageRiseFade animation (+ a small buffer).
    const timer = setTimeout(() => setFloaters((prev) => prev.filter((f) => !ids.has(f.id))), 1900);
    return () => clearTimeout(timer);
  }, [roundResult]);

  const hasEnemyHP = Number.isFinite(enemyMaxHP) && enemyMaxHP > 0;
  const pct = hasEnemyHP ? Math.max(0, Math.min(100, (enemyCurrentHP / enemyMaxHP) * 100)) : 0;
  const low = hasEnemyHP && enemyCurrentHP <= enemyMaxHP * 0.3;

  return (
    <div className="combat-stage">
      {image
        ? <ClickableImage src={image} alt={alt} height={height} maxWidth={maxWidth} objectPosition={objectPosition} />
        : <span className="encounter-icon">{icon}</span>}

      {hasEnemyHP && (
        <div className="combat-stage-hp">
          <div className="combat-stage-hp-row">
            <span className="combat-stage-hp-name">{enemyName}</span>
            <span className={`combat-stage-hp-num${low ? ' low' : ''}`}>HP: {enemyCurrentHP} / {enemyMaxHP}</span>
          </div>
          <div className="combat-stage-hp-track">
            <div className={`combat-stage-hp-fill${low ? ' low' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="combat-stage-floaters" aria-hidden="true">
        {floaters.map((f) => (
          <span key={f.id} className={`damage-floater ${f.kind}`}>{f.text}</span>
        ))}
      </div>
    </div>
  );
};

export default CombatStage;
