const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

const normalizeLevel = (value) => {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  return LEVELS[normalized] ? normalized : null;
};

const resolveActiveLevel = () => {
  const fromEnv = normalizeLevel(process.env.LOG_LEVEL);
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
};

const ACTIVE_LEVEL = resolveActiveLevel();

const shouldLog = (level) => LEVELS[level] >= LEVELS[ACTIVE_LEVEL];

const createLogger = (namespace = 'server') => {
  const prefix = `[${namespace}]`;
  return {
    debug: (...args) => {
      if (shouldLog('debug')) console.debug(prefix, ...args);
    },
    info: (...args) => {
      if (shouldLog('info')) console.info(prefix, ...args);
    },
    warn: (...args) => {
      if (shouldLog('warn')) console.warn(prefix, ...args);
    },
    error: (...args) => {
      if (shouldLog('error')) console.error(prefix, ...args);
    }
  };
};

const logger = createLogger('server');

module.exports = {
  createLogger,
  logger
};
