import React, { useState, useEffect, useCallback } from 'react';
import { resolveProfilePicture } from '../utils/assetHelper';
import { getIndexStatus, backfill } from '../game/ragEngine';
import { ragStore } from '../services/ragStore';
import RdDialog from './RdDialog';
import { conversationsApi } from '../services/conversationsApi';

// A save row's messages, whether stored as a JSON string or already parsed.
const messagesOf = (row) => {
  const raw = row?.conversation_data;
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || []); } catch (e) { return []; }
};

const SavedGameDetailsModal = ({ isOpen, onClose, conversation, formatDate }) => {
  const [ragStatus, setRagStatus] = useState(null); // { status, indexed, total }
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState(null);

  // The saved-games list carries metadata only (the server list skips the heavy columns,
  // PR #102), so fetch the full save on open for its messages (memory index) and summary.
  const [full, setFull] = useState(null);
  useEffect(() => {
    setFull(null);
    setRagStatus(null);
    if (!isOpen || !conversation?.sessionId) return undefined;
    let cancelled = false;
    const load = conversation.conversation_data
      ? Promise.resolve(conversation)
      : conversationsApi.getById(conversation.sessionId).catch(() => null);
    load.then((row) => { if (!cancelled && row) setFull(row); });
    return () => { cancelled = true; };
  }, [isOpen, conversation]);

  // Check RAG index status once the full save is in hand.
  useEffect(() => {
    if (!full || !conversation?.sessionId) return;
    const convData = messagesOf(full);
    if (convData.length === 0) return;
    getIndexStatus(conversation.sessionId, convData)
      .then(setRagStatus)
      .catch(() => setRagStatus(null));
  }, [full, conversation?.sessionId]);

  const handleRebuild = useCallback(async () => {
    if (!conversation?.sessionId || isRebuilding) return;
    const convData = messagesOf(full);
    if (convData.length === 0) return;

    setIsRebuilding(true);
    setRebuildProgress({ indexed: 0, total: convData.filter(m => m.role === 'ai').length });

    try {
      // Clear existing index for this session first
      await ragStore.clearSession(conversation.sessionId);

      await backfill(conversation.sessionId, convData, {
        onProgress: (indexed, total) => setRebuildProgress({ indexed, total })
      });

      const updated = await getIndexStatus(conversation.sessionId, convData);
      setRagStatus(updated);
    } catch (err) {
      // silently fail — status will show whatever was indexed
    } finally {
      setIsRebuilding(false);
      setRebuildProgress(null);
    }
  }, [conversation, full, isRebuilding]);

  if (!isOpen || !conversation) return null;

  const settings = conversation.game_settings
    ? (typeof conversation.game_settings === 'string'
      ? JSON.parse(conversation.game_settings)
      : conversation.game_settings)
    : null;

  const heroes = conversation.selected_heroes
    ? (typeof conversation.selected_heroes === 'string' ? JSON.parse(conversation.selected_heroes) : conversation.selected_heroes)
    : [];

  const position = conversation.player_position
    ? (typeof conversation.player_position === 'string' ? JSON.parse(conversation.player_position) : conversation.player_position)
    : null;

  const subMaps = conversation.sub_maps
    ? (typeof conversation.sub_maps === 'string'
      ? JSON.parse(conversation.sub_maps)
      : conversation.sub_maps)
    : null;

  const getLocationString = () => {
    if (!position) return 'Unknown';
    if (subMaps?.isInsideTown && subMaps?.currentTownTile?.townName) {
      return `${subMaps.currentTownTile.townName} (world: ${position.x}, ${position.y})`;
    }
    return `(${position.x}, ${position.y})`;
  };

  const ragLabel = ragStatus?.status === 'current' ? 'Fully indexed'
    : ragStatus?.status === 'partial' ? 'Partially indexed' : 'Not indexed';

  return (
    <RdDialog
      title={conversation.conversation_name || 'Untitled Adventure'}
      wide
      onClose={onClose}
      actions={<button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}
    >
      <div className="sgd">
        <section>
          <h3>Session</h3>
          <dl className="sgd-facts">
            <div><dt>Saved</dt><dd>{formatDate(conversation.timestamp)}</dd></div>
            {/* Campaign arc name is stamped into settings at save time; older saves
                predating campaign tracking omit it gracefully. */}
            {settings?.templateName && <div><dt>Campaign</dt><dd>{settings.templateName}</dd></div>}
            <div><dt>Location</dt><dd>{getLocationString()}</dd></div>
            <div><dt>Session ID</dt><dd className="mono">{conversation.sessionId}</dd></div>
          </dl>
        </section>

        {heroes.length > 0 && (
          <section>
            <h3>Party</h3>
            <ul className="sgd-party">
              {heroes.map((hero, idx) => (
                <li key={idx}>
                  {hero.profilePicture && (
                    <img src={resolveProfilePicture(hero.profilePicture)} alt="" />
                  )}
                  <span>
                    <b>{hero.heroName || hero.characterName || 'Unknown'}</b>
                    <small>
                      Level {hero.level || hero.heroLevel || hero.characterLevel || 1} {hero.heroClass || hero.characterClass || ''}
                      {hero.currentHP !== undefined && hero.maxHP ? ` · HP ${hero.currentHP}/${hero.maxHP}` : ''}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {settings && (
          <section>
            <h3>Story</h3>
            {settings.shortDescription && <p>{settings.shortDescription}</p>}
            {settings.campaignGoal && <p className="sgd-goal">{settings.campaignGoal}</p>}
            <dl className="sgd-facts">
              {settings.grimnessLevel && <div><dt>Grimness</dt><dd>{settings.grimnessLevel}</dd></div>}
              {settings.darknessLevel && <div><dt>Darkness</dt><dd>{settings.darknessLevel}</dd></div>}
              {settings.magicLevel && <div><dt>Magic</dt><dd>{settings.magicLevel}</dd></div>}
              {settings.technologyLevel && <div><dt>Technology</dt><dd>{settings.technologyLevel}</dd></div>}
              {settings.responseVerbosity && <div><dt>Narration</dt><dd>{settings.responseVerbosity}</dd></div>}
              {settings.worldSeed && <div><dt>World seed</dt><dd className="mono">{settings.worldSeed}</dd></div>}
            </dl>
          </section>
        )}

        {(full?.summary || conversation.summary) && (
          <section>
            <h3>Adventure summary</h3>
            <p>{full?.summary || conversation.summary}</p>
          </section>
        )}

        {ragStatus && (
          <section>
            <h3>DM memory index</h3>
            <p>
              <span className={`sgd-status ${ragStatus.status}`}>{ragLabel}</span>
              {' '}{ragStatus.indexed} of {ragStatus.total} events indexed
            </p>
            {ragStatus.total > 0 && (
              <div className="save-progress-bar sgd-bar">
                <span style={{ width: `${Math.round((ragStatus.indexed / ragStatus.total) * 100)}%` }} />
              </div>
            )}
            {isRebuilding && rebuildProgress && (
              <p className="sgd-note">Indexing... {rebuildProgress.indexed} / {rebuildProgress.total}</p>
            )}
            <button type="button" className="btn btn-ghost sgd-rebuild" onClick={handleRebuild} disabled={isRebuilding}>
              {isRebuilding ? 'Rebuilding...' : ragStatus.status === 'current' ? 'Rebuild Index' : 'Build Index'}
            </button>
            <p className="sgd-note">
              The memory index helps the DM recall past events during play.
              {ragStatus.status !== 'current' && ' Loading this game builds it automatically.'}
            </p>
          </section>
        )}
      </div>
    </RdDialog>
  );
};

export default SavedGameDetailsModal;
