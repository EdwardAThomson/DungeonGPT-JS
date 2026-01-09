const BaseAdapter = require('./base');

class ClaudeAdapter extends BaseAdapter {
    constructor() {
        super({ binPath: 'claude' });
    }

    buildCommand(options) {
        // claude -p "<prompt>" --output-format json
        // Note: Claude CLI typically runs in the CWD of the shell
        const args = ['-p', options.prompt];

        if (options.model) {
            args.push('--model', options.model);
        }

        // We might want to force non-interactive or JSON mode if available, 
        // but looking at reference, it uses --output-format stream-json
        args.push('--output-format', 'stream-json');

        return {
            command: this.config.binPath,
            args,
            env: {},
            responseFormat: 'json-stream'
        };
    }
}

module.exports = ClaudeAdapter;
