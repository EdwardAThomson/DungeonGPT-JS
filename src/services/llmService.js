import { apiFetch, buildApiUrl } from './apiClient';
import { createLogger } from '../utils/logger';
import { supabase } from './supabaseClient';
import { getRequestPool, recordPoolOutcome } from './aiPool';

const API_PATH = '/api/llm';
const rawCfWorkerUrl = process.env.REACT_APP_CF_WORKER_URL || 'http://localhost:8787';
const CF_WORKER_URL = rawCfWorkerUrl.replace('https://localhost', 'http://localhost');
const logger = createLogger('llm-service');

const sanitizeResponse = (text) => {
    if (!text) return '';

    // Remove protocol block if it exists
    let sanitized = text.replace(/\[STRICT DUNGEON MASTER PROTOCOL\][\s\S]*?\[\/STRICT DUNGEON MASTER PROTOCOL\]/gi, '');

    // Remove common prompt markers
    const markers = [
        /\[ADVENTURE START\]/gi,
        /\[GAME INFORMATION\]/gi,
        /\[TASK\]/gi,
        /\[CONTEXT\]/gi,
        /\[SUMMARY\]/gi,
        /\[PLAYER ACTION\]/gi,
        /\[NARRATE\]/gi
    ];

    markers.forEach(marker => {
        sanitized = sanitized.replace(marker, '');
    });

    return sanitized.trim();
};

