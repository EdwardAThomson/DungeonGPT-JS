import { supabase } from './supabaseClient';
import { createLogger } from '../utils/logger';

const rawCfWorkerUrl = process.env.REACT_APP_CF_WORKER_URL || 'http://localhost:8787';
const CF_WORKER_URL = rawCfWorkerUrl.replace('https://localhost', 'http://localhost');
const logger = createLogger('embedding-service');

/**
 * Get auth headers for CF Worker requests (same pattern as llmService).
 */
const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      } else {
        logger.warn('No active Supabase session — embed requests will be rejected by CF Worker');
      }
    } catch (err) {
      logger.warn('Failed to get Supabase session for embedding auth:', err);
    }
  } else {
    logger.warn('Supabase not initialized — embed requests will be unauthenticated');
  }
  return headers;
};

/**
 * Embed one or more text strings via the CF Worker.
 * @param {string|string[]} text - Single string or array of strings to embed
 * @returns {Promise<{ vectors: number[][], dimensions: number, count: number }>}
 */
export const embed = async (text) => {
  const headers = await getAuthHeaders();

  let response;
  try {
    response = await fetch(`${CF_WORKER_URL}/api/embed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });
  } catch (fetchErr) {
    logger.error('Embedding fetch failed:', fetchErr);
    throw new Error(`Cannot reach CF Worker for embeddings: ${fetchErr.message}`);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const msg = error?.error || `${response.status} ${response.statusText}`;
    logger.error(`Embedding request failed: ${msg}`);
    throw new Error(msg);
  }

  return response.json();
};

/**
 * Embed a single text string and return just the vector.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export const embedSingle = async (text) => {
  const result = await embed(text);
  return result.vectors[0];
};

export const embeddingService = { embed, embedSingle };
