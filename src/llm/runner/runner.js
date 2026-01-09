const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const adapters = require('./adapters');

// In-memory task store
const tasks = new Map();

function createTask({ backend, prompt, cwd, model }) {
    const id = randomUUID();
    const adapter = adapters.getAdapter(backend);

    if (!adapter) {
        throw new Error(`Unknown backend: ${backend}`);
    }

    const task = {
        id,
        backend,
        prompt,
        model,
        cwd: cwd || process.cwd(),
        status: 'queued',
        logs: [],
        clients: [], // SSE clients
        process: null
    };

    tasks.set(id, task);

    // Start execution asynchronously
    setImmediate(() => runTask(task, adapter));

    return id;
}

function runTask(task, adapter) {
    task.status = 'running';
    broadcast(task, { type: 'status', data: { state: 'running' } });

    try {
        const invocation = adapter.buildCommand({
            prompt: task.prompt,
            cwd: task.cwd,
            model: task.model
        });

        console.log(`Spawning: ${invocation.command} ${invocation.args.join(' ')}`);

        const child = spawn(invocation.command, invocation.args, {
            cwd: task.cwd,
            env: { ...process.env, ...invocation.env },
            shell: false // Prevent shell escaping issues with complex prompts
        });

        task.process = child;
        let lineBuffer = '';

        child.stdout.on('data', (data) => {
            const chunk = data.toString();

            if (invocation.responseFormat === 'json-stream') {
                lineBuffer += chunk;
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop(); // Keep the last partial line

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        // Only broadcast final messages to the UI to preserve immersion
                        if (parsed.type === 'message' && parsed.content) {
                            appendLog(task, parsed.content, 'stdout');
                        }
                    } catch (e) {
                        // In json-stream mode, we suppress non-JSON lines to avoid breaking immersion.
                        // We only log them to the server console for debugging.
                        console.log(`[Task ${task.id} Debug] Suppressed non-JSON stdout: ${line}`);
                    }
                }
            } else {
                appendLog(task, chunk, 'stdout');
            }
        });

        child.stderr.on('data', (data) => {
            const line = data.toString();
            // Filter out common CLI noise and progress indicators from stderr to preserve immersion
            const noise = [
                'Loaded cached credentials',
                'Thinking...',
                'Fetching',
                'Processing',
                '[' // Progress bars often start with [
            ];

            if (noise.some(p => line.includes(p))) {
                return;
            }
            appendLog(task, line, 'stderr');
        });

        child.on('error', (err) => {
            console.error(`Task ${task.id} error:`, err);
            task.status = 'error';
            broadcast(task, { type: 'status', data: { state: 'error', error: err.message } });
            broadcast(task, { type: 'done', data: { exit_code: -1 } });
            cleanup(task);
        });

        child.on('close', (code) => {
            console.log(`Task ${task.id} finished with code ${code}`);
            task.status = code === 0 ? 'completed' : 'error';
            broadcast(task, { type: 'status', data: { state: task.status } });
            broadcast(task, { type: 'done', data: { exit_code: code } });
            cleanup(task);
        });

    } catch (err) {
        task.status = 'error';
        broadcast(task, { type: 'status', data: { state: 'error', error: err.message } });
        cleanup(task);
    }
}

function streamTask(id, res) {
    const task = tasks.get(id);
    if (!task) {
        throw new Error('Task not found');
    }

    // Add client to broadcast list
    task.clients.push(res);

    // Send initial status and existing logs
    res.write(`data: ${JSON.stringify({ type: 'status', data: { state: task.status } })}\n\n`);
    task.logs.forEach(log => {
        res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
    });

    // Remove client on disconnect
    res.on('close', () => {
        task.clients = task.clients.filter(c => c !== res);
    });
}

function appendLog(task, line, stream) {
    const logEntry = { line, stream, ts: new Date().toISOString() };
    task.logs.push(logEntry);
    broadcast(task, { type: 'log', data: logEntry });
}

function broadcast(task, message) {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    task.clients.forEach(client => {
        client.write(payload);
    });
}

function cleanup(task) {
    // Keep task in memory for history, but maybe remove process ref
    task.process = null;
    // End all streams
    task.clients.forEach(res => res.end());
    task.clients = [];
}

module.exports = {
    createTask,
    streamTask
};
