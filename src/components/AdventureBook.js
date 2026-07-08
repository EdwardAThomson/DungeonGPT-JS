import React, { useEffect, useState } from 'react';
import { getStepHint, formatStepProgress, isQuestReadyToTurnIn } from '../game/questHints';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';
import CodexTab from './CodexTab';
import PartyInventoryContent from './PartyInventoryModal';
import { AiEngineSettings, ShareQRCode } from './Modals';

// --- Adventure Book (#52): the unified tabbed REFERENCE hub -------------------
//
// Converges the old Journal (campaign + side quests), the Party Inventory modal,
// the new Codex (#51), and the in-game AI settings into ONE modal: open once, hop
// between tabs, one close. Transactional interrupts (encounter action, dice,
// building, save confirmation, quest offer) stay separate modals; the encounter
// conflict rule auto-closes this hub like any navigation-group modal.
//
// MAP DECISION (recorded per #52): the world/town Map does NOT join the hub. The
// map's click-to-move-while-open flow (#25) depends on Game.js toggling
// `mapHook.isMapModalOpen` around encounters (close on encounter, reopen on
// resolve via reopenMapAfterEncounterRef) and on the location/building modals
// layering over it. Hosting it as a tab would mean every move that triggers an
// encounter closes the WHOLE book and reopens it on the map tab, and same-tile
// re-click behaviour + the building child-modal parenting would need rework.
// That degrades the map-stays-open-while-moving flow, so per the recorded design
// rule ("map joins ONLY if click-to-move-while-open survives"), it stays a
// standalone modal.
//
// Frame: ONE fixed silhouette across all tabs — the Journal's proven
// min(90vh, 1000px) frame; tab volumes differ wildly and a shrink-to-fit modal
// would jarringly resize on every switch. Content scrolls within. The last
// active tab is remembered for the session (this component stays mounted; the
// shell only unmounts its children's DOM when closed).

const TABS = [
  { id: 'campaign', label: '📜 Campaign' },
  { id: 'quests', label: '🗺️ Side Quests' },
  { id: 'codex', label: '📚 Codex' },
  { id: 'party', label: '🎒 Party' },
  { id: 'ai', label: '⚙️ AI' }
];

// Normalize legacy milestone arrays (plain strings) for display.
const normalizeMilestones = (milestones) => {
  if (!milestones || milestones.length === 0) return [];
  if (typeof milestones[0] === 'object' && milestones[0].hasOwnProperty('text')) {
    return milestones;
  }
  return milestones.map((text, index) => ({ id: index + 1, text, completed: false, location: null }));
};

