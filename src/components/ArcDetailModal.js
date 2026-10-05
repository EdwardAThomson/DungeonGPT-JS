// ArcDetailModal: the arc detail + chapter picker for the New Game Ready-Made
// tab (#73 phase 1, docs/ARC_CARDS_AND_NARRATIVE_PLAN.md §3/§5). One modal per
// ARC: header (art, arc name, level span), the chapter ladder as a picker, and
// the structure (milestones, goal, tone) of ONLY the selected chapter. Chapter
// titles + level bands + teases are the most any unselected chapter reveals;
// milestones never appear for a chapter the player has not deliberately
// selected (decision 1: no structural spoilers).
//
// The picker absorbs the old Seasoned Parties / Legendary Campaigns sections
// (decision 3): any startable chapter can be applied directly as a fresh New
// Game, with the same honest level-fit copy those sections carried.
//
// STUB-TOLERANT BY CONSTRUCTION (production crash, guest mode 2026-07-07: the
// old detail modal read t.settings.shortDescription on a shop-window teaser
// stub, which has NO settings, and threw). Every settings read here goes
// through `settings = t.settings || {}`; the description falls back to the
// stub's top-level shortDescription; the goal, milestone and tone-dial rows
// render only when the underlying data exists. A teaser/comingSoon chapter
// shows name, subtitle, art, level band, blurb and lock state, nothing else.

import React from 'react';
import { isOpeningAccessible } from '../game/campaignChain';
import { scaleMilestoneXP } from '../game/xpScaling';

const MILESTONE_TYPE_LABEL = {
    item: 'Find',
    combat: 'Fight',
    location: 'Reach',
    talk: 'Talk',
    narrative: 'Story',
};

const GATE_LABEL = { member: 'Members', premium: 'Premium', elite: 'Elite' };

const bandLabel = (levelRange) =>
    Array.isArray(levelRange) ? `Lv ${levelRange[0]}-${levelRange[1]}` : '';

/**
 * Status chip copy for a ladder row. Signed-out teaser rows say "sign in to
 * play" (ruling B: for a free-gated stub the fix IS signing in, never a tier
 * upsell); signed-in teaser rows invite the self-heal retry.
 */
export const chapterChip = (chapter, { isSignedIn, isRetrying } = {}) => {
    if (chapter.comingSoon) return { label: 'Coming soon', kind: 'coming-soon' };
    if (chapter.locked) return { label: `🔒 ${GATE_LABEL[chapter.gateTier] || 'Members'}`, kind: 'locked' };
    if (isRetrying) return { label: 'Loading…', kind: 'loading' };
    if (chapter.teaser) {
        return isSignedIn
            ? { label: 'Tap to load', kind: 'teaser' }
            : { label: 'Sign in to play', kind: 'teaser' };
    }
    return { label: bandLabel(chapter.levelRange), kind: 'startable' };
};

/**
 * Honest level-fit line for a startable higher-chapter pick: same truth the
 * old Seasoned/Legendary sections told, via isOpeningAccessible.
 */
export const levelFitCopy = (template, partyMaxLevel) => {
    if (!template || (template.tier || 1) < 2 || !Array.isArray(template.levelRange)) return null;
    const effectiveLevel = partyMaxLevel || 1; // no roster yet = a fresh Lv 1 party
    if (effectiveLevel >= template.levelRange[0]) return null;
    const band = bandLabel(template.levelRange);
    return isOpeningAccessible(template.settings?.milestones, effectiveLevel)
        ? `This chapter is made for ${band}; your party would start around Lv ${effectiveLevel}. The opening steps are within reach, and rumours in nearby towns will strengthen you for the deeper, level-gated stretches.`
        : `This chapter is made for ${band}; your party would start around Lv ${effectiveLevel}. The opening itself is level-gated; a fresh party will find it brutal, but you may still try.`;
};

