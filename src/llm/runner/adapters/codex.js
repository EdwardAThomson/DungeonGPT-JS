const BaseAdapter = require('./base');

class CodexAdapter extends BaseAdapter {
    constructor() {
        super({ binPath: 'codex' });
    }

    buildCommand(options) {
        // codex exec --full-auto --skip-git-repo-check -C <cwd> "<prompt>"
        const args = ['exec', '--full-auto', '--skip-git-repo-check'];

        if (options.cwd) {
            args.push('-C', options.cwd);
        }

        // `--` terminates option parsing so a prompt starting with `-`/`--`
        // is treated as the positional prompt, not as CLI flags.
        args.push('--', options.prompt);

        return {
            command: this.config.binPath,
            args,
            env: {}
        };
    }
}

module.exports = CodexAdapter;
