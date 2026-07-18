import React, { useRef, useEffect } from 'react';
import { heroSupportContribution } from '../utils/multiRoundEncounter';
import { getHPStatus, encounterDealsDamage } from '../utils/healthSystem';
import { describeSpellDamage, ITEM_CATALOG } from '../utils/inventorySystem';
import ClickableImage from './ClickableImage';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';
import useEncounterFight from '../hooks/useEncounterFight';

const EncounterActionModal = ({ party, character, onResolve, onCharacterUpdate, fullSizeImage = false }) => {
  const { isOpen, data, close } = useModal('encounterAction');
  const encounter = data?.encounter;
  const {
    isResolving,
    result,
    selectedHeroIndex,
    setSelectedHeroIndex,
    initiativeResult,
    showHeroSelection,
    heroConfirmed,
    currentCharacter,
    isMultiRound,
    roundState,
    roundResults,
    currentRoundResult,
    showItemPicker,
    setShowItemPicker,
    pendingItemKey,
    setPendingItemKey,
    itemUseResult,
    combatParty,
    usableConsumables,
    canUseItemInCombat,
    isDefeated,
    encounterThreat,
    availableActions,
    handleHeroConfirm,
    handleAction,
    handleNextRound,
    handleFightAgain,
    handleUseItemInCombat,
    handleUseSpellItemInCombat,
    handleFleeEncounter,
    handleFleeBeforeCombat,
    handleRetreatDefeated,
    handleContinue
  } = useEncounterFight({
    isOpen,
    encounter,
    party,
    character,
    onResolve,
    onCharacterUpdate,
    onClose: close
  });

  // Bring the inline item tray into view when it opens (it renders at the modal bottom).
  const itemTrayRef = useRef(null);
  useEffect(() => {
    if (showItemPicker && itemTrayRef.current) {
      itemTrayRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showItemPicker, pendingItemKey]);

  if (!isOpen || !encounter) return null;

  // Early return if no character - prevents crashes during initialization
  if (!currentCharacter && !showHeroSelection) {
    console.warn('[ENCOUNTER] No character available and not in hero selection mode');
    return null;
  }

  const heroUidLocal = (h) => (h && (h.heroId || h.characterId)) || null;

  // Flee only makes sense for encounters that can hurt you; a non-combat encounter
  // leaves via its own "Move On" action. Also hidden once a multi-round fight resolves.
  const canFlee = encounterDealsDamage(encounter) && (!isMultiRound || (roundState && !roundState.isResolved));

  const getOutcomeBadgeClass = (tier) => {
    const classes = {
      'criticalSuccess': 'outcome-badge critical-success',
      'success': 'outcome-badge success',
      'failure': 'outcome-badge failure',
      'criticalFailure': 'outcome-badge critical-failure'
    };
    return classes[tier] || 'outcome-badge';
  };

  const getOutcomeLabel = (tier) => {
    const labels = {
      'criticalSuccess': 'Critical Success!',
      'success': 'Success',
      'failure': 'Failure',
      'criticalFailure': 'Critical Failure!'
    };
    return labels[tier] || tier;
  };

  // Friendly label for the FINAL encounter outcome (victory/defeat/escaped/stalemate/
  // fled), so a draw reads as a titlecased "Stalemate" instead of a raw shouted
  // "STALEMATE". Unknown values fall back to a titlecased form so nothing crashes.
  const getFinalOutcomeLabel = (outcome) => {
    const labels = {
      'victory': 'Victory',
      'defeat': 'Defeat',
      'escaped': 'Escaped',
      'fled': 'Fled',
      'stalemate': 'Stalemate'
    };
    return labels[outcome] || (outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : outcome);
  };

  const renderThreatBadge = () => encounterThreat && (
    <span
      className="encounter-threat-badge"
      style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
        color: encounterThreat.color, border: `1px solid ${encounterThreat.color}`,
        background: 'rgba(20,18,24,0.35)', textTransform: 'uppercase',
      }}
      title={`This fight is rated ${encounterThreat.label} for your party's current level`}
    >
      Threat: {encounterThreat.label}
    </span>
  );


  // Enemy Morale + Your Advantage read-out. Shown both at the START of the fight
  // (round 0 / before the first action) and inside each round result, so the player
  // sees the computed STARTING lean (usually near zero, sometimes +/-) rather than
  // first meeting it already reflecting a lost round 1.
  const renderCombatStatus = () => roundState && (
    <div className="combat-status">
      <div className="status-bar">
        <div className="status-label">Enemy Morale</div>
        <div className="status-bar-container">
          <div
            className="status-bar-fill morale"
            style={{ width: `${Math.max(0, roundState.enemyMorale)}%` }}
          />
        </div>
        <span className="status-value">{Math.max(0, roundState.enemyMorale)}%</span>
      </div>
      <div className="status-bar">
        <div className="status-label">Your Advantage</div>
        <div className="advantage-indicator">
          {roundState.playerAdvantage > 0 ? '+' : ''}{roundState.playerAdvantage}
        </div>
      </div>
    </div>
  );

  // Helper to ensure profile picture path is correct (legacy data support)
  const getProfilePicture = (path) => {
    if (!path) return '';
    if (path.startsWith('/assets/characters/')) return path;

    // Extract filename and replace extension with .webp
    const filename = path.split('/').pop().split('.')[0];
    return `/assets/characters/${filename}.webp`;
  };

  return (
    <ModalShell modalId="encounterAction" className="encounter-action-modal" ariaLabel="Encounter" usePortal style={{ maxWidth: '800px', width: '95%', padding: '14px 20px' }}>
        {showHeroSelection && !heroConfirmed && party && party.length > 1 ? (
          // Hero selection phase
          <>
            <h2 style={{ marginBottom: '2px', paddingBottom: '6px' }}>⚔️ {encounter.name}</h2>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Random Encounter
            </div>
            {encounterThreat && (
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>{renderThreatBadge()}</div>
            )}
            {encounter.image && (
              <ClickableImage
                src={encounter.image}
                alt={encounter.name}
                height={'clamp(200px, calc(100vh - 720px), 560px)'}
                maxWidth={'560px'}
                objectPosition={fullSizeImage ? 'center 60%' : 'center 35%'}
              />
            )}
            <div className="encounter-description" style={{ marginBottom: '10px', fontSize: '14px' }}>
              <p style={{ marginBottom: '0' }}>{encounter.description}</p>
            </div>

            <div className="hero-selection-section" style={{ marginTop: '10px' }}>
              <h3 style={{ marginBottom: '8px' }}>Choose Your Lead</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '10px' }}>
                {encounter.multiRound
                  ? 'The lead acts and rolls each round; everyone else supports, adding their bonus to the roll. If the lead falls, the healthiest hero steps in. (15% chance initiative fails)'
                  : 'Select hero to lead. (15% chance initiative fails)'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {party.map((hero, idx) => {
                  const defeated = hero.currentHP <= 0 || hero.isDefeated;
                  const heroSupport = encounter.multiRound && !defeated
                    ? heroSupportContribution(hero)
                    : 0;
                  return (
                  <div
                    key={idx}
                    onClick={defeated ? undefined : () => setSelectedHeroIndex(idx)}
                    style={{
                      padding: '10px 15px',
                      border: selectedHeroIndex === idx ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: defeated ? 'not-allowed' : 'pointer',
                      background: selectedHeroIndex === idx ? 'var(--primary-tint-10)' : 'var(--surface)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      ...(defeated ? { opacity: 0.4, filter: 'grayscale(70%)' } : {})
                    }}
                  >
                    {hero.profilePicture && (
                      <img
                        src={getProfilePicture(hero.profilePicture)}
                        alt={hero.heroName || hero.characterName}
                        loading="lazy"
                        width="44"
                        height="44"
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: defeated ? '2px solid var(--border)' : '2px solid var(--primary)'
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{hero.heroName || hero.characterName || 'Unknown'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {defeated ? '💀 Defeated' : (hero.heroClass || hero.characterClass || '')}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                        <div>HP: {Math.floor(hero.currentHP)}/{hero.maxHP} | Lvl {hero.level || hero.heroLevel || hero.characterLevel || 1}</div>
                        {heroSupport > 0 && selectedHeroIndex !== idx && (
                          <div style={{ fontSize: '12px', color: 'var(--state-success-strong)' }}>
                            Supports: +{heroSupport} to the lead's roll
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              <button
                onClick={() => handleHeroConfirm()}
                disabled={selectedHeroIndex == null}
                style={{
                  marginTop: '20px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  width: '100%'
                }}
                className="primary-button"
              >
                Confirm Hero
              </button>
            </div>

            <button className="modal-close-button" onClick={handleFleeBeforeCombat}>
              Flee Encounter
            </button>
          </>
        ) : isDefeated && result ? (
          // Defeat state
          <>
            <div className="defeat-header">
              <span className="defeat-icon">💀</span>
              <h2>Defeated!</h2>
            </div>

            <div className="defeat-message">
              <p>Your wounds have overcome you. You collapse, unable to continue the fight.</p>
              <p style={{ marginTop: '15px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                You need rest and healing before you can face more dangers.
              </p>
            </div>

            <div className="defeat-consequences">
              <h4>⚠️ Consequences of Defeat</h4>
              <ul>
                <li>Cannot engage in combat encounters</li>
                <li>Must find a safe place to rest</li>
                <li>Need healing or medical attention</li>
              </ul>
            </div>

            <button className="primary-button" onClick={handleContinue}>
              Retreat to Safety
            </button>
          </>
        ) : !result ? (
          <>
            <div className="encounter-header">
              <h2 style={{ marginBottom: '2px' }}>{encounter.name}</h2>
              <div style={{ fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Random Encounter
              </div>
              {(encounterThreat || (isMultiRound && roundState)) && (
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {renderThreatBadge()}
                  {isMultiRound && roundState && (
                    <div className="round-indicator">
                      Round {roundState.currentRound} of {roundState.maxRounds}
                    </div>
                  )}
                </div>
              )}
              {/* Encounter art is SQUARE (640x640), so a short full-width box only shows a
                  thin horizontal slice. Height is content-aware so the image fills whatever
                  the phase leaves free (keeping the overall modal height steady):
                  - mid-fight round result: compact banner (round data dominates)
                  - active multi-round fight: medium (enemy HP + morale + party strip below)
                  - single-round / non-combat: tall (little content below -> show the most art)
                  The centered maxWidth lets a tall box stay near-square instead of
                  side-cropping the square source. */}
              {encounter.image && !result && (
                <ClickableImage
                  src={encounter.image}
                  alt={encounter.name}
                  height={(currentRoundResult || roundResults.length > 0)
                    ? 'clamp(130px, calc(100vh - 745px), 460px)'
                    : isMultiRound
                      ? 'clamp(220px, calc(100vh - 685px), 640px)'
                      : encounterDealsDamage(encounter)
                        ? 'clamp(260px, calc(100vh - 470px), 700px)'
                        : 'clamp(280px, calc(100vh - 435px), 600px)'}
                  maxWidth={(currentRoundResult || roundResults.length > 0) ? undefined : '620px'}
                  objectPosition={fullSizeImage ? 'center 60%' : 'center 35%'}
                />
              )}
              {!encounter.image && <span className="encounter-icon">{encounter.icon}</span>}

              {/* Initiative result notification */}
              {initiativeResult && initiativeResult.message && (
                <div style={{
                  padding: '10px',
                  margin: '10px 0',
                  background: '#ff9800',
                  color: '#000',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  {initiativeResult.message}
                </div>
              )}

              {/* Player HP Bar — only for encounters that can actually deal damage.
                  A non-combat encounter (no dealsDamage / non-hostile) can never hurt the
                  hero, so an HP bar is noise there; the freed height goes to the art
                  instead (the image-height branch below grows to keep the modal height
                  steady). */}
              {currentCharacter && currentCharacter.maxHP && encounterDealsDamage(encounter) && (
                <div className="encounter-hp-bar">
                  <div className="hp-label">
                    <span>
                      {currentCharacter.heroName || currentCharacter.characterName}
                      {(currentCharacter.heroClass || currentCharacter.characterClass) && (
                        <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                          Level {currentCharacter.level || currentCharacter.heroLevel || currentCharacter.characterLevel || 1} {currentCharacter.heroClass || currentCharacter.characterClass}
                        </span>
                      )}
                    </span>
                    <span style={{ color: getHPStatus(currentCharacter.currentHP, currentCharacter.maxHP).color }}>
                      HP: {currentCharacter.currentHP}/{currentCharacter.maxHP}
                    </span>
                  </div>
                  <div className="hp-bar-container">
                    <div
                      className="hp-bar-fill"
                      style={{
                        width: `${(currentCharacter.currentHP / currentCharacter.maxHP) * 100}%`,
                        background: getHPStatus(currentCharacter.currentHP, currentCharacter.maxHP).color
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Party support strip (#43 Lead + Support) */}
              {isMultiRound && roundState && roundState.isTeamEncounter && (
                <div className="encounter-party-strip" style={{
                  display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
                  margin: '3px 0', fontSize: '12px'
                }}>
                  {roundState.party.map((hero, idx) => {
                    if (idx === roundState.leadIndex) return null;
                    const down = hero.currentHP <= 0 || hero.isDefeated;
                    return (
                      <span key={idx} style={{
                        padding: '2px 8px', borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        opacity: down ? 0.5 : 1
                      }}>
                        {hero.heroName || hero.characterName}{' '}
                        {down
                          ? '💀 down'
                          : <>({Math.floor(hero.currentHP)}/{hero.maxHP} HP) supports +{heroSupportContribution(hero)}</>}
                      </span>
                    );
                  })}
                  {roundState.supportBonus > 0 && (
                    <span style={{ color: 'var(--state-success-strong)', fontWeight: 'bold' }}>
                      Party support: +{roundState.supportBonus} to every roll
                    </span>
                  )}
                </div>
              )}

              {/* Enemy HP Bar */}
              {isMultiRound && roundState && roundState.enemyMaxHP && (
                <div className="encounter-hp-bar enemy-hp-bar">
                  <div className="hp-label">
                    <span>{encounter.name}</span>
                    <span style={{ color: roundState.enemyCurrentHP <= roundState.enemyMaxHP * 0.3 ? 'var(--state-danger)' : 'var(--state-warning)' }}>
                      {roundState.enemyCurrentHP} / {roundState.enemyMaxHP} HP
                    </span>
                  </div>
                  <div className="hp-bar-container">
                    <div
                      className="hp-bar-fill"
                      style={{
                        width: `${(roundState.enemyCurrentHP / roundState.enemyMaxHP) * 100}%`,
                        background: roundState.enemyCurrentHP <= roundState.enemyMaxHP * 0.3 ? 'var(--state-danger)' : 'var(--state-warning)'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {isDefeated && !result ? (
              // Character is defeated mid-encounter
              <>
                <div className="defeat-warning">
                  <h3 style={{ color: 'var(--state-danger)', margin: '0 0 10px 0' }}>💀 You are defeated!</h3>
                  <p>You cannot continue fighting in your current condition.</p>
                  <button className="primary-button" onClick={handleRetreatDefeated} style={{ marginTop: '15px' }}>
                    Retreat from Combat
                  </button>
                </div>
              </>
            ) : currentRoundResult ? (
              // Show current round result before continuing
              <>
                {currentRoundResult.rollResult && (
                  <div className="dice-result">
                    <span className="dice-icon">🎲</span>
                    <span className="roll-total">{currentRoundResult.rollResult.total}</span>
                    <span className="roll-breakdown">
                      (d20: {currentRoundResult.rollResult.naturalRoll}
                      {' + modifier: '}{currentRoundResult.rollResult.modifier - (currentRoundResult.supportBonus || 0)}
                      {currentRoundResult.supportBonus > 0 && <> + support: {currentRoundResult.supportBonus}</>})
                    </span>
                    <span className={getOutcomeBadgeClass(currentRoundResult.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                      {getOutcomeLabel(currentRoundResult.outcomeTier)}
                    </span>
                  </div>
                )}

                {currentRoundResult.leadSwap && (
                  <div style={{
                    padding: '10px', margin: '10px 0', background: 'var(--state-warning)',
                    color: '#000', borderRadius: '4px', fontWeight: 'bold', textAlign: 'center'
                  }}>
                    💀 {currentRoundResult.leadSwap.downedHero} is down! {currentRoundResult.leadSwap.newLead} takes the lead!
                  </div>
                )}

                {!currentRoundResult.rollResult && (
                  <div className={getOutcomeBadgeClass(currentRoundResult.outcomeTier)}>
                    {getOutcomeLabel(currentRoundResult.outcomeTier)}
                  </div>
                )}

                <div className="ai-narration">
                  {currentRoundResult.narration}
                </div>

                <div className="combat-damage-summary">
                  {currentRoundResult.enemyDamage > 0 && (
                    <div className="enemy-damage-section">
                      <h4>⚔️ Damage Dealt</h4>
                      <div className="damage-amount" style={{ color: 'var(--state-warning)' }}>{currentRoundResult.enemyDamage} HP</div>
                      <p className="damage-description">You strike the {encounter.name.toLowerCase()}!</p>
                    </div>
                  )}

                  {currentRoundResult.hpDamage > 0 && (
                    <div className="player-damage-section">
                      <h4>🩸 Damage Taken</h4>
                      <div className="damage-amount" style={{ color: 'var(--state-danger)' }}>{currentRoundResult.hpDamage} HP</div>
                      <p className="damage-description">The {encounter.name.toLowerCase()} strikes back!</p>
                      {(currentRoundResult.partyDamage || []).some((d) => d.role === 'support') && (
                        <p className="damage-description">
                          The blow splashes into the party:{' '}
                          {currentRoundResult.partyDamage
                            .filter((d) => d.role === 'support')
                            .map((d) => `${roundState.party[d.heroIndex]?.heroName || roundState.party[d.heroIndex]?.characterName || 'ally'} -${d.amount} HP`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {renderCombatStatus()}

                <div className="round-action-buttons">
                  <button className="primary-button fight-button" onClick={handleFightAgain}>
                    ⚔️ Fight!
                  </button>
                  <button className="secondary-button" onClick={handleNextRound}>
                    Choose Action →
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="encounter-description">{encounter.description}</p>

                {/* In-combat item-use result banner (persists until the next action/round). */}
                {itemUseResult && (
                  <div style={{
                    padding: '10px 14px',
                    margin: '10px 0',
                    background: 'rgba(39, 174, 96, 0.12)',
                    border: '1px solid #27ae60',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    {itemUseResult.isSpell ? (
                      <span>
                        {itemUseResult.itemName} sears the enemy for{' '}
                        <strong style={{ color: '#e67e22' }}>{itemUseResult.damage} damage</strong>.
                      </span>
                    ) : (
                      <span>
                        {itemUseResult.itemName} restored{' '}
                        <strong style={{ color: '#27ae60' }}>{itemUseResult.healed} HP</strong>{' '}
                        to {itemUseResult.heroName} (rolled {itemUseResult.rolled}).
                      </span>
                    )}
                    {itemUseResult.spentRound && (
                      <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {itemUseResult.isSpell
                          ? "Loosing the scroll spent the party's action this round."
                          : "Tending wounds spent the party's action this round."}
                      </span>
                    )}
                  </div>
                )}

                {isMultiRound && renderCombatStatus()}

                {roundResults.length > 0 && (
                  <div className="round-history">
                    <h4>Previous Rounds:</h4>
                    {roundResults.map((r, idx) => (
                      <div key={idx} className="round-summary">
                        <strong>Round {r.round}:</strong> {r.result.outcomeTier}
                      </div>
                    ))}
                  </div>
                )}

                <div className="encounter-actions">
                  <h3>What do you do?</h3>
                  <div className="action-buttons">
                    {availableActions.map((action) => (
                      <button
                        key={action.label}
                        className="action-button"
                        onClick={() => handleAction(action)}
                        disabled={isResolving}
                      >
                        <div className="action-header">
                          <strong>{action.label}</strong>
                          {action.skill && (
                            <span className="action-skill">({action.skill})</span>
                          )}
                        </div>
                        <p className="action-description">{action.description}</p>
                      </button>
                    ))}
                  </div>

                  {/* Flee button: the single flee affordance, shown only for encounters
                      that can actually deal damage (you don't "flee" a minstrel — a
                      non-combat encounter's own "Move On" action handles leaving). Routes
                      through handleFleeEncounter, so a successful flee sets outcome:'fled'
                      and disengages via onResolve. */}
                  {/* Use a healing consumable mid-fight. In a multi-round fight this
                      spends the round (the heal is the party's action, no attack); a
                      single-round fight just heals + consumes the item. Shown only when
                      the party carries a usable consumable AND someone can be healed.
                      Item + Flee share one row (with tooltips carrying the fine print)
                      so the fight fits the viewport without scrolling. */}
                  {(canUseItemInCombat || canFlee) && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      {canUseItemInCombat && (
                        <button
                          className="secondary-button"
                          onClick={() => { setPendingItemKey(null); setShowItemPicker(true); }}
                          disabled={isResolving}
                          title={isMultiRound ? 'Using an item spends your action this round' : undefined}
                          style={{ flex: 1 }}
                        >
                          🎒 Use Item
                        </button>
                      )}
                      {canFlee && (
                        <button
                          className="secondary-button"
                          onClick={handleFleeEncounter}
                          disabled={isResolving}
                          title="70% success; failure risks damage and gold loss"
                          style={{ flex: 1 }}
                        >
                          🏃 Attempt to Flee (70%)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

          </>
        ) : (
          <>
            <div className="encounter-result">
              <div className="result-header">
                {/* Show the real encounter art (as a small thumbnail) in the result view too,
                    not just the intro. The emoji icon is only a fallback for encounters that
                    have no image, so an encounter like Earthquake (which has earthquake.webp)
                    no longer drops to its emoji once the outcome is shown. */}
                {encounter.image ? (
                  <img
                    src={encounter.image}
                    alt={encounter.name}
                    style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                  />
                ) : (
                  <span className="encounter-icon">{encounter.icon}</span>
                )}
                <h2>{encounter.name}</h2>
              </div>

              {result.rollResult && (
                <div className="dice-result">
                  <span className="dice-icon">🎲</span>
                  <span className="roll-total">{result.rollResult.total}</span>
                  <span className="roll-breakdown">
                    (d20: {result.rollResult.naturalRoll}
                    {' + modifier: '}{result.rollResult.modifier - (result.supportBonus || 0)}
                    {result.supportBonus > 0 && <> + support: {result.supportBonus}</>})
                  </span>
                  <span className={getOutcomeBadgeClass(result.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                    {getOutcomeLabel(result.outcomeTier)}
                  </span>
                </div>
              )}

              {!result.rollResult && (
                <div className={getOutcomeBadgeClass(result.outcomeTier)}>
                  {getOutcomeLabel(result.outcomeTier)}
                </div>
              )}

              <div className="ai-narration" style={{ whiteSpace: 'pre-line' }}>
                {result.narration}
              </div>

              {result.outcome && (
                <div className="outcome-summary">
                  <strong>Final Outcome:</strong> {getFinalOutcomeLabel(result.outcome)}
                </div>
              )}

              {/* Make a loss legible: on a defeat or stalemate, say WHY the fight did not
                  end in victory (the enemy was still standing) rather than leaving a bare
                  "DEFEAT" badge. Only shown for combats that tracked enemy HP. */}
              {(result.outcome === 'defeat' || result.outcome === 'stalemate') &&
                result.enemyMaxHP > 0 && (
                <div className="outcome-reason" style={{ marginTop: '6px', opacity: 0.85, fontSize: '0.92em' }}>
                  {result.outcome === 'defeat'
                    ? `Your momentum broke before you could finish it. ${encounter.name} still held the field (${result.enemyCurrentHP}/${result.enemyMaxHP} HP).`
                    : `Neither side could force the end. ${encounter.name} was still standing (${result.enemyCurrentHP}/${result.enemyMaxHP} HP). No spoils, but you keep your gear.`}
                </div>
              )}

              {result.hpDamage > 0 && (
                <div className="hp-damage-section">
                  <h4>💔 Health Impact</h4>
                  <div className="damage-amount">-{result.hpDamage} HP</div>
                  {result.damageDescription && (
                    <p className="damage-description">{result.damageDescription}</p>
                  )}
                </div>
              )}

              {result.rewards && (
                <div className="rewards-section">
                  <h4>⭐ Rewards</h4>
                  <ul>
                    {result.rewards.xp > 0 && <li>+{result.rewards.xp} XP</li>}
                    {result.rewards.gold > 0 && <li>+{result.rewards.gold} gold</li>}
                    {result.rewards.items && result.rewards.items.map((item, idx) => (
                      <li key={idx}>{ITEM_CATALOG[item]?.name || item.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.penalties && (
                (() => {
                  // Handle both array and object formats for penalties
                  const penaltyMessages = Array.isArray(result.penalties)
                    ? result.penalties
                    : (result.penalties.messages || []);
                  return penaltyMessages.length > 0 ? (
                    <div className="penalties-section">
                      <h4>⚠️ Consequences</h4>
                      <ul>
                        {penaltyMessages.map((penalty, idx) => (
                          <li key={idx}>{penalty}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()
              )}

              {result.affectedFactions && (
                <div className="faction-changes">
                  <h4>📜 Reputation Changes</h4>
                  <ul>
                    {Object.entries(result.affectedFactions).map(([faction, change]) => (
                      <li key={faction}>
                        {faction}: {change > 0 ? '+' : ''}{change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button className="primary-button" onClick={handleContinue}>
              Continue Journey
            </button>
          </>
        )}

        {/* In-combat item tray: an INLINE panel below the action buttons (was a
            fixed zIndex-4000 modal-in-a-modal). Two steps: choose a consumable, then a
            target hero (full-HP / defeated heroes disabled). Reuses consumeHealingItem. */}
        {showItemPicker && (
          <div
            ref={itemTrayRef}
            aria-label="Use an item"
            style={{
              marginTop: '10px',
              padding: '14px',
              background: 'var(--surface)',
              border: '1px solid #27ae60',
              borderRadius: '10px'
            }}
          >
              {!pendingItemKey ? (
                <>
                  <h3 style={{ margin: '0 0 12px 0', color: '#27ae60' }}>Use which item?</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {usableConsumables.map((it) => {
                      // Show what the item does before the player commits: heals show a
                      // "Restores:" line, offensive scrolls a "Deals:" damage line.
                      const effectLine = it.effect === 'spell'
                        ? (describeSpellDamage(ITEM_CATALOG[it.key]?.damage) && `Deals ${describeSpellDamage(ITEM_CATALOG[it.key]?.damage)}`)
                        : null;
                      return (
                        <button
                          key={it.key}
                          className="secondary-button"
                          onClick={() => setPendingItemKey(it.key)}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '2px', width: '100%' }}
                        >
                          <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span>{it.name}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>x{it.quantity}</span>
                          </span>
                          {effectLine && (
                            <span style={{ fontSize: '0.78rem', color: '#e67e22', textAlign: 'left' }}>{effectLine}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : ITEM_CATALOG[pendingItemKey]?.effect === 'spell' ? (
                // Offensive spell scroll: no hero to pick (the target is the enemy). Confirm
                // and fire; applyItemDamageRound spends the round and resolves the fight.
                <>
                  <h3 style={{ margin: '0 0 12px 0', color: '#e67e22' }}>
                    Loose {ITEM_CATALOG[pendingItemKey]?.name || 'the scroll'} at the enemy?
                  </h3>
                  <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Deals {describeSpellDamage(ITEM_CATALOG[pendingItemKey]?.damage) || 'damage'} to the enemy.
                    Using it spends the party's action this round.
                  </p>
                  <button
                    onClick={() => handleUseSpellItemInCombat(pendingItemKey)}
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '12px 14px',
                      width: '100%',
                      background: '#e67e22',
                      border: '1px solid #e67e22',
                      borderRadius: '6px',
                      color: '#fff',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🔥 Fire at the enemy
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setPendingItemKey(null)}
                    style={{ marginTop: '10px', width: '100%' }}
                  >
                    ← Back
                  </button>
                </>
              ) : (
                <>
                  <h3 style={{ margin: '0 0 12px 0', color: '#27ae60' }}>
                    Use {ITEM_CATALOG[pendingItemKey]?.name || 'item'} on...
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {combatParty.map((hero, idx) => {
                      const defeated = hero.isDefeated || hero.currentHP <= 0;
                      const atFull = hero.currentHP >= hero.maxHP;
                      const disabled = defeated || atFull;
                      const hpStatus = getHPStatus(hero.currentHP, hero.maxHP);
                      return (
                        <button
                          key={heroUidLocal(hero) || idx}
                          onClick={() => { if (!disabled) handleUseItemInCombat(pendingItemKey, idx); }}
                          disabled={disabled}
                          title={defeated ? 'Defeated' : (atFull ? 'Already at full health' : `Heal ${hero.heroName || hero.characterName}`)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            color: 'var(--text)',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1
                          }}
                        >
                          <span style={{ fontWeight: 'bold' }}>{hero.heroName || hero.characterName || 'Unknown'}</span>
                          <span style={{ color: hpStatus.color, fontSize: '0.85rem' }}>
                            {Math.floor(hero.currentHP)} / {hero.maxHP} HP
                            {defeated ? ' · Defeated' : (atFull ? ' · Already at full health' : '')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setPendingItemKey(null)}
                    style={{ marginTop: '10px', width: '100%' }}
                  >
                    ← Back
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowItemPicker(false); setPendingItemKey(null); }}
                style={{
                  marginTop: '10px',
                  padding: '8px 14px',
                  width: '100%',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>
          </div>
        )}
    </ModalShell>
  );
};

export default EncounterActionModal;
