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

const MILESTONE_TYPE_ICON = {
    item: '📦',
    combat: '⚔️',
    location: '📍',
    talk: '🗣️',
    narrative: '💬',
};

const TIER_COLORS = { 1: '#4caf50', 2: '#ff9800', 3: '#f44336' };

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
            return (
                <button disabled style={{
                    padding: '8px 24px', background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'not-allowed', fontSize: '0.9rem',
                }}>Coming soon</button>
            );
        }
        if (selectedChapter.locked) {
            return (
                <button
                    disabled
                    title="Premium unlock is coming soon"
                    style={{
                        padding: '8px 24px',
                        background: 'linear-gradient(135deg, #b8860b, #ffd700)',
                        border: 'none', borderRadius: '8px', color: '#2b1d00',
                        cursor: 'not-allowed', fontSize: '0.9rem', fontWeight: 'bold', opacity: 0.9,
                    }}
                >
                    🔒 Unlock with {GATE_LABEL[selectedChapter.gateTier] || 'Members'} (coming soon)
                </button>
            );
        }
        if (selectedChapter.teaser) {
            const retrying = retryingChapterId === selectedChapter.id;
            return (
                <button
                    onClick={() => onTeaserChapterClick?.(selectedChapter)}
                    disabled={retrying || !isSignedIn}
                    style={{
                        padding: '8px 24px', background: 'var(--primary)',
                        border: 'none', borderRadius: '8px', color: '#fff',
                        cursor: retrying || !isSignedIn ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem', fontWeight: 'bold', opacity: retrying || !isSignedIn ? 0.7 : 1,
                    }}
                >
                    {retrying ? 'Loading your content…' : isSignedIn ? 'Load My Content' : 'Sign in to play'}
                </button>
            );
        }
        if (isApplied) {
            return (
                <button
                    onClick={() => onSubmit?.()}
                    style={{
                        padding: '8px 24px', background: 'var(--primary)',
                        border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
                        fontSize: '0.9rem', fontWeight: 'bold',
                    }}
                >
                    Next: Select Heroes
                </button>
            );
        }
        return (
            <button
                onClick={() => onApplyChapter?.(t)}
                style={{
                    padding: '8px 24px', background: 'var(--primary)',
                    border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
                    fontSize: '0.9rem', fontWeight: 'bold',
                }}
            >
                Begin This Campaign
            </button>
        );
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
                maxWidth: '640px', width: '90%', maxHeight: '85vh', padding: 0, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', borderRadius: '12px',
            }}>
                {/* Header: arc identity */}
                <div style={{
                    height: '220px',
                    background: `url(${arc.art}) center top/cover no-repeat, linear-gradient(135deg, var(--surface), var(--bg))`,
                    position: 'relative',
                    flexShrink: 0,
                }}>
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                        padding: '40px 20px 16px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#fff', fontFamily: 'var(--header-font)' }}>
                                    {arc.icon} {arc.name}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>
                                    {arc.chapterCount} {arc.chapterCount === 1 ? 'chapter' : 'chapters'} · Lv {arc.levelSpan[0]}-{arc.levelSpan[1]}
                                </div>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            position: 'absolute', top: 8, right: 8,
                            background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                            width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                            fontSize: '0.85rem', lineHeight: 1, padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >x</button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {arc.tagline && (
                        <p style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5, fontStyle: 'italic' }}>
                            {arc.tagline}
                        </p>
                    )}

                    {/* Chapter ladder (the picker) */}
                    <div style={{ marginBottom: '18px' }} data-testid="arc-chapter-ladder">
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 700 }}>
                            Chapters
                        </div>
                        {arc.chapters.map((chapter, i) => {
                            const chip = chapterChip(chapter, {
                                isSignedIn,
                                isRetrying: retryingChapterId === chapter.id,
                            });
                            const isRowSelected = selectedChapter && chapter.id === selectedChapter.id;
                            return (
                                <div
                                    key={chapter.id}
                                    data-testid={`arc-chapter-row-${chapter.id}`}
                                    onClick={() => handleRowClick(chapter)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '8px 12px', marginBottom: '6px',
                                        background: isRowSelected ? 'var(--surface)' : 'var(--bg)',
                                        border: isRowSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                        borderRadius: '8px',
                                        cursor: chapter.comingSoon ? 'default' : 'pointer',
                                        opacity: chapter.comingSoon ? 0.5 : chapter.locked ? 0.75 : 1,
                                        filter: chapter.comingSoon ? 'grayscale(0.6)' : 'none',
                                    }}
                                >
                                    <span style={{
                                        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                                        background: TIER_COLORS[chapter.tier] || '#888', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.7rem', fontWeight: 'bold',
                                    }}>{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                                            {chapter.subtitle}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                            {bandLabel(chapter.levelRange)}
                                        </div>
                                    </div>
                                    <span style={{
                                        flexShrink: 0, padding: '2px 8px', borderRadius: '10px',
                                        fontSize: '0.65rem', fontWeight: 'bold',
                                        background: chip.kind === 'locked'
                                            ? 'linear-gradient(135deg, #b8860b, #ffd700)'
                                            : 'var(--surface)',
                                        color: chip.kind === 'locked' ? '#2b1d00' : 'var(--text-secondary)',
                                        border: chip.kind === 'locked' ? 'none' : '1px solid var(--border)',
                                    }}>{chip.label}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Selected chapter structure: the ONLY chapter whose insides show */}
                    {selectedChapter && (
                        <div data-testid="arc-selected-chapter">
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 'bold', fontFamily: 'var(--header-font)', color: 'var(--text)' }}>
                                    {selectedChapter.subtitle}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {bandLabel(selectedChapter.levelRange)}
                                </span>
                            </div>

                            {description && (
                                <p style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5 }}>
                                    {description}
                                </p>
                            )}

                            {settings.campaignGoal && (
                                <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 700 }}>Campaign Goal</div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontStyle: 'italic' }}>{settings.campaignGoal}</div>
                                </div>
                            )}

                            {ms.length > 0 && (
                                <div style={{ marginBottom: '14px' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 700 }}>
                                        Quest Milestones ({ms.length})
                                    </div>
                                    {ms.map((m, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px',
                                            padding: '8px 10px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)',
                                        }}>
                                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{MILESTONE_TYPE_ICON[m.type] || '?'}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{m.text}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    {m.type}{m.location ? ` • ${m.location}` : ''}
                                                    {m.requires?.length > 0 ? ` • needs #${m.requires.join(', #')}` : ''}
                                                    {m.rewards ? ` • ${m.rewards.xp} XP, ${m.rewards.gold} gold` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {ms.length > 0 && (() => {
                                let totalXp = 0;
                                for (const m of ms) {
                                    if (m.rewards?.xp) totalXp += m.rewards.xp;
                                    if (m.encounter?.rewards?.xp) totalXp += m.encounter.rewards.xp;
                                }
                                return totalXp > 0 ? (
                                    <div style={{
                                        fontSize: '0.75rem', color: 'var(--text-secondary)',
                                        marginBottom: '14px', padding: '6px 10px',
                                        background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)',
                                        display: 'flex', gap: '12px',
                                    }}>
                                        <span><strong>Total XP:</strong> {totalXp}</span>
                                        <span><strong>Milestones:</strong> {ms.length}</span>
                                        <span><strong>Boss fights:</strong> {ms.filter((m) => m.type === 'combat').length}</span>
                                    </div>
                                ) : null;
                            })()}

                            {toneTags.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                                    {toneTags.map((tag, i) => (
                                        <span key={i} style={{
                                            padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem',
                                            background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                                        }}>
                                            <strong>{tag.label}:</strong> {tag.value}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Honest level-fit note for the chapter being started */}
                {fitCopy && (
                    <div data-testid="arc-level-fit" style={{
                        margin: '0 20px', padding: '10px 14px',
                        background: 'rgba(255, 152, 0, 0.15)', border: '1px solid #ff9800',
                        borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text)',
                    }}>
                        <strong style={{ color: '#ff9800' }}>⚠ Seasoned chapter:</strong> {fitCopy}
                    </div>
                )}

                {/* In-modal notice (teaser sign-in copy, retry outcome, lock explanation) */}
                {notice && (
                    <div data-testid="arc-modal-notice" style={{
                        margin: '10px 20px 0', padding: '8px 12px',
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)',
                    }}>
                        {notice}
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    padding: '14px 20px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 20px', background: 'transparent', border: '1px solid var(--border)',
                            borderRadius: '8px', color: 'var(--text)', cursor: 'pointer', fontSize: '0.9rem',
                        }}
                    >{isApplied ? 'Back' : 'Cancel'}</button>
                    {footerButton()}
                </div>
            </div>
        </div>
    );
};

export default ArcDetailModal;
