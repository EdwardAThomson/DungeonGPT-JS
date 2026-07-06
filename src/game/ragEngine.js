import { embeddingService } from '../services/embeddingService';
import { ragStore } from '../services/ragStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('rag-engine');

// Embedding version stamp (#18): mirrors EMBEDDING_MODEL in
// cf-worker/src/routes/embed.ts; bump BOTH together if the worker's embedding
// model ever changes. Vectors from different models live in incompatible spaces,
// so retrieval against mixed vectors silently corrupts; the stamp lets us detect
// and exclude stale ones instead.
//
// Compatibility policy:
// - MISSING stamp (pre-#18 entries): treated as current: every vector written
//   before this landed came from this same model, so no migration is needed.
// - MISMATCHED stamp: excluded from retrieval (logged once per session) and
//   treated as NOT indexed by backfill/getIndexStatus, so the existing
//   load-time sync flow (useRagSync auto-backfill) re-embeds and overwrites it
//   in place (same `${sessionId}-${msgIndex}` id); that IS the re-index path.
export const EMBEDDING_MODEL_VERSION = '@cf/baai/bge-base-en-v1.5';

const isCurrentVersion = (entry) =>
  !entry.modelVersion || entry.modelVersion === EMBEDDING_MODEL_VERSION;

// Log the stale-vector exclusion once per session per app run, not per query.
const staleWarnedSessions = new Set();

/**
 * Cosine similarity between two vectors.
 */
const cosineSimilarity = (a, b) => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

/**
 * Embed text and store it in the RAG index.
 * @param {string} sessionId
 * @param {string} text - The raw AI response text to embed
 * @param {{ msgIndex: number, timestamp?: number, tags?: string[] }} metadata
 */
export const embedAndStore = async (sessionId, text, metadata) => {
  try {
    const vector = await embeddingService.embedSingle(text);
    await ragStore.put({
      id: `${sessionId}-${metadata.msgIndex}`,
      sessionId,
      text,
      vector,
      msgIndex: metadata.msgIndex,
      timestamp: metadata.timestamp || Date.now(),
      tags: metadata.tags || [],
      modelVersion: EMBEDDING_MODEL_VERSION, // #18
    });
    logger.info(`Indexed event ${metadata.msgIndex} for session ${sessionId}`);
    return true;
  } catch (err) {
    logger.error('Failed to embed and store:', err);
    return false;
  }
};

/**
 * Query the RAG index for the most relevant past events.
 * @param {string} sessionId
 * @param {string} queryText - Current context to search against
 * @param {{ maxResults?: number, minSimilarity?: number }} options
 * @returns {Promise<Array<{ text: string, similarity: number, msgIndex: number, tags: string[] }>>}
 */
export const query = async (sessionId, queryText, options = {}) => {
  const { maxResults = 3, minSimilarity = 0.5 } = options;

  try {
    const queryVector = await embeddingService.embedSingle(queryText);
    const allEntries = await ragStore.getBySession(sessionId);

    // #18: vectors stamped with a DIFFERENT model are excluded: comparing them
    // against a current-model query vector is meaningless. Unstamped entries
    // (pre-#18) are current by definition and stay in.
    const entries = allEntries.filter(isCurrentVersion);
    const staleCount = allEntries.length - entries.length;
    if (staleCount > 0 && !staleWarnedSessions.has(sessionId)) {
      staleWarnedSessions.add(sessionId);
      logger.warn(
        `Excluding ${staleCount} stale vector(s) for session ${sessionId} ` +
        `(embedded with a different model than ${EMBEDDING_MODEL_VERSION}); ` +
        `the next load-time backfill will re-index them.`
      );
    }

    if (entries.length === 0) return [];

    const scored = entries
      .map(entry => ({
        text: entry.text,
        similarity: cosineSimilarity(queryVector, entry.vector),
        msgIndex: entry.msgIndex,
        tags: entry.tags || [],
      }))
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);

    return scored;
  } catch (err) {
    logger.error('RAG query failed:', err);
    return [];
  }
};

/**
 * Backfill the RAG index from conversation data, most recent first.
 * @param {string} sessionId
 * @param {Array<{ role: string, content: string }>} conversation
 * @param {{ onProgress?: (indexed: number, total: number) => void, batchSize?: number }} options
 * @returns {Promise<number>} Number of entries indexed
 */
export const backfill = async (sessionId, conversation, options = {}) => {
  const { onProgress, batchSize = 5 } = options;

  // Filter to embeddable AI messages
  const embeddable = conversation
    .map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => msg.role === 'ai');

  if (embeddable.length === 0) return 0;

  // Check what's already indexed. Entries stamped with a different embedding
  // model (#18) do NOT count: they get re-embedded below, and the fresh put()
  // overwrites the stale entry in place (same `${sessionId}-${msgIndex}` id).
  const existing = (await ragStore.getBySession(sessionId)).filter(isCurrentVersion);
  const existingCount = existing.length;
  if (existingCount >= embeddable.length) {
    logger.info(`Session ${sessionId} already fully indexed (${existingCount} entries)`);
    if (onProgress) onProgress(existingCount, embeddable.length);
    return 0;
  }

  const indexedSet = new Set(existing.map(e => e.msgIndex));

  // Most recent first
  const toIndex = embeddable
    .filter(({ index }) => !indexedSet.has(index))
    .reverse();

  let indexed = 0;
  const total = toIndex.length;

  // Process in batches
  for (let i = 0; i < toIndex.length; i += batchSize) {
    const batch = toIndex.slice(i, i + batchSize);
    const texts = batch.map(({ msg }) => msg.content);

    try {
      const result = await embeddingService.embed(texts);

      const entries = batch.map(({ msg, index }, batchIdx) => ({
        id: `${sessionId}-${index}`,
        sessionId,
        text: msg.content,
        vector: result.vectors[batchIdx],
        msgIndex: index,
        timestamp: Date.now(),
        tags: [],
        modelVersion: EMBEDDING_MODEL_VERSION, // #18
      }));

      await ragStore.putBatch(entries);
      indexed += entries.length;

      if (onProgress) onProgress(existingCount + indexed, embeddable.length);
    } catch (err) {
      logger.error(`Backfill batch failed at offset ${i}:`, err);
      // Continue with next batch rather than aborting
    }
  }

  logger.info(`Backfill complete: ${indexed} new entries for session ${sessionId}`);
  return indexed;
};

/**
 * Get index status for a session.
 * @param {string} sessionId
 * @param {Array<{ role: string, content: string }>} conversation
 * @returns {Promise<{ status: 'empty'|'partial'|'current', indexed: number, total: number }>}
 */
export const getIndexStatus = async (sessionId, conversation) => {
  const embeddableCount = conversation.filter(m => m.role === 'ai').length;
  // #18: stale-model vectors count as unindexed, so a model change surfaces as
  // 'partial'/'empty' and useRagSync's auto-backfill re-indexes on next load.
  const indexedCount = (await ragStore.getBySession(sessionId)).filter(isCurrentVersion).length;

  let status = 'current';
  if (indexedCount === 0) status = 'empty';
  else if (indexedCount < embeddableCount) status = 'partial';

  return { status, indexed: indexedCount, total: embeddableCount };
};

export const ragEngine = { embedAndStore, query, backfill, getIndexStatus };