const ArcDetailModal = ({
    arc,                    // derived arc object (getStoryArcs shape)
    selectedChapterId,      // which ladder row is expanded
    onSelectChapter,        // (chapterId) => void
    selectedTemplateId,     // NewGame's applied template id (marks "selected")
    partyMaxLevel = 0,
    isSignedIn = false,
    retryingChapterId = null,
    notice = null,          // in-modal notice line (teaser copy, lock copy)
    onTeaserChapterClick,   // (chapter) => void: self-heal / sign-in copy
    onLockedChapterClick,   // (chapter) => void: tier explanation
    onApplyChapter,         // (template) => void: applyTemplate + close
    onSubmit,               // () => void: Next: Select Heroes for the applied chapter
    onClose,
}) => {
    if (!arc) return null;

    const selectedChapter =
        arc.chapters.find((c) => c.id === selectedChapterId) || arc.chapters[0];
    const t = selectedChapter?.template || {};
    const settings = t.settings || {}; // stubs carry no settings: never read t.settings directly
    const ms = Array.isArray(settings.milestones) ? settings.milestones : [];
    const description = settings.shortDescription || t.shortDescription || t.description || '';
    const toneTags = t.settings
        ? [
            { label: 'Grimness', value: settings.grimnessLevel },
            { label: 'Darkness', value: settings.darknessLevel },
            { label: 'Magic', value: settings.magicLevel },
            { label: 'Technology', value: settings.technologyLevel },
            { label: 'Narration', value: settings.responseVerbosity },
        ].filter((tag) => tag.value)
        : [];
    const isApplied = selectedChapter && selectedTemplateId === selectedChapter.id;
    const fitCopy = selectedChapter?.startable ? levelFitCopy(t, partyMaxLevel) : null;

    const handleRowClick = (chapter) => {
        if (chapter.comingSoon) return;
        onSelectChapter?.(chapter.id);
        if (chapter.locked) onLockedChapterClick?.(chapter);
        else if (chapter.teaser) onTeaserChapterClick?.(chapter);
    };

    const footerButton = () => {
        if (!selectedChapter) return null;
        if (selectedChapter.comingSoon) {
            return <button type="button" className="btn btn-primary" disabled>Coming soon</button>;
        }
        if (selectedChapter.locked) {
            // Members is live (octonion.io billing since 2026-07-22): link to the Membership
            // page. Premium and Elite are still roadmap tiers, so those stay disabled.
            const tier = selectedChapter.gateTier || 'member';
            if (tier === 'member') {
                return <a className="btn btn-primary" href="/membership">Unlock with Members</a>;
            }
            return (
                <button type="button" className="btn btn-primary" disabled title={`${GATE_LABEL[tier]} unlock is coming soon`}>
                    {GATE_LABEL[tier]} (coming soon)
                </button>
            );
        }
        if (selectedChapter.teaser) {
            const retrying = retryingChapterId === selectedChapter.id;
            return (
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onTeaserChapterClick?.(selectedChapter)}
                    disabled={retrying || !isSignedIn}
                >
                    {retrying ? 'Loading your content…' : isSignedIn ? 'Load My Content' : 'Sign in to play'}
                </button>
            );
        }
        if (isApplied) {
            return <button type="button" className="btn btn-primary" onClick={() => onSubmit?.()}>Next: Select Heroes</button>;
        }
        return <button type="button" className="btn btn-primary" onClick={() => onApplyChapter?.(t)}>Begin This Campaign</button>;
    };

    // Total XP across the chapter's milestones and their encounters.
    let totalXp = 0;
    for (const m of ms) {
        // Tier-scaled, matching what the game awards (xpScaling.js).
        if (m.rewards?.xp) totalXp += scaleMilestoneXP(m.rewards.xp, t);
        if (m.encounter?.rewards?.xp) totalXp += scaleMilestoneXP(m.encounter.rewards.xp, t);
    }

    return (
        <div className="modal-overlay arc-modal-overlay" onClick={onClose}>
            <div className="arc-modal" role="dialog" aria-modal="true" aria-label={`${arc.name} details`} onClick={(e) => e.stopPropagation()}>
                {/* Header: arc identity over its art */}
                <div className="arc-modal-hero" style={{ backgroundImage: `linear-gradient(180deg, rgba(14,13,19,0) 30%, rgba(14,13,19,.92) 100%), url(${arc.art})` }}>
                    <button type="button" className="arc-modal-close" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                    <div className="arc-modal-title">
                        <h2>{arc.name}</h2>
                        <span>{arc.chapterCount} {arc.chapterCount === 1 ? 'chapter' : 'chapters'} · Lv {arc.levelSpan[0]}-{arc.levelSpan[1]}</span>
                    </div>
                </div>

                <div className="arc-modal-body">
                    {arc.tagline && <p className="arc-modal-tagline">{arc.tagline}</p>}

                    {/* Chapter ladder (the picker) */}
                    <div className="arc-modal-section" data-testid="arc-chapter-ladder">
                        <h3 className="arc-modal-label">Chapters</h3>
                        <ol className="arc-ladder">
                            {arc.chapters.map((chapter, i) => {
                                const chip = chapterChip(chapter, {
                                    isSignedIn,
                                    isRetrying: retryingChapterId === chapter.id,
                                });
                                const isRowSelected = selectedChapter && chapter.id === selectedChapter.id;
                                return (
                                    <li
                                        key={chapter.id}
                                        data-testid={`arc-chapter-row-${chapter.id}`}
                                        onClick={() => handleRowClick(chapter)}
                                        className={`arc-ladder-row${isRowSelected ? ' on' : ''}${chapter.comingSoon ? ' soon' : ''}${chapter.locked ? ' locked' : ''}`}
                                    >
                                        <span className="num">{i + 1}</span>
                                        {/* The level band shows under the title only when the chip is
                                            saying something else (locked, coming soon, sign in). */}
                                        <span className="text">
                                            <b>{chapter.subtitle}</b>
                                            {chip.kind !== 'startable' && <small>{bandLabel(chapter.levelRange)}</small>}
                                        </span>
                                        <span className={`chip ${chip.kind}`}>{chip.label}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {/* Selected chapter structure: the ONLY chapter whose insides show */}
                    {selectedChapter && (
                        <div className="arc-modal-section" data-testid="arc-selected-chapter">
                            <div className="arc-chapter-head">
                                <h3>{selectedChapter.subtitle}</h3>
                                <span>{bandLabel(selectedChapter.levelRange)}</span>
                            </div>

                            {description && <p className="arc-modal-desc">{description}</p>}

                            {settings.campaignGoal && (
                                <div className="arc-goal">
                                    <h4 className="arc-modal-label">Campaign Goal</h4>
                                    <p>{settings.campaignGoal}</p>
                                </div>
                            )}

                            {ms.length > 0 && (
                                <div className="arc-milestones">
                                    <h4 className="arc-modal-label">Quest Milestones ({ms.length})</h4>
                                    <ol>
                                        {ms.map((m, i) => (
                                            <li key={i}>
                                                <span className={`mtype ${m.type}`}>{MILESTONE_TYPE_LABEL[m.type] || m.type}</span>
                                                <span className="mtext">
                                                    {m.text}
                                                    <small>
                                                        {m.location || ''}
                                                        {m.requires?.length > 0 ? `${m.location ? ' · ' : ''}after #${m.requires.join(', #')}` : ''}
                                                        {m.rewards ? `${m.location || m.requires?.length ? ' · ' : ''}${scaleMilestoneXP(m.rewards.xp, t)} XP, ${m.rewards.gold} gold` : ''}
                                                    </small>
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            {ms.length > 0 && totalXp > 0 && (
                                <dl className="arc-stats">
                                    <div><dt>Total XP</dt><dd>{totalXp}</dd></div>
                                    <div><dt>Milestones</dt><dd>{ms.length}</dd></div>
                                    <div><dt>Boss fights</dt><dd>{ms.filter((m) => m.type === 'combat').length}</dd></div>
                                </dl>
                            )}

                            {toneTags.length > 0 && (
                                <div className="arc-tones">
                                    {toneTags.map((tag, i) => (
                                        <span key={i}><b>{tag.label}</b> {tag.value}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Honest level-fit note for the chapter being started */}
                    {fitCopy && (
                        <div className="arc-modal-note warning" data-testid="arc-level-fit">
                            <b>Seasoned chapter.</b> {fitCopy}
                        </div>
                    )}

                    {/* In-modal notice (teaser sign-in copy, retry outcome, lock explanation) */}
                    {notice && <div className="arc-modal-note" data-testid="arc-modal-notice">{notice}</div>}
                </div>

                <div className="arc-modal-foot">
                    <button type="button" className="btn btn-ghost" onClick={onClose}>{isApplied ? 'Back' : 'Cancel'}</button>
                    {footerButton()}
                </div>
            </div>
        </div>
    );
};

export default ArcDetailModal;
