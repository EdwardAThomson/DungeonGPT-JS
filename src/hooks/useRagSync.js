import { useState, useEffect, useCallback, useRef } from 'react';
import { backfill, getIndexStatus } from '../game/ragEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('rag-sync');

/**
 * Hook that manages RAG index synchronization for a game session.
 * Triggers backfill when a saved game is loaded, exposes progress state.
 *
 * @param {string} sessionId - Current game session ID
 * @param {Array} conversation - Current conversation array
 * @param {boolean} hasAdventureStarted - Whether the game has begun
 */
const useRagSync = (sessionId, conversation, hasAdventureStarted) => {
  const [ragStatus, setRagStatus] = useState(null); // { status, indexed, total }
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState(null); // { indexed, total }
  const hasChecked = useRef(false);

  // Check index status on mount (when loading a saved game)
  useEffect(() => {
    if (!sessionId || !hasAdventureStarted || hasChecked.current) return;
    if (!conversation || conversation.length === 0) return;

    hasChecked.current = true;

    (async () => {
      try {
        const status = await getIndexStatus(sessionId, conversation);
        setRagStatus(status);
        logger.info(`RAG index status: ${status.status} (${status.indexed}/${status.total})`);

        // Auto-backfill if index is empty or partial
        if (status.status === 'empty' || status.status === 'partial') {
          runBackfill(conversation);
        }
      } catch (err) {
        logger.warn('Failed to check RAG index status:', err);
      }
    })();
  }, [sessionId, hasAdventureStarted, conversation]);

  const runBackfill = useCallback(async (conv) => {
    if (!sessionId || isBackfilling) return;

    const targetConv = conv || conversation;
    if (!targetConv || targetConv.length === 0) return;

    setIsBackfilling(true);
    setBackfillProgress({ indexed: 0, total: targetConv.filter(m => m.role === 'ai').length });

    try {
      const indexed = await backfill(sessionId, targetConv, {
        onProgress: (indexed, total) => {
          setBackfillProgress({ indexed, total });
        }
      });

      const updatedStatus = await getIndexStatus(sessionId, targetConv);
      setRagStatus(updatedStatus);
      logger.info(`Backfill complete: ${indexed} new entries indexed`);
    } catch (err) {
      logger.error('Backfill failed:', err);
    } finally {
      setIsBackfilling(false);
      setBackfillProgress(null);
    }
  }, [sessionId, isBackfilling, conversation]);

  return {
    ragStatus,
    isBackfilling,
    backfillProgress,
    runBackfill
  };
};

export default useRagSync;
