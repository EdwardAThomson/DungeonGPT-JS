const API_URL = 'http://localhost:5000/api/llm';

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
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, model, prompt, maxTokens, temperature }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to generate text: ${response.statusText}`);
        }

        const data = await response.json();
        return data.text;
    },

    /**
     * Create a streaming task (CLI based)
     */
    async createTask(backend, prompt, cwd, model) {
        const response = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backend, prompt, cwd, model }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create task: ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Stream output from a task using SSE
     */
    streamTask(taskId, onUpdate) {
        const eventSource = new EventSource(`${API_URL}/tasks/${taskId}/stream`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onUpdate(data);

                if (data.type === 'done' || data.type === 'error') {
                    eventSource.close();
                }
            } catch (err) {
                console.error('Failed to parse SSE message', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('EventSource error:', err);
            eventSource.close();
            onUpdate({ type: 'error', data: 'Connection lost' });
        };

        return () => {
            eventSource.close();
        };
    },

    /**
     * Unified generation that handles both Cloud and CLI providers
     */
    async generateUnified({ provider, model, prompt, maxTokens, temperature }) {
        const isCli = ['codex', 'claude-cli', 'gemini-cli'].includes(provider);

        if (isCli) {
            let cliBackend = 'codex';
            if (provider === 'claude-cli') cliBackend = 'claude';
            if (provider === 'gemini-cli') cliBackend = 'gemini';

            const { id } = await this.createTask(cliBackend, prompt, undefined, model);

            return new Promise((resolve, reject) => {
                let fullText = '';
                this.streamTask(id, (update) => {
                    if (update.type === 'log' && update.data.stream === 'stdout') {
                        fullText += update.data.line + '\n';
                    } else if (update.type === 'done') {
                        resolve(sanitizeResponse(fullText));
                    } else if (update.type === 'error') {
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