const CampaignTab = ({ settings, onContinueLegend }) => (
  <div className="modal-section" style={{ marginBottom: '25px' }}>
    <div style={{ fontSize: '0.9rem', color: 'var(--text)', background: 'var(--surface)', padding: '18px 18px 14px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px var(--shadow)' }}>
      {/* Quest box: adventure name + goal */}
      {(settings.templateName || settings.campaignGoal) && (
        <div style={{ margin: '0 0 16px 0', padding: '14px 16px', background: 'var(--primary-tint-10)', border: '1px solid var(--primary)', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
            Quest{(settings.currentChapter || settings.chain?.chapter) > 1 ? ` · Chapter ${settings.currentChapter || settings.chain.chapter}` : ''}
          </p>
          {settings.templateName && (
            <p style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontWeight: '700', fontSize: '1.3rem', fontFamily: 'var(--header-font)', lineHeight: '1.3' }}>{settings.templateName}</p>
          )}
          {settings.campaignGoal && (
            <p style={{ margin: '0', color: 'var(--text)', fontWeight: '500', fontSize: '1.1rem', lineHeight: '1.45' }}>{settings.campaignGoal}</p>
          )}
        </div>
      )}
      {settings.campaignComplete && (
        <div style={{ margin: '0 0 18px 0', padding: '12px', background: 'var(--success-tint-20)', borderLeft: '4px solid var(--state-success)', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--state-success)' }}>🏆 CAMPAIGN COMPLETE 🏆</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Victory Achieved!</div>
          {/* Quest chaining: retroactive CTA. Any completed save (including
              ones finished before chaining existed) can continue the next
              campaign IN THIS SAVE, same world and journal. */}
          {onContinueLegend && (
            <button
              onClick={onContinueLegend}
              className="primary-button"
              style={{ marginTop: '10px', padding: '8px 22px', fontWeight: 'bold' }}
            >
              ⚔️ Continue your legend
            </button>
          )}
        </div>
      )}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', margin: '0 0 16px 0' }}>
        <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.55', color: 'var(--text)' }}>
          {settings.shortDescription || 'Default Fantasy World'}
        </p>
      </div>
      {settings.milestones && settings.milestones.length > 0 && (() => {
        const normalized = normalizeMilestones(settings.milestones);
        const totalCount = normalized.length;
        const completedCount = normalized.filter(m => m.completed).length;
        const currentIndex = normalized.findIndex(m => !m.completed);

        return (
          <div style={{ margin: '0 0 14px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
            {/* Milestones Header with Progress */}
            {totalCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 10px 0', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.95rem', color: 'var(--primary)', fontFamily: 'var(--header-font)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  Milestones
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {completedCount}/{totalCount} complete
                </span>
              </div>
            )}

            {/* Milestones list, strict numerical order */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {normalized.map((m, idx) => {
                const isCurrent = idx === currentIndex;
                const isCompleted = m.completed;
                const isFuture = !isCompleted && !isCurrent;

                return (
                  <div
                    key={m.id ?? idx}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                      padding: isCurrent ? '8px 12px' : '4px 12px',
                      background: isCurrent ? 'var(--primary-tint-10)' : 'transparent',
                      borderLeft: isCurrent ? '3px solid var(--primary)' : '3px solid transparent',
                      borderRadius: '4px',
                      transition: 'background 0.2s'
                    }}
                  >
                    <span style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      opacity: 0.85,
                      minWidth: '20px',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {idx + 1}.
                    </span>
                    <span style={{
                      fontSize: isCurrent ? '1.15rem' : '1.02rem',
                      lineHeight: '1.45',
                      color: isCompleted ? 'var(--text-secondary)' : 'var(--text)',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      opacity: isFuture ? 0.6 : 1,
                      fontWeight: isCurrent ? '500' : 'normal',
                      flex: 1
                    }}>
                      {isCompleted && (
                        <span style={{ color: 'var(--state-success)', marginRight: '6px', textDecoration: 'none', display: 'inline-block' }}>✓</span>
                      )}
                      {isCurrent && <span style={{ marginRight: '6px' }}>🎯</span>}
                      {m.text}
                      {(() => {
                        // For milestones that name an authored NPC, item and/or building,
                        // show the who/what/where so the player knows the objective target
                        // (e.g. "Moorland Herbs · Grey Moors"). Milestones without
                        // spawn/building data render nothing.
                        const who = (m.spawn?.type === 'npc' || m.spawn?.type === 'item') ? m.spawn.name : null;
                        // Name the building's TYPE alongside its flavour name so the
                        // player can find it on the map (maintainer 2026-07-07: "The
                        // Icemoor Sanctuary" alone does not say it is a temple).
                        const prettyType = (t) => t ? String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
                        const where = m.building?.name
                          ? `${m.building.name}${m.building.type ? ` (${prettyType(m.building.type)})` : ''}`
                          : (m.spawn?.type === 'npc' || m.spawn?.type === 'item' ? m.spawn.location : null);
                        const sub = [who, where].filter(Boolean).join(' · ');
                        if (!sub) return null;
                        return (
                          <span style={{
                            display: 'block',
                            fontSize: '0.85rem',
                            fontWeight: 'normal',
                            color: 'var(--text-secondary)',
                            opacity: 0.85,
                            marginTop: '2px',
                            textDecoration: 'none'
                          }}>
                            {sub}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px 20px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
        <span title="The overall tone and atmosphere of the story - from light-hearted to grim and serious">
          <span style={{ opacity: 0.7 }}>Mood:</span> {settings.grimnessLevel || 'Neutral'} / {settings.darknessLevel || 'Neutral'}
        </span>
        <span title="How prevalent and powerful magic is in this world - from rare and subtle to commonplace and dramatic">
          <span style={{ opacity: 0.7 }}>Magic:</span> {settings.magicLevel || 'Medium Magic'}
        </span>
        <span title="The level of technological advancement - from primitive to futuristic">
          <span style={{ opacity: 0.7 }}>Tech:</span> {settings.technologyLevel || 'Medieval'}
        </span>
      </div>
    </div>
    <p style={{ margin: '10px 0 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', opacity: 0.6 }}>
      * Story settings are woven at the start and cannot be changed here.
    </p>
  </div>
);

const SideQuestsTab = ({ settings }) => {
  const [expandedQuests, setExpandedQuests] = useState({});
  // Accepted quests with per-step progress + derived how/where hints (questHints),
  // sorted ready-to-turn-in → active → completed.
  const accepted = (settings.sideQuests || []).filter(q => q.status !== 'available');
  if (accepted.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '30px' }}>
        No side quests yet. Keep exploring — rumours travel, and folk in taverns and town halls have work for capable hands.
      </p>
    );
  }
  const rank = (q) => (isQuestReadyToTurnIn(q) ? 0 : q.status === 'active' ? 1 : 2);
  const sorted = [...accepted].sort((a, b) => rank(a) - rank(b));
  return sorted.map(q => {
    const total = q.milestones.length;
    const done = q.milestones.filter(m => m.completed).length;
    const ready = isQuestReadyToTurnIn(q);
    const expanded = !!expandedQuests[q.id];
    return (
      <div key={q.id} style={{ border: `1px solid ${ready ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '8px', marginBottom: '8px', background: 'var(--bg)' }}>
        <button
          onClick={() => setExpandedQuests(p => ({ ...p, [q.id]: !p[q.id] }))}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}
        >
          <span style={{ fontWeight: 700, textDecoration: q.status === 'completed' ? 'line-through' : 'none', opacity: q.status === 'completed' ? 0.7 : 1 }}>
            {q.status === 'completed' ? '✓ ' : ''}{q.title}
          </span>
          <span style={{ fontSize: '0.85rem', color: ready ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: ready ? 700 : 400 }}>
            {ready ? '✅ Ready to turn in' : `${done}/${total}`} {expanded ? '▲' : '▼'}
          </span>
        </button>
        {expanded && (
          <div style={{ padding: '0 14px 12px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 8px' }}>{q.description}</p>
            {q.milestones.map(m => {
              const hint = getStepHint(m, q);
              return (
                <div key={m.id} style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.95rem', color: m.completed ? 'var(--text-secondary)' : 'var(--text)', textDecoration: m.completed ? 'line-through' : 'none' }}>
                    {m.completed ? '✓' : '•'} {m.text}{formatStepProgress(m)}
                  </div>
                  {hint && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', opacity: 0.85, marginLeft: '16px' }}>
                      {hint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  });
};

const AdventureBook = ({
  settings,
  onContinueLegend,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  assistantProvider, setAssistantProvider,
  assistantModel, setAssistantModel,
  selectedHeroes,
  onUseItem,
  onHeroUpdate
}) => {
  const { isOpen, data, close } = useModal('adventureBook');
  // Remembered last tab (session): this component stays mounted while the game
  // page lives, so plain state survives close/reopen. An explicit `tab` in the
  // open() data (e.g. the Inventory button opening straight to Party) overrides.
  const [activeTab, setActiveTab] = useState('campaign');

  useEffect(() => {
    if (isOpen && data?.tab && TABS.some(t => t.id === data.tab)) {
      setActiveTab(data.tab);
    }
  }, [isOpen, data]);

  if (!isOpen) return null;

  const activeSideQuests = (settings?.sideQuests || []).filter(q => q.status === 'active').length;
  const tabLabel = (tab) =>
    tab.id === 'quests' && activeSideQuests > 0 ? `${tab.label} (${activeSideQuests})` : tab.label;

  return (
    <ModalShell
      modalId="adventureBook"
      className="settings-modal-refined"
      ariaLabel="Adventure Book"
      // Fixed frame height (not content-driven): the tabs hold very different
      // content volumes, and a shrink-to-fit modal jarringly resizes on every
      // tab switch. All tabs share this silhouette; content scrolls within.
      style={{ maxWidth: '900px', width: '95%', height: 'min(90vh, 1000px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
    >
      <div style={{ padding: '20px 20px 0 20px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 10px 0', color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '1.4rem' }}>📖 Adventure Book</h2>
        <div role="tablist" aria-label="Adventure Book sections" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--header-font)'
              }}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
        {activeTab === 'campaign' && <CampaignTab settings={settings || {}} onContinueLegend={onContinueLegend} />}
        {activeTab === 'quests' && <SideQuestsTab settings={settings || {}} />}
        {activeTab === 'codex' && <CodexTab codex={settings?.codex} milestones={settings?.milestones} />}
        {activeTab === 'party' && (
          <PartyInventoryContent
            selectedHeroes={selectedHeroes || []}
            onUseItem={onUseItem}
            onHeroUpdate={onHeroUpdate}
          />
        )}
        {activeTab === 'ai' && (
          <AiEngineSettings
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            assistantProvider={assistantProvider}
            setAssistantProvider={setAssistantProvider}
            assistantModel={assistantModel}
            setAssistantModel={setAssistantModel}
          />
        )}
      </div>

      <div style={{ padding: '20px', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg)' }}>
        <button className="modal-close-button" onClick={close} style={{ padding: '12px 60px', borderRadius: '30px', fontFamily: 'var(--header-font)', textTransform: 'uppercase', letterSpacing: '2px' }}>
          Accept & Close
        </button>
        <ShareQRCode />
      </div>
    </ModalShell>
  );
};

export default AdventureBook;
