// #18 (embedding version stamps): every new vector is stamped with the CF
// Worker's embedding model id (EMBEDDING_MODEL_VERSION mirrors EMBEDDING_MODEL in
// cf-worker/src/routes/embed.ts). Pins the compatibility policy: missing stamp =
// current (pre-#18 vectors, no migration), mismatched stamp = excluded from
// retrieval and treated as unindexed so the existing load-time backfill
// re-embeds it in place.

import {
  embedAndStore,
  query,
  backfill,
  getIndexStatus,
  chunkText,
  formatRagContext,
  MAX_CHUNK_CHARS,
  EMBEDDING_MODEL_VERSION,
  CHUNK_FORMAT_VERSION,
  sceneNames,
  chunkEmbeddingText
} from './ragEngine';
import { embeddingService } from '../services/embeddingService';
import { ragStore } from '../services/ragStore';

jest.mock('../services/embeddingService', () => ({
  embeddingService: { embed: jest.fn(), embedSingle: jest.fn() },
}));

jest.mock('../services/ragStore', () => ({
  ragStore: {
    put: jest.fn(),
    putBatch: jest.fn(),
    deleteBatch: jest.fn(),
    getBySession: jest.fn(),
    countBySession: jest.fn(),
    clearSession: jest.fn(),
  },
}));

const VEC = [1, 0]; // unit vector: cosine similarity 1 against itself

const entry = (msgIndex, overrides = {}) => ({
  id: `s1-${msgIndex}-0`,
  sessionId: 's1',
  text: `event ${msgIndex}`,
  vector: VEC,
  msgIndex,
  chunkIndex: 0,
  chunkFormat: CHUNK_FORMAT_VERSION,
  timestamp: 1,
  tags: [],
  ...overrides,
});

beforeEach(() => {
  embeddingService.embedSingle.mockResolvedValue(VEC);
  embeddingService.embed.mockImplementation(async (texts) => ({
    vectors: (Array.isArray(texts) ? texts : [texts]).map(() => VEC),
    dimensions: 2,
    count: Array.isArray(texts) ? texts.length : 1,
  }));
  ragStore.put.mockResolvedValue();
  ragStore.putBatch.mockResolvedValue();
  ragStore.deleteBatch.mockResolvedValue();
  ragStore.getBySession.mockResolvedValue([]);
});

describe('version stamp on write (#18)', () => {
  test('embedAndStore stamps new vectors with the current model version', async () => {
    await embedAndStore('s1', 'the dragon speaks', { msgIndex: 3 });
    expect(ragStore.putBatch).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1-3-0', chunkIndex: 0, modelVersion: EMBEDDING_MODEL_VERSION }),
    ]);
  });

  test('backfill stamps every batched entry', async () => {
    const conversation = [
      { role: 'user', content: 'hi' },
      { role: 'ai', content: 'a tale unfolds' },
    ];
    await backfill('s1', conversation);
    expect(ragStore.putBatch).toHaveBeenCalledTimes(1);
    const entries = ragStore.putBatch.mock.calls[0][0];
    expect(entries).toHaveLength(1);
    expect(entries[0].modelVersion).toBe(EMBEDDING_MODEL_VERSION);
  });

  test('the version string mirrors the worker BGE model id', () => {
    // If this pin breaks, cf-worker/src/routes/embed.ts changed model: bump BOTH
    // and rely on the backfill re-index (see ragEngine.js policy comment).
    expect(EMBEDDING_MODEL_VERSION).toBe('@cf/baai/bge-base-en-v1.5');
  });
});

