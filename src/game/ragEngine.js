import { embeddingService } from '../services/embeddingService';
import { ragStore } from '../services/ragStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('rag-engine');

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
    const entries = await ragStore.getBySession(sessionId);

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

  // Check what's already indexed
  const existingCount = await ragStore.countBySession(sessionId);
  if (existingCount >= embeddable.length) {
    logger.info(`Session ${sessionId} already fully indexed (${existingCount} entries)`);
    if (onProgress) onProgress(existingCount, embeddable.length);
    return 0;
  }

  // Get existing entries to know which msgIndexes are already done
  const existing = await ragStore.getBySession(sessionId);
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
  const indexedCount = await ragStore.countBySession(sessionId);

  let status = 'current';
  if (indexedCount === 0) status = 'empty';
  else if (indexedCount < embeddableCount) status = 'partial';

  return { status, indexed: indexedCount, total: embeddableCount };
};

export const ragEngine = { embedAndStore, query, backfill, getIndexStatus };
