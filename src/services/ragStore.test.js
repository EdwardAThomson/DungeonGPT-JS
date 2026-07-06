// #17 (RAG index cleanup on save delete): pins ragStore's per-session keying and
// clearSession's isolation: purging one session's vectors must never touch a
// neighbour's. Same minimal in-memory fake-indexedDB approach as
// localGameStore.test.js, extended with the sessionId index + cursor deletion
// that ragStore uses. Requests resolve on microtasks; transaction oncomplete
// fires on a macrotask, which by ordering runs after every cursor step.

import { ragStore } from './ragStore';

const makeFakeIndexedDB = () => {
  const data = new Map(); // id -> entry
  const request = (execute) => {
    const req = {};
    queueMicrotask(() => {
      try {
        req.result = execute();
        if (req.onsuccess) req.onsuccess({ target: req });
      } catch (error) {
        req.error = error;
        if (req.onerror) req.onerror({ target: req });
      }
    });
    return req;
  };
  const bySession = (sessionId) => [...data.values()].filter((e) => e.sessionId === sessionId);
  const index = () => ({
    getAll: (sessionId) => request(() => bySession(sessionId).map((e) => ({ ...e }))),
    count: (sessionId) => request(() => bySession(sessionId).length),
    openCursor: (sessionId) => {
      const ids = bySession(sessionId).map((e) => e.id);
      const req = {};
      let i = 0;
      const step = () => {
        queueMicrotask(() => {
          const cursor = i < ids.length
            ? {
                delete: () => { data.delete(ids[i]); },
                continue: () => { i += 1; step(); },
              }
            : null;
          if (req.onsuccess) req.onsuccess({ target: { result: cursor } });
        });
      };
      step();
      return req;
    },
  });
  const store = {
    put: (entry) => { data.set(entry.id, { ...entry }); },
    index,
  };
  const makeTransaction = () => {
    const tx = { objectStore: () => store };
    setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
    return tx;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: makeTransaction,
    close: () => {},
  };
  return {
    open: () => request(() => db),
    _data: data,
  };
};

const entry = (sessionId, msgIndex) => ({
  id: `${sessionId}-${msgIndex}`,
  sessionId,
  text: `event ${msgIndex}`,
  vector: [0.1, 0.2],
  msgIndex,
  timestamp: 1,
  tags: [],
});

beforeEach(() => {
  global.indexedDB = makeFakeIndexedDB();
});

describe('ragStore per-session keying', () => {
  test('put + getBySession roundtrip returns only that session', async () => {
    await ragStore.put(entry('s1', 0));
    await ragStore.put(entry('s2', 0));
    const rows = await ragStore.getBySession('s1');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('s1-0');
  });

  test('countBySession counts only the session asked for', async () => {
    await ragStore.putBatch([entry('s1', 0), entry('s1', 1), entry('s2', 0)]);
    expect(await ragStore.countBySession('s1')).toBe(2);
    expect(await ragStore.countBySession('s2')).toBe(1);
  });
});

describe('clearSession (#17: the delete-save purge path)', () => {
  test('removes every entry for the session and nothing else', async () => {
    await ragStore.putBatch([entry('s1', 0), entry('s1', 1), entry('other', 0)]);
    await ragStore.clearSession('s1');
    expect(await ragStore.countBySession('s1')).toBe(0);
    expect(await ragStore.countBySession('other')).toBe(1);
  });

  test('a parked diverged copy id is its own session: purging it spares the original', async () => {
    await ragStore.putBatch([entry('s1', 0), entry('s1-local-ab12cd', 0)]);
    await ragStore.clearSession('s1-local-ab12cd');
    expect(await ragStore.countBySession('s1-local-ab12cd')).toBe(0);
    expect(await ragStore.countBySession('s1')).toBe(1);
  });

  test('clearing an unknown session is a harmless no-op', async () => {
    await ragStore.put(entry('s1', 0));
    await expect(ragStore.clearSession('nope')).resolves.toBeUndefined();
    expect(await ragStore.countBySession('s1')).toBe(1);
  });
});
