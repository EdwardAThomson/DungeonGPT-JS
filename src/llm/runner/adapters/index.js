const CodexAdapter = require('./codex');
const ClaudeAdapter = require('./claude');
const GeminiAdapter = require('./gemini');

const adapters = {
    codex: new CodexAdapter(),
    claude: new ClaudeAdapter(),
    gemini: new GeminiAdapter(),
    // Aliases
    'claude-cli': new ClaudeAdapter(),
    'gemini-cli': new GeminiAdapter()
};

function getAdapter(backend) {
    return adapters[backend];
}

module.exports = {
    getAdapter
};
