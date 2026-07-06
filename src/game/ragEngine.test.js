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
  EMBEDDING_MODEL_VERSION
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
    getBySession: jest.fn(),
    countBySession: jest.fn(),
    clearSession: jest.fn(),
  },
}));

const VEC = [1, 0]; // unit vector: cosine similarity 1 against itself

const entry = (msgIndex, overrides = {}) => ({
  id: `s1-${msgIndex}`,
  sessionId: 's1',
  text: `event ${msgIndex}`,
  vector: VEC,
  msgIndex,
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
  ragStore.getBySession.mockResolvedValue([]);
});

describe('version stamp on write (#18)', () => {
  test('embedAndStore stamps new vectors with the current model version', async () => {
    await embedAndStore('s1', 'the dragon speaks', { msgIndex: 3 });
    expect(ragStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1-3', modelVersion: EMBEDDING_MODEL_VERSION })
    );
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
    expect(entries[0].id).toBe('s1-0'); // same id: the stale entry is replaced
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