describe('retrieval compatibility policy (#18)', () => {
  test('a MISSING stamp is treated as current (pre-#18 vectors keep working)', async () => {
    ragStore.getBySession.mockResolvedValue([entry(0)]); // no modelVersion field
    const results = await query('s1', 'what happened?');
    expect(results).toHaveLength(1);
    expect(results[0].msgIndex).toBe(0);
  });

  test('a MISMATCHED stamp is excluded from retrieval', async () => {
    ragStore.getBySession.mockResolvedValue([
      entry(0, { modelVersion: '@cf/some/other-model' }),
      entry(1, { modelVersion: EMBEDDING_MODEL_VERSION }),
    ]);
    const results = await query('s1', 'what happened?');
    expect(results).toHaveLength(1);
    expect(results[0].msgIndex).toBe(1);
  });

  test('all-stale index returns no results rather than corrupt matches', async () => {
    ragStore.getBySession.mockResolvedValue([
      entry(0, { modelVersion: '@cf/some/other-model' }),
    ]);
    expect(await query('s2-all-stale', 'anything')).toEqual([]);
  });
});

describe('re-index piggybacks on the existing sync flow (#18)', () => {
  test('getIndexStatus counts stale vectors as unindexed (triggers auto-backfill)', async () => {
    ragStore.getBySession.mockResolvedValue([
      entry(1, { modelVersion: '@cf/some/other-model' }),
    ]);
    const status = await getIndexStatus('s1', [{ role: 'ai', content: 'a tale' }]);
    expect(status).toEqual({ status: 'empty', indexed: 0, total: 1 });
  });

  test('backfill re-embeds a stale entry, overwriting it in place with a fresh stamp', async () => {
    ragStore.getBySession.mockResolvedValue([
      entry(0, { modelVersion: '@cf/some/other-model' }),
    ]);
    const indexed = await backfill('s1', [{ role: 'ai', content: 'a tale' }]);
    expect(indexed).toBe(1);
    const entries = ragStore.putBatch.mock.calls[0][0];
    expect(entries[0].id).toBe('s1-0-0'); // same id: the stale entry is replaced
    expect(entries[0].modelVersion).toBe(EMBEDDING_MODEL_VERSION);
  });

  test('backfill still skips entries that are current (stamped or legacy-unstamped)', async () => {
    ragStore.getBySession.mockResolvedValue([
      entry(0), // legacy, unstamped: current by policy
      entry(1, { modelVersion: EMBEDDING_MODEL_VERSION }),
    ]);
    const indexed = await backfill('s1', [
      { role: 'ai', content: 'a' },
      { role: 'ai', content: 'b' },
    ]);
    expect(indexed).toBe(0);
    expect(ragStore.putBatch).not.toHaveBeenCalled();
  });
});

describe('chunking', () => {
  const sentence = (n) => `Sentence number ${n} tells of the road ahead and the long night.`;

  test('a short narration is one chunk, unchanged', () => {
    expect(chunkText('The gate creaks open.')).toEqual(['The gate creaks open.']);
  });

  test('splits on paragraph breaks and packs paragraphs up to the limit', () => {
    const para = 'x'.repeat(250);
    const chunks = chunkText([para, para, para].join('\n\n'));
    expect(chunks).toHaveLength(2);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS));
  });

  test('an over-long paragraph splits on sentences and loses no text', () => {
    const para = Array.from({ length: 30 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkText(para);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS));
    expect(chunks.join(' ')).toBe(para);
  });

  test('empty text yields no chunks', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('  \n\n ')).toEqual([]);
  });

  test('embedAndStore stores one entry per chunk under the same msgIndex', async () => {
    const para = 'y'.repeat(400);
    await embedAndStore('s1', `${para}\n\n${para}`, { msgIndex: 5 });
    const entries = ragStore.putBatch.mock.calls[0][0];
    expect(entries.map(e => e.id)).toEqual(['s1-5-0', 's1-5-1']);
    expect(entries.every(e => e.msgIndex === 5)).toBe(true);
  });

  test('formatRagContext injects chunks whole', () => {
    const text = 'z'.repeat(550);
    expect(formatRagContext([{ text }])).toContain(text);
    expect(formatRagContext([])).toBe('');
  });
});

