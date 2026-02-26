import { apiFetch, buildApiUrl } from './apiClient';
import { createLogger } from '../utils/logger';

const API_PATH = '/api/llm';
const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || 'http://localhost:8787';
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
    async generateText({ provider, model, prompt, maxTokens, temperature }) {
        // Route CF Workers requests to the CF Worker endpoint
        if (provider === 'cf-workers') {
            const response = await fetch(`${CF_WORKER_URL}/api/ai/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, model, prompt, maxTokens, temperature }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => null);
                const errorMessage = error?.error || `Failed to generate text: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            return data.text;
        }

        // Route other providers to Express backend
        const response = await apiFetch(`${API_PATH}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, model, prompt, maxTokens, temperature }),
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
