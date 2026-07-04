import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';
import { localGameStore } from './localGameStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('conversations-api');

// Use CF Worker in production, Express/SQLite in dev
const forceSQLite = process.env.REACT_APP_USE_SQLITE === 'true';
const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
const useCfWorker = !forceSQLite && isProduction;

if (useCfWorker) {
  console.log('[conversationsApi] Using CF Worker backend (production)');
} else {
  console.log('[conversationsApi] Using Express/SQLite backend (dev)', forceSQLite ? '(forced via REACT_APP_USE_SQLITE)' : '');
}

const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';

async function cfFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const response = await fetch(`${CF_WORKER_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const msg = await getErrorMessage(response, `Request failed: ${path}`);
    throw new Error(msg);
  }
  return response.json();
}

// CF Worker implementation (production)
const cfWorkerConversationsApi = {
  async list() {
    return cfFetch('/api/db/conversations');
  },

  async getById(sessionId) {
    return cfFetch(`/api/db/conversations/${sessionId}`);
  },

  async save(payload) {
    return cfFetch('/api/db/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateMessages(sessionId, conversationData) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ conversation_data: conversationData }),
    });
  },

  async updateName(sessionId, conversationName) {
    return cfFetch(`/api/db/conversations/${sessionId}/name`, {
      method: 'PUT',
      body: JSON.stringify({ conversationName }),
    });
  },

  async remove(sessionId) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'DELETE',
    });
  }
};

// Express implementation (local dev)
const expressConversationsApi = {
  async list() {
    const response = await apiFetch('/api/conversations');
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch conversations'));
    }
    return response.json();
  },

  async getById(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`);
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to load conversation'));
    }
    return response.json();
  },

  async save(payload) {
    const response = await apiFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to save conversation'));
    }
    return response.json();
  },

  async updateMessages(sessionId, conversationData) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_data: conversationData }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation'));
    }
    return response.json();
  },

  async updateName(sessionId, conversationName) {
    const response = await apiFetch(`/api/conversations/${sessionId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationName }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation name'));
    }
    return response.json();
  },

  async remove(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to delete conversation'));
    }
    return response.json();
  }
};

const backend = useCfWorker ? cfWorkerConversationsApi : expressConversationsApi;

// Logged-out (guest) players save/load games to a browser-local IndexedDB store;
// signed-in players use the cloud backend. Local games are synced on sign-in.
//
// Auth-state tracking (SAVE_SYNC_PLAN Phase 1, §4): a failed getSession() is
// "unknown", not "guest". A transient auth-check blip must not silently reroute an
// account-holder's saves as if the player were a plain guest. lastKnownAuth
// remembers the last *successful* check; hasSeenSignedIn remembers whether this
// page session ever had a live sign-in, so a token that quietly dies mid-session
// still counts as "this player has an account".
const AUTH_SIGNED_IN = 'signed-in';
const AUTH_GUEST = 'guest';
const AUTH_UNKNOWN = 'unknown';

let lastKnownAuth = AUTH_UNKNOWN;
let hasSeenSignedIn = false;

export const getLastKnownAuth = () => lastKnownAuth;

export const _resetAuthStateForTests = () => {
  lastKnownAuth = AUTH_UNKNOWN;
  hasSeenSignedIn = false;
};

// Route one call: cloud when signed in, local otherwise. `pendingCloudSync` marks a
// local write as a *fallback* for an account-holding player (the row gets stamped so
// the UI can be honest and LocalGameSync can heal it later). Plain guests are never
// stamped: local IS their home store, not a pending state.
async function resolveRoute() {
  if (!supabase) {
    // Auth is disabled entirely (missing env), so local is the only store.
    lastKnownAuth = AUTH_GUEST;
    return { useCloud: false, pendingCloudSync: false };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const signedIn = !!session?.access_token;
    lastKnownAuth = signedIn ? AUTH_SIGNED_IN : AUTH_GUEST;
    if (signedIn) hasSeenSignedIn = true;
    // Confirmed signed out: still a fallback if the player signed in earlier this
    // session (their token expired mid-game); a never-signed-in guest is not.
    return { useCloud: signedIn, pendingCloudSync: !signedIn && hasSeenSignedIn };
  } catch (e) {
    logger.warn(`Auth check failed; routing local (last known auth: ${lastKnownAuth})`, e);
    // The player could be signed in behind the blip: stamp pending unless we have
    // positive knowledge they are a plain guest ('unknown' counts as pending-eligible).
    return { useCloud: false, pendingCloudSync: hasSeenSignedIn || lastKnownAuth !== AUTH_GUEST };
  }
}

export const conversationsApi = {
  async list() {
    return (await resolveRoute()).useCloud ? backend.list() : localGameStore.list();
  },

  async getById(sessionId) {
    return (await resolveRoute()).useCloud ? backend.getById(sessionId) : localGameStore.getById(sessionId);
  },

  // save/updateMessages surface WHERE the write landed via a non-breaking `storage`
  // marker ('cloud' | 'local') plus `pendingCloudSync: true` for account-holder
  // fallbacks, so useGamePersistence can report an honest save status. Callers that
  // ignore the extra fields behave exactly as before.
  async save(payload) {
    const route = await resolveRoute();
    if (route.useCloud) {
      const result = await backend.save(payload);
      return { ...(result || {}), storage: 'cloud' };
    }
    const row = await localGameStore.save(payload, { pendingCloudSync: route.pendingCloudSync });
    return { ...row, storage: 'local', pendingCloudSync: !!row.pending_cloud_sync };
  },

  async updateMessages(sessionId, conversationData) {
    const route = await resolveRoute();
    if (route.useCloud) {
      const result = await backend.updateMessages(sessionId, conversationData);
      return { ...(result || {}), storage: 'cloud' };
    }
    const row = await localGameStore.updateMessages(sessionId, conversationData, { pendingCloudSync: route.pendingCloudSync });
    return row ? { ...row, storage: 'local', pendingCloudSync: !!row.pending_cloud_sync } : row;
  },

  async updateName(sessionId, conversationName) {
    return (await resolveRoute()).useCloud ? backend.updateName(sessionId, conversationName) : localGameStore.updateName(sessionId, conversationName);
  },

  async remove(sessionId) {
    return (await resolveRoute()).useCloud ? backend.remove(sessionId) : localGameStore.remove(sessionId);
  }
};
