import React, { useMemo, useState } from 'react';
import { getNextCampaignOptions, getPartyLevel } from '../game/campaignChain';

// "Continue your legend" picker (quest chaining Phase 1). Lists the campaigns the
// party can chain into next: same-genre next tier first (recommended), then other
// tier-appropriate templates. Premium templates respect the existing entitlements
// gates (locked styling like NewGame's Premium Adventures). Level-fit is a soft
// warning, never a block. A plain overlay (like NewGame's template detail modal)
// so it works both in-game and on the Saved Games page.
//
// With `celebrate` it doubles as the campaign-complete celebration: trophy header +
// the pick list, with "Keep exploring" as the dismissal.

const tierColors = { 1: '#4caf50', 2: '#ff9800', 3: '#f44336' };

const TierBadge = ({ tier, levelRange }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '0.7rem',
    fontWeight: 'bold',
    color: '#fff',
    background: tierColors[tier] || '#888',
    whiteSpace: 'nowrap',
  }}>
    Tier {tier}{levelRange ? ` (Lv ${levelRange[0]}-${levelRange[1]})` : ''}
  </span>
);

const ContinueLegendPicker = ({
  isOpen,
  onClose,
  settings,
  party,
  onPick,
  celebrate = false,
  launching = false,
  error = null,
}) => {
  const [localError, setLocalError] = useState('');

  const options = useMemo(
    () => (isOpen ? getNextCampaignOptions({ settings, party }) : []),
    [isOpen, settings, party]
  );

  if (!isOpen) return null;

  const partyLevel = getPartyLevel(party);
  const nextChapter = ((settings?.chain && settings.chain.chapter) || 1) + 1;
  const shownError = error || localError;

  return (
    <div className="modal-overlay" onClick={launching ? undefined : onClose} style={{ zIndex: 3000 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Continue your legend"
        style={{
          maxWidth: '640px', width: '92%', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', padding: 0,
          overflow: 'hidden', borderRadius: '12px',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
          {celebrate && (
            <>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--state-success)', fontFamily: 'var(--header-font)' }}>
                🏆 Campaign Complete! 🏆
              </div>
              {settings?.campaignGoal && (
                <p style={{ margin: '8px 0 0', fontSize: '0.95rem', color: 'var(--text)' }}>{settings.campaignGoal}</p>
              )}
              <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                The tale of your heroic deeds will be sung for generations to come!
              </p>
            </>
          )}
          <h3 style={{ margin: celebrate ? '14px 0 4px' : '0 0 4px', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>
            ⚔️ Continue your legend
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Your heroes carry everything they earned (levels, gear, gold) into a fresh land, fully rested.
            Your completed world stays saved and playable.
          </p>
        </div>

        {/* Options */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {launching ? (
            <p style={{ textAlign: 'center', color: 'var(--text)', padding: '30px 0' }}>
              Preparing your next chapter…
            </p>
          ) : options.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '30px 0' }}>
              No further campaigns are available yet. More chapters are coming soon!
            </p>
          ) : (
            options.map(({ template, recommended, premiumLocked, underLeveled }) => (
              <div
                key={template.id}
                data-testid={`legend-option-${template.id}`}
                style={{
                  display: 'flex', gap: '14px', alignItems: 'stretch',
                  background: 'var(--surface)',
                  border: recommended ? '2px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: '10px', padding: '12px', marginBottom: '10px',
                  opacity: premiumLocked ? 0.75 : 1,
                  filter: premiumLocked ? 'grayscale(0.5)' : 'none',
                }}
              >
                <div style={{
                  width: '86px', minHeight: '86px', flexShrink: 0, borderRadius: '8px',
                  background: `url(/assets/templates/${template.id}.webp) center/cover no-repeat, linear-gradient(135deg, var(--surface), var(--bg))`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold', fontFamily: 'var(--header-font)', color: 'var(--text)' }}>
                      {template.icon} {template.name}{template.subtitle ? ` — ${template.subtitle}` : ''}
                    </span>
                    <TierBadge tier={template.tier} levelRange={template.levelRange} />
                    {recommended && (
                      <span style={{
                        background: 'var(--primary)', color: '#fff', padding: '2px 8px',
                        borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold',
                      }}>RECOMMENDED NEXT</span>
                    )}
                    {premiumLocked && (
                      <span style={{
                        background: 'linear-gradient(135deg, #b8860b, #ffd700)', color: '#2b1d00',
                        padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold',
                      }}>🔒 PREMIUM</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 6px', lineHeight: 1.35 }}>
                    {template.description}
                  </div>
                  {underLeveled && template.levelRange && (
                    <div style={{ fontSize: '0.75rem', color: '#ff9800', fontWeight: 600, marginBottom: '6px' }}>
                      ⚠ Made for Lv {template.levelRange[0]}-{template.levelRange[1]}; your party is Lv {partyLevel}. It may be deadly, but you may still try.
                    </div>
                  )}
                  {premiumLocked ? (
                    <button
                      onClick={() => setLocalError('This is a Premium adventure. Premium unlock is coming soon — pick a free adventure to continue.')}
                      title="Premium unlock is coming soon"
                      style={{
                        padding: '6px 16px',
                        background: 'linear-gradient(135deg, #b8860b, #ffd700)',
                        border: 'none', borderRadius: '8px', color: '#2b1d00',
                        cursor: 'not-allowed', fontSize: '0.8rem', fontWeight: 'bold',
                      }}
                    >
                      🔒 Unlock with Premium
                    </button>
                  ) : (
                    <button
                      onClick={() => { setLocalError(''); onPick(template); }}
                      disabled={launching}
                      className="primary-button"
                      style={{ padding: '6px 16px', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                      Begin Chapter {nextChapter}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          {shownError && (
            <p className="error-message" style={{ marginTop: '6px' }}>{shownError}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={launching}
            className="secondary-button"
            style={{ padding: '8px 20px' }}
          >
            {celebrate ? 'Keep exploring' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContinueLegendPicker;
