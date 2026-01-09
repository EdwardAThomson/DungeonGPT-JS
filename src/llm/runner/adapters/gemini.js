const BaseAdapter = require('./base');

class GeminiAdapter extends BaseAdapter {
    constructor() {
        super({ binPath: 'gemini' });
    }

    buildCommand(options) {
        // gemini -p "<prompt>" -m <model> --output-format stream-json
        let model = options.model;
        if (!model || model === 'gemini-cli') {
            model = 'gemini-3-flash-preview';
        }
        const args = ['-p', options.prompt, '-m', model, '--output-format', 'stream-json'];

        return {
            command: this.config.binPath,
            args,
            env: {},
            responseFormat: 'json-stream'
        };
    }
}

module.exports = GeminiAdapter;
