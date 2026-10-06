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

// Chunked entries: each AI narration is stored as paragraph-sized chunks
// (`${sessionId}-${msgIndex}-${chunkIndex}`), so retrieval matches and injects
// the relevant passage whole instead of the first N characters of a long reply.
// Older whole-message entries (no chunkIndex, id `${sessionId}-${msgIndex}`) are
// handled like stale-model vectors: excluded from retrieval, counted as not
// indexed, and replaced with chunks by the load-time backfill.
const isChunked = (entry) => Number.isInteger(entry.chunkIndex);
const isCurrent = (entry) => isCurrentVersion(entry) && isChunked(entry);

export const MAX_CHUNK_CHARS = 600;
// The worker's /api/embed accepts up to 100 texts per call (MAX_BATCH_SIZE in
// cf-worker/src/routes/embed.ts).
const MAX_CHUNKS_PER_EMBED_CALL = 96;

const splitSentences = (text) =>
  text.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g)?.map(s => s.trim()).filter(Boolean) || [text];

/**
 * Split narration into chunks of at most MAX_CHUNK_CHARS, on paragraph breaks
 * first, then sentence breaks. Never cuts mid-sentence: a single sentence longer
 * than the limit becomes its own chunk.
 * @param {string} text
 * @returns {string[]}
 */
export const chunkText = (text) => {
  const paragraphs = (text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const units = paragraphs.flatMap(p => (p.length > MAX_CHUNK_CHARS ? splitSentences(p) : [p]));

  const chunks = [];
  let current = '';
  for (const unit of units) {
    if (current && current.length + 1 + unit.length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

const buildChunkEntries = (sessionId, msgIndex, chunks, vectors, timestamp, tags = []) =>
  chunks.map((text, chunkIndex) => ({
    id: `${sessionId}-${msgIndex}-${chunkIndex}`,
    sessionId,
    text,
    vector: vectors[chunkIndex],
    msgIndex,
    chunkIndex,
    timestamp,
    tags,
    modelVersion: EMBEDDING_MODEL_VERSION, // #18
  }));

/**
 * Format retrieved memories for the end of a prompt. Chunks are injected whole.
 * @param {Array<{ text: string }>} results
 * @returns {string}
 */
export const formatRagContext = (results) => {
  if (!results || results.length === 0) return '';
  return `\n\n[RECALLED MEMORIES FROM PAST EVENTS]\n${results.map(r => `- ${r.text}`).join('\n')}`;
};

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
 * Chunk, embed and store an AI narration in the RAG index.
 * @param {string} sessionId
 * @param {string} text - The raw AI response text to embed
 * @param {{ msgIndex: number, timestamp?: number, tags?: string[] }} metadata
 */
export const embedAndStore = async (sessionId, text, metadata) => {
  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) return false;
    const { vectors } = await embeddingService.embed(chunks);
    await ragStore.putBatch(buildChunkEntries(
      sessionId, metadata.msgIndex, chunks, vectors,
      metadata.timestamp || Date.now(), metadata.tags || []
    ));
    logger.info(`Indexed event ${metadata.msgIndex} (${chunks.length} chunks) for session ${sessionId}`);
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
    // (pre-#18) are current by definition and stay in. Unchunked whole-message
    // entries are excluded too until backfill re-chunks them.
    const entries = allEntries.filter(isCurrent);
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
        chunkIndex: entry.chunkIndex,
        tags: entry.tags || [],
      }))
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      // Best chunk per message, so results recall distinct past events.
      .filter((r, i, all) => all.findIndex(o => o.msgIndex === r.msgIndex) === i)
      .slice(0, maxResults);

    return scored;
  } catch (err) {
    logger.error('RAG query failed:', err);
    return [];
  }
};

/** msgIndexes that have current (right model, chunked) entries. */
const getIndexedMessages = async (sessionId) =>
  new Set((await ragStore.getBySession(sessionId)).filter(isCurrent).map(e => e.msgIndex));

/**
 * Backfill the RAG index from conversation data, most recent first.
 * @param {string} sessionId
 * @param {Array<{ role: string, content: string }>} conversation
 * @param {{ onProgress?: (indexed: number, total: number) => void, maxChunksPerCall?: number }} options
 * @returns {Promise<number>} Number of entries indexed
 */
export const backfill = async (sessionId, conversation, options = {}) => {
  const { onProgress, maxChunksPerCall = MAX_CHUNKS_PER_EMBED_CALL } = options;

  // Filter to embeddable AI messages
  const embeddable = conversation
    .map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => msg.role === 'ai');

  if (embeddable.length === 0) return 0;

  // Check what's already indexed, per message. Entries stamped with a different
  // embedding model (#18) or stored unchunked do NOT count: those messages get
  // re-embedded below as fresh chunks, and the old entries are removed.
  const indexedSet = await getIndexedMessages(sessionId);
  const existingCount = indexedSet.size;
  if (existingCount >= embeddable.length) {
    logger.info(`Session ${sessionId} already fully indexed (${existingCount} messages)`);
    if (onProgress) onProgress(existingCount, embeddable.length);
    return 0;
  }

  // Most recent first
  const toIndex = embeddable
    .filter(({ index }) => !indexedSet.has(index))
    .reverse();

  let indexed = 0;

  // Group messages so each embed call carries as many chunks as the worker
  // accepts (one call per group), keeping backfill well inside the embed rate limit.
  const groups = [];
  let group = [];
  let groupChunks = 0;
  for (const { msg, index } of toIndex) {
    const chunks = chunkText(msg.content);
    if (chunks.length === 0) continue;
    if (group.length > 0 && groupChunks + chunks.length > maxChunksPerCall) {
      groups.push(group);
      group = [];
      groupChunks = 0;
    }
    group.push({ index, chunks });
    groupChunks += chunks.length;
  }
  if (group.length > 0) groups.push(group);

  for (const [g, batch] of groups.entries()) {
    try {
      const result = await embeddingService.embed(batch.flatMap(({ chunks }) => chunks));

      const timestamp = Date.now();
      let offset = 0;
      const entries = batch.flatMap(({ index, chunks }) => {
        const vectors = result.vectors.slice(offset, offset + chunks.length);
        offset += chunks.length;
        return buildChunkEntries(sessionId, index, chunks, vectors, timestamp);
      });

      await ragStore.putBatch(entries);
      // Drop the replaced entries: the old whole-message id, plus any stale
      // chunk ids beyond the new chunk count. Same-id stale chunks were
      // overwritten in place by putBatch.
      const keep = new Set(entries.map(e => e.id));
      const batchIndexes = new Set(batch.map(({ index }) => index));
      const stale = (await ragStore.getBySession(sessionId))
        .filter(e => batchIndexes.has(e.msgIndex) && !keep.has(e.id))
        .map(e => e.id);
      await ragStore.deleteBatch(stale);

      indexed += batch.length;
      if (onProgress) onProgress(existingCount + indexed, embeddable.length);
    } catch (err) {
      logger.error(`Backfill batch ${g + 1}/${groups.length} failed:`, err);
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
  // #18: stale-model and unchunked vectors count as unindexed, so they surface
  // as 'partial'/'empty' and useRagSync's auto-backfill re-indexes on next load.
  const indexedCount = (await getIndexedMessages(sessionId)).size;

  let status = 'current';
  if (indexedCount === 0) status = 'empty';
  else if (indexedCount < embeddableCount) status = 'partial';

  return { status, indexed: indexedCount, total: embeddableCount };
};

export const ragEngine = { embedAndStore, query, backfill, getIndexStatus, chunkText, formatRagContext };
