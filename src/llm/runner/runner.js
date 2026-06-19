const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const adapters = require('./adapters');
const { createLogger } = require('../../server/logger');

const logger = createLogger('llm-runner');

// In-memory task store
const tasks = new Map();

// Kill runaway CLI tasks rather than letting them live forever.
const TASK_TIMEOUT_MS = Number(process.env.CLI_TASK_TIMEOUT_MS || 5 * 60 * 1000);
// Cap concurrent CLI processes — these are heavy, agentic tools.
const MAX_CONCURRENT_TASKS = Number(process.env.CLI_MAX_CONCURRENT_TASKS || 2);

// Env vars the child CLIs legitimately need. We pass an allowlist instead of the
// full server environment so server-side secrets aren't handed to spawned processes.
const ENV_ALLOWLIST = [
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM',
    'TMPDIR', 'TEMP', 'TMP', 'NODE_ENV',
    // Config/auth the agent CLIs read directly from the environment.
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
    'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'
];

function buildChildEnv(extra) {
    const env = {};
    for (const key of ENV_ALLOWLIST) {
        if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    return { ...env, ...extra };
}

function createTask({ backend, prompt, model }) {
    const id = randomUUID();
    const adapter = adapters.getAdapter(backend);

    if (!adapter) {
        throw new Error(`Unknown backend: ${backend}`);
    }

    const active = [...tasks.values()].filter(
        t => t.status === 'queued' || t.status === 'running'
    ).length;
    if (active >= MAX_CONCURRENT_TASKS) {
        throw new Error(`Too many concurrent CLI tasks (max ${MAX_CONCURRENT_TASKS}). Try again shortly.`);
    }

    const task = {
        id,
        backend,
        prompt,
        model,
        // cwd is never client-controlled; adapters that need a specific directory
        // (e.g. the Gemini sandbox) set it themselves in buildCommand().
        cwd: process.cwd(),
        status: 'queued',
        logs: [],
        clients: [], // SSE clients
        process: null,
        timeout: null
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

        logger.debug(`Spawning command: ${invocation.command} ${invocation.args.join(' ')}`);

        const child = spawn(invocation.command, invocation.args, {
            cwd: invocation.cwd || task.cwd,
            env: buildChildEnv(invocation.env),
            shell: false // Prevent shell escaping issues with complex prompts
        });

        task.process = child;
        let lineBuffer = '';

        // Terminate the task if it runs longer than the timeout.
        task.timeout = setTimeout(() => {
            logger.warn(`Task ${task.id} exceeded ${TASK_TIMEOUT_MS}ms, terminating`);
            appendLog(task, `Task timed out after ${Math.round(TASK_TIMEOUT_MS / 1000)}s and was terminated.`, 'stderr');
            try { child.kill('SIGKILL'); } catch (e) { /* process already gone */ }
        }, TASK_TIMEOUT_MS);

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
                        logger.debug(
                            `[Task ${task.id}] JSON event type=${parsed.type} role=${parsed.role || '-'} content_len=${(parsed.content || '').length}`
                        );
                        // Only broadcast assistant messages to avoid echoing the prompt
                        if (parsed.type === 'message' && parsed.role === 'assistant' && parsed.content) {
                            appendLog(task, parsed.content, 'stdout');
                        }
                    } catch (e) {
                        // In json-stream mode, we suppress non-JSON lines to avoid breaking immersion.
                        // We only log them to the server console for debugging.
                        logger.debug(`[Task ${task.id}] Suppressed non-JSON stdout`, line);
                    }
                }
            } else {
                appendLog(task, chunk, 'stdout');
            }
        });

        // Flush any remaining data in lineBuffer when stdout ends
        child.stdout.on('end', () => {
            if (invocation.responseFormat === 'json-stream' && lineBuffer.trim()) {
                try {
                    const parsed = JSON.parse(lineBuffer);
                    logger.debug(
                        `[Task ${task.id}] JSON flush type=${parsed.type} role=${parsed.role || '-'} content_len=${(parsed.content || '').length}`
                    );
                    if (parsed.type === 'message' && parsed.role === 'assistant' && parsed.content) {
                        appendLog(task, parsed.content, 'stdout');
                    }
                } catch (e) {
                    logger.debug(`[Task ${task.id}] Suppressed non-JSON flush`, lineBuffer);
                }
                lineBuffer = '';
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
            logger.error(`Task ${task.id} error`, err);
            task.status = 'error';
            broadcast(task, { type: 'status', data: { state: 'error', error: err.message } });
            broadcast(task, { type: 'done', data: { exit_code: -1 } });
            cleanup(task);
        });

        child.on('close', (code) => {
            logger.debug(`Task ${task.id} finished with code ${code}`);
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

    // If task already finished, send done event and close immediately
    if (task.status === 'completed' || task.status === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'done', data: { exit_code: task.status === 'completed' ? 0 : -1 } })}\n\n`);
        res.end();
        return;
    }

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
    if (task.timeout) {
        clearTimeout(task.timeout);
        task.timeout = null;
    }
    task.process = null;
    // End all streams
    task.clients.forEach(res => res.end());
    task.clients = [];
}

module.exports = {
    createTask,
    streamTask
};
