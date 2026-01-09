const API_URL = 'http://localhost:5000/api/llm';

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
    }
};