describe('unchunked whole-message entries', () => {
  const legacy = (msgIndex) => ({ ...entry(msgIndex), id: `s1-${msgIndex}`, chunkIndex: undefined });

  test('are excluded from retrieval', async () => {
    ragStore.getBySession.mockResolvedValue([legacy(0), entry(1)]);
    const results = await query('s1', 'what happened?');
    expect(results.map(r => r.msgIndex)).toEqual([1]);
  });

  test('count as unindexed, and status counts messages rather than chunks', async () => {
    ragStore.getBySession.mockResolvedValue([
      legacy(0),
      entry(1),
      { ...entry(1), id: 's1-1-1', chunkIndex: 1 },
    ]);
    const status = await getIndexStatus('s1', [
      { role: 'ai', content: 'a' },
      { role: 'ai', content: 'b' },
    ]);
    expect(status).toEqual({ status: 'partial', indexed: 1, total: 2 });
  });

  test('backfill re-chunks them and deletes the old entry', async () => {
    ragStore.getBySession
      .mockResolvedValueOnce([legacy(0)])
      .mockResolvedValueOnce([legacy(0), entry(0)]);
    const indexed = await backfill('s1', [{ role: 'ai', content: 'a tale' }]);
    expect(indexed).toBe(1);
    expect(ragStore.putBatch.mock.calls[0][0].map(e => e.id)).toEqual(['s1-0-0']);
    expect(ragStore.deleteBatch).toHaveBeenCalledWith(['s1-0']);
  });
});

describe('retrieval and backfill shape', () => {
  test('query returns the best chunk per message, so results are distinct events', async () => {
    ragStore.getBySession.mockResolvedValue([
      entry(0),
      { ...entry(0), id: 's1-0-1', chunkIndex: 1 },
      entry(1),
    ]);
    const results = await query('s1', 'what happened?');
    expect(results.map(r => r.msgIndex)).toEqual([0, 1]);
  });

  test('backfill packs messages into as few embed calls as the chunk cap allows', async () => {
    const conversation = Array.from({ length: 7 }, (_, i) => ({ role: 'ai', content: `tale ${i}` }));
    const indexed = await backfill('s1', conversation, { maxChunksPerCall: 3 });
    expect(indexed).toBe(7);
    expect(embeddingService.embed.mock.calls.map(c => c[0].length)).toEqual([3, 3, 1]);
  });
});

describe('chunk format 2: names in front of each embedded chunk', () => {
  const scene = 'They make camp in a hollow. Thorin keeps watch.\n\nElara admits she came north for her brother Tamsin.\n\nBefore turning in, she presses a jade ring into Lyria\'s hand.';

  it('finds the scene names and skips common openers', () => {
    expect(sceneNames(scene)).toEqual(['Thorin', 'Elara', 'Tamsin', 'Lyria']);
    expect(sceneNames('The road. She waits. Then nothing.')).toEqual([]);
  });

  it('prefixes the embedded text but stores and injects the plain chunk', async () => {
    await embedAndStore('s1', scene, { msgIndex: 4 });
    const embedded = embeddingService.embed.mock.calls[0][0];
    expect(embedded.every((t) => t.startsWith('Names: Thorin, Elara, Tamsin, Lyria.\n'))).toBe(true);
    const stored = ragStore.putBatch.mock.calls[0][0];
    expect(stored.every((e) => e.chunkFormat === CHUNK_FORMAT_VERSION && !e.text.startsWith('Names:'))).toBe(true);
    expect(chunkEmbeddingText('x', [])).toBe('x');
  });

  it('backfill embeds with the prefix too', async () => {
    await backfill('s1', [{ role: 'ai', content: scene }]);
    const embedded = embeddingService.embed.mock.calls[0][0];
    expect(embedded[0]).toMatch(/^Names: Thorin, Elara, Tamsin, Lyria\.\n/);
  });

  it('treats #175 chunks (no format stamp) as not indexed and keeps them out of recall', async () => {
    ragStore.getBySession.mockResolvedValue([entry(0, { chunkFormat: undefined }), entry(1)]);
    const status = await getIndexStatus('s1', [{ role: 'ai', content: 'a' }, { role: 'ai', content: 'b' }]);
    expect(status).toMatchObject({ status: 'partial', indexed: 1, total: 2 });
    const results = await query('s1', 'anything');
    expect(results.map((r) => r.msgIndex)).toEqual([1]);
  });
});

