import React from 'react';
import { calculateMaxHP, getHPStatus } from '../utils/healthSystem';
import { getLevelProgress } from '../utils/progressionSystem';
import { resolveProfilePicture } from '../utils/assetHelper';
import { getRarityColor } from '../utils/inventorySystem';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';
import {
    EQUIP_SLOTS,
    equipItem,
    unequipSlot,
    getEquippedItem,
    getEquippableItemsForSlot,
    getEquippedBonuses,
    parseBonus
} from '../game/equipment';

const SLOT_LABELS = { weapon: 'Weapon', armor: 'Armour', accessory: 'Accessory' };

// Which character stat each slot's bonus actually modifies (the bonus string
// itself only carries a number, so the affected stat comes from the slot).
const STAT_FOR_SLOT = { weapon: 'attack', armor: 'armour soak', accessory: 'to checks' };

// Format an item's bonus as "+N <stat>" for a given slot, e.g. "+1 attack".
// Accessories with no explicit bonus still grant the default +1 to checks.
const formatSlotBonus = (slot, bonusStr) => {
    let n = parseBonus(bonusStr);
    if (slot === 'accessory' && !n) n = 1;
    if (!n) return null;
    return `${n >= 0 ? '+' : ''}${n} ${STAT_FOR_SLOT[slot] || ''}`.trim();
};

