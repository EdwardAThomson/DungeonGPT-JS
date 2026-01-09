class BaseAdapter {
    constructor(config) {
        this.config = config;
    }

    buildCommand(options) {
        throw new Error('buildCommand must be implemented by subclass');
    }
}

module.exports = BaseAdapter;