export const llmService = {
    /**
     * Standard text generation (non-streaming)
     */
    async generateText({ provider, model, prompt, maxTokens, temperature, systemPrompt }) {
        // The worker's schema hard-caps maxTokens at 1500 and REJECTS (zod 400)
        // anything above it, which took down every AI call when a caller passed
        // 1600 (playtest 2026-07-07). Clamp at the seam: a stray future value
        // should shorten the reply, never fail the request.
        if (typeof maxTokens === 'number') maxTokens = Math.min(maxTokens, 1500);
        // Route CF Workers requests to the CF Worker endpoint
        if (provider === 'cf-workers') {
            const cfHeaders = { 'Content-Type': 'application/json' };

            // Always attach Supabase auth to CF Worker requests.
            // The worker verifies JWTs to protect Cloudflare AI credits.
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.access_token) {
                        cfHeaders['Authorization'] = `Bearer ${session.access_token}`;
                    } else {
                        logger.warn('No active Supabase session - CF Worker will reject unauthenticated requests');
                    }
                } catch (authErr) {
                    logger.warn('Failed to get Supabase session for CF auth:', authErr);
                }
            } else {
                logger.warn('Supabase client not initialized - CF Worker requests will be unauthenticated');
            }

            const postGenerate = async (pool) => {
                const body = { provider, model, prompt, maxTokens, temperature, pool };
                if (systemPrompt) body.systemPrompt = systemPrompt;
                let response;
                try {
                    response = await fetch(`${CF_WORKER_URL}/api/ai/generate`, {
                        method: 'POST',
                        headers: cfHeaders,
                        body: JSON.stringify(body),
                    });
                } catch (fetchErr) {
                    logger.error('CF Worker fetch failed:', fetchErr, '- URL:', CF_WORKER_URL);
                    throw new Error(`Cannot reach CF Worker at ${CF_WORKER_URL}. Is the worker running? (${fetchErr.message})`);
                }
                const data = await response.json().catch(() => null);
                return { response, data };
            };

            // Pool selection (backlog #7): 'premium' only goes out for member+
            // accounts that picked it (aiPool.getRequestPool). The Worker replies
            // with the pool ACTUALLY used; premium refusals with a code
            // (premium_cap / premium_required) trigger ONE quiet retry on the free
            // pool, so a generation is never dead and play never interrupts.
            const requestedPool = getRequestPool();
            let { response, data } = await postGenerate(requestedPool);

            let premiumFellBack = false;
            if (
                !response.ok &&
                requestedPool === 'premium' &&
                (data?.code === 'premium_cap' || data?.code === 'premium_required')
            ) {
                logger.warn(`Premium pool refused (${data.code}); retrying on the free pool`);
                recordPoolOutcome({ requestedPool: 'premium', usedPool: 'free', reason: data.code });
                premiumFellBack = true;
                ({ response, data } = await postGenerate('free'));
            }

            if (!response.ok) {
                let errorMessage = data?.error || `CF Worker error ${response.status}: ${response.statusText}`;
                if (data?.code === 'rate_limited' && data?.retryAfterSeconds) {
                    errorMessage = `${errorMessage} (try again in ${data.retryAfterSeconds}s)`;
                }
                throw new Error(errorMessage);
            }

            if (!data || typeof data.text !== 'string') {
                throw new Error('CF Worker returned an unexpected response body');
            }

            // Surface the pool actually used (server may itself have fallen back
            // to free on OpenRouter trouble: fallbackFrom === 'premium').
            if (requestedPool === 'premium' && !premiumFellBack) {
                if (data.fallbackFrom === 'premium') {
                    recordPoolOutcome({
                        requestedPool: 'premium',
                        usedPool: 'free',
                        reason: data.fallbackReason || 'premium_error',
                    });
                } else {
                    recordPoolOutcome({
                        requestedPool: 'premium',
                        usedPool: data.pool || 'premium',
                        reason: null,
                    });
                }
            }

            return data.text;
        }

        // Route other providers to Express backend
        const body = { provider, model, prompt, maxTokens, temperature };
        if (systemPrompt) body.systemPrompt = systemPrompt;
        const response = await apiFetch(`${API_PATH}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            const errorMessage = error?.error?.message || error?.error || `Failed to generate text: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data.text;
    },

    /**
     * Create a streaming task (CLI based)
     */
    async createTask(backend, prompt, cwd, model) {
        const response = await apiFetch(`${API_PATH}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backend, prompt, cwd, model }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            const errorMessage = error?.error?.message || error?.error || `Failed to create task: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        return response.json();
    },

    /**
     * Stream output from a task using SSE
     */
    streamTask(taskId, onUpdate) {
        const eventSource = new EventSource(buildApiUrl(`${API_PATH}/tasks/${taskId}/stream`));

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onUpdate(data);

                if (data.type === 'done' || data.type === 'error') {
                    eventSource.close();
                }
            } catch (err) {
                logger.error('Failed to parse SSE message', err);
            }
        };

        eventSource.onerror = (err) => {
            logger.error('EventSource error:', err);
            eventSource.close();
            onUpdate({ type: 'error', data: 'Connection lost' });
        };

        return () => {
            eventSource.close();
        };
    },

    /**
     * Unified generation that handles both Cloud and CLI providers
     * @param {Function} onProgress - Optional callback for progress updates: ({ status, elapsed, hasContent })
     */
    async generateUnified({ provider, model, prompt, maxTokens, temperature, onProgress }) {
        const isCli = ['codex', 'claude-cli', 'gemini-cli'].includes(provider);

        if (isCli) {
            let cliBackend = 'codex';
            if (provider === 'claude-cli') cliBackend = 'claude';
            if (provider === 'gemini-cli') cliBackend = 'gemini';

            const { id } = await this.createTask(cliBackend, prompt, undefined, model);
            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                let fullText = '';
                let lastProgressUpdate = 0;
                this.streamTask(id, (update) => {
                    if (update.type === 'status' && onProgress) {
                        const elapsed = Math.floor((Date.now() - startTime) / 1000);
                        if (elapsed > lastProgressUpdate + 2) { // Throttle to every 3 seconds
                            lastProgressUpdate = elapsed;
                            onProgress({ status: update.data?.state || 'working', elapsed, hasContent: fullText.length > 0 });
                        }
                    }
                    if (update.type === 'log' && update.data.stream === 'stdout') {
                        fullText += update.data.line + '\n';
                    } else if (update.type === 'done') {
                        if (onProgress) onProgress({ status: 'done', elapsed: Math.floor((Date.now() - startTime) / 1000), hasContent: true });
                        resolve(sanitizeResponse(fullText));
                    } else if (update.type === 'error') {
                        if (onProgress) onProgress({ status: 'error', elapsed: Math.floor((Date.now() - startTime) / 1000), hasContent: false });
                        reject(new Error(update.data));
                    }
                });
            });
        } else {
            const responseText = await this.generateText({
                provider,
                model,
                prompt,
                maxTokens: maxTokens || 1000,
                temperature: temperature || 0.7
            });
            return sanitizeResponse(responseText);
        }
    }
};