const HeroModal = () => {
    const { data, close, open } = useModal('hero');
    const hero = data?.hero;
    const onHeroUpdate = data?.onHeroUpdate;
    if (!hero) return null;

    // Equip/unequip produces a new hero. Propagate it to the party state via the
    // caller's update callback, and refresh this modal's own view by re-opening
    // it with the updated hero (keeps the callback wired up).
    const applyHeroChange = (updatedHero) => {
        if (updatedHero === hero) return;
        if (onHeroUpdate) onHeroUpdate(updatedHero);
        open({ ...data, hero: updatedHero });
    };

    const equipBonuses = getEquippedBonuses(hero);

    // Gender emoji - Male or Female only
    const getGenderEmoji = (gender) => {
        const g = (gender || '').toLowerCase();
        if (g === 'female' || g.includes('female')) return '♀️';
        return '♂️'; // Default to male
    };

    const heroRace = hero.characterRace || hero.race || hero.heroRace || '';
    const heroClass = hero.characterClass || hero.heroClass || '';
    const heroLevel = hero.level || hero.heroLevel || hero.characterLevel || 1;
    const heroGender = hero.heroGender || hero.characterGender || hero.gender || 'Male';

    return (
        <ModalShell modalId="hero" className="hero-details-modal" ariaLabel="Hero Details" style={{ maxWidth: '700px', width: '90%' }}>
                {/* Header: portrait, identity + alignment, and the vitals (HP, XP) on one line,
                    so the sheet fits without scrolling. */}
                {(() => {
                    const maxHP = hero.stats ? (hero.maxHP || calculateMaxHP(hero)) : null;
                    const currentHP = maxHP != null ? (hero.currentHP ?? maxHP) : null;
                    const status = maxHP != null ? getHPStatus(currentHP, maxHP) : null;
                    const xp = hero.xp || 0;
                    const progress = getLevelProgress(xp);
                    return (
                        <div className="hero-sheet-head">
                            {hero.profilePicture && (
                                <img
                                    src={resolveProfilePicture(hero.profilePicture)}
                                    alt={`${hero.heroName}'s profile`}
                                    className="hero-sheet-pic"
                                />
                            )}
                            <div className="hero-sheet-id">
                                <h2>{hero.characterName || hero.heroName}</h2>
                                <p className="hero-subtitle">
                                    {getGenderEmoji(heroGender)} Level {heroLevel} {heroRace} {heroClass}
                                </p>
                                {hero.heroAlignment && <span className="hero-sheet-chip">{hero.heroAlignment}</span>}
                            </div>
                            <div className="hero-sheet-vitals">
                                {status && (
                                    <div className="hero-vital">
                                        <div className="hero-vital-row">
                                            <span className="hero-vital-label">HP</span>
                                            <span style={{ color: status.color, fontWeight: 700 }}>{currentHP}/{maxHP}</span>
                                        </div>
                                        <div className="hero-hp-bar"><div className="hero-hp-fill" style={{ width: `${(currentHP / maxHP) * 100}%`, background: status.color }} /></div>
                                        <small style={{ color: status.color }}>{status.description}</small>
                                    </div>
                                )}
                                <div className="hero-vital">
                                    <div className="hero-vital-row">
                                        <span className="hero-vital-label">XP</span>
                                        <span>{xp}</span>
                                    </div>
                                    {!progress.isMaxLevel ? (
                                        <>
                                            <div className="hero-hp-bar"><div className="hero-xp-fill" style={{ width: `${progress.percentage}%` }} /></div>
                                            <small>{progress.current} / {progress.required} to next level</small>
                                        </>
                                    ) : (
                                        <small>Maximum level reached</small>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="modal-section scrollable-modal-section">
                    <h4>Ability scores</h4>
                    {hero.stats && (
                        <div className="stats-grid-modal">
                            {Object.entries(hero.stats).map(([stat, value]) => (
                                <div key={stat} className="stat-item-modal">
                                    <span className="stat-label">{stat.substring(0, 3).toUpperCase()}</span>
                                    <span className="stat-value">{value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-section">
                    <h4>Equipment</h4>
                    <div className="hero-equipment-slots">
                        {EQUIP_SLOTS.map((slot) => {
                            const equipped = getEquippedItem(hero, slot);
                            const options = getEquippableItemsForSlot(hero, slot);
                            return (
                                <div key={slot} className="hero-equip-slot">
                                    <span className="hero-equip-slot-label">{SLOT_LABELS[slot]}</span>
                                    <div className="hero-equip-slot-body">
                                        {equipped ? (
                                            <>
                                                <span className="hero-equip-item-name">
                                                    <span style={{ color: getRarityColor(equipped.rarity) }}>{equipped.name || equipped.key}</span>
                                                    {formatSlotBonus(slot, equipped.bonus) ? (
                                                        <span className="hero-equip-bonus"> ({formatSlotBonus(slot, equipped.bonus)})</span>
                                                    ) : null}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="hero-equip-button"
                                                    onClick={() => applyHeroChange(unequipSlot(hero, slot))}
                                                >
                                                    Unequip
                                                </button>
                                            </>
                                        ) : options.length > 0 ? (
                                            <select
                                                className="hero-equip-select"
                                                value=""
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        applyHeroChange(equipItem(hero, e.target.value));
                                                    }
                                                }}
                                            >
                                                <option value="">Equip...</option>
                                                {options.map((item) => (
                                                    <option key={item.key} value={item.key}>
                                                        {item.name || item.key}
                                                        {formatSlotBonus(slot, item.bonus) ? ` (${formatSlotBonus(slot, item.bonus)})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="hero-equip-empty">Empty</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {(equipBonuses.attack || equipBonuses.defense || equipBonuses.misc) ? (
                        <p className="hero-equip-summary">
                            {equipBonuses.attack ? `+${equipBonuses.attack} attack ` : ''}
                            {equipBonuses.defense ? `${parseBonus(equipBonuses.defense) >= 0 ? '+' : ''}${equipBonuses.defense} armour soak ` : ''}
                            {equipBonuses.misc ? `+${equipBonuses.misc} to checks` : ''}
                        </p>
                    ) : null}
                </div>

                {hero.heroBackground && (
                    <div className="modal-section scrollable-modal-section">
                        <h4>Background</h4>
                        <div className="hero-background-text">
                            {hero.heroBackground}
                        </div>
                    </div>
                )}

                <button className="modal-close-button" onClick={close} style={{ marginTop: '14px' }}>
                    Close
                </button>
        </ModalShell>
    );
};

export default HeroModal;
