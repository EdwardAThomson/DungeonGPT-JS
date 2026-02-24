const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const dotenv = require('dotenv');
const llmBackend = require('./llm/llmBackend');
const runner = require('./llm/runner/runner');
const { createLogger } = require('./server/logger');

dotenv.config();
const logger = createLogger('server');

const app = express();
const port = Number(process.env.PORT || 5000);
const dbPath = process.env.SQLITE_DB_PATH || './src/game.db';
const isProduction = process.env.NODE_ENV === 'production';

const sendError = (res, status, message, details = null) => {
  const payload = { error: { message } };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
};

const parseCsv = (value) => (value || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const corsAllowedOrigins = parseCsv(process.env.CORS_ALLOWED_ORIGINS);
const defaultDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const effectiveAllowedOrigins = corsAllowedOrigins.length > 0
  ? corsAllowedOrigins
  : (isProduction ? [] : defaultDevOrigins);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (curl/postman/server-to-server)
    if (!origin) return callback(null, true);
    if (effectiveAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token'],
  credentials: true,
  optionsSuccessStatus: 204,
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const buildValidationError = (res, errors) => sendError(res, 400, 'Validation failed', errors);

const requireApiAuth = process.env.REQUIRE_API_AUTH === 'true';
const apiAuthToken = process.env.API_AUTH_TOKEN || '';

const extractAuthToken = (req) => {
  const headerToken = req.get('x-api-token');
  if (isNonEmptyString(headerToken)) return headerToken.trim();

  const authHeader = req.get('authorization');
  if (isNonEmptyString(authHeader) && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
};

const requireApiAuthMiddleware = (req, res, next) => {
  if (!requireApiAuth) return next();
  if (!apiAuthToken) {
    return sendError(res, 500, 'Server auth is enabled but API_AUTH_TOKEN is missing.');
  }
  const providedToken = extractAuthToken(req);
  if (!providedToken || providedToken !== apiAuthToken) {
    return sendError(res, 401, 'Unauthorized');
  }
  return next();
};

const validateCharacterPayload = (payload) => {
  const errors = [];

  if (!isPlainObject(payload)) {
    return ['Request body must be a JSON object.'];
  }

  const requiredStringFields = [
    'characterId',
    'characterName',
    'characterGender',
    'profilePicture',
    'characterRace',
    'characterClass',
    'characterBackground',
    'characterAlignment'
  ];

  requiredStringFields.forEach((field) => {
    if (!isNonEmptyString(payload[field])) {
      errors.push(`${field} must be a non-empty string.`);
    }
  });

  if (!Number.isInteger(payload.characterLevel) || payload.characterLevel < 1 || payload.characterLevel > 20) {
    errors.push('characterLevel must be an integer between 1 and 20.');
  }

  if (!isPlainObject(payload.stats)) {
    errors.push('stats must be an object.');
  } else {
    const requiredStats = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
    requiredStats.forEach((statKey) => {
      if (!isFiniteNumber(payload.stats[statKey])) {
        errors.push(`stats.${statKey} must be a number.`);
      }
    });
  }

  return errors;
};

const validateHeroPayload = (payload) => {
  const errors = [];

  if (!isPlainObject(payload)) {
    return ['Request body must be a JSON object.'];
  }

  const requiredStringFields = [
    'heroId',
    'heroName',
    'heroGender',
    'profilePicture',
    'heroRace',
    'heroClass',
    'heroBackground',
    'heroAlignment'
  ];

  requiredStringFields.forEach((field) => {
    if (!isNonEmptyString(payload[field])) {
      errors.push(`${field} must be a non-empty string.`);
    }
  });

  if (!Number.isInteger(payload.heroLevel) || payload.heroLevel < 1 || payload.heroLevel > 20) {
    errors.push('heroLevel must be an integer between 1 and 20.');
  }

  if (!isPlainObject(payload.stats)) {
    errors.push('stats must be an object.');
  } else {
    const requiredStats = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
    requiredStats.forEach((statKey) => {
      if (!isFiniteNumber(payload.stats[statKey])) {
        errors.push(`stats.${statKey} must be a number.`);
      }
    });
  }

  return errors;
};

const validateConversationSavePayload = (payload) => {
  const errors = [];
  if (!isPlainObject(payload)) {
    return ['Request body must be a JSON object.'];
  }

  if (!isNonEmptyString(payload.sessionId)) {
    errors.push('sessionId must be a non-empty string.');
  }
  if (!Array.isArray(payload.conversation)) {
    errors.push('conversation must be an array.');
  }
  if (payload.timestamp && Number.isNaN(Date.parse(payload.timestamp))) {
    errors.push('timestamp must be a valid ISO datetime string.');
  }
  if (payload.provider && !isNonEmptyString(payload.provider)) {
    errors.push('provider must be a non-empty string when provided.');
  }
  if (payload.model && !isNonEmptyString(payload.model)) {
    errors.push('model must be a non-empty string when provided.');
  }
  if (payload.conversationName && !isNonEmptyString(payload.conversationName)) {
    errors.push('conversationName must be a non-empty string when provided.');
  }
  if (payload.gameSettings && !isPlainObject(payload.gameSettings)) {
    errors.push('gameSettings must be an object when provided.');
  }
  if (payload.selectedHeroes && !Array.isArray(payload.selectedHeroes)) {
    errors.push('selectedHeroes must be an array when provided.');
  }
  if (payload.worldMap && !Array.isArray(payload.worldMap)) {
    errors.push('worldMap must be an array when provided.');
  }
  if (payload.playerPosition) {
    if (!isPlainObject(payload.playerPosition)) {
      errors.push('playerPosition must be an object when provided.');
    } else {
      if (!isFiniteNumber(payload.playerPosition.x) || !isFiniteNumber(payload.playerPosition.y)) {
        errors.push('playerPosition.x and playerPosition.y must be numbers.');
      }
    }
  }
  if (payload.sub_maps && !isPlainObject(payload.sub_maps)) {
    errors.push('sub_maps must be an object when provided.');
  }
  if (payload.subMaps && !isPlainObject(payload.subMaps)) {
    errors.push('subMaps must be an object when provided.');
  }

  return errors;
};

const validateConversationMessagesPayload = (payload) => {
  if (!isPlainObject(payload) || !Array.isArray(payload.conversation_data)) {
    return ['conversation_data is required and must be an array.'];
  }
  return [];
};

const validateConversationNamePayload = (payload) => {
  const errors = [];
  if (!isPlainObject(payload) || !isNonEmptyString(payload.conversationName)) {
    errors.push('conversationName is required and must be a non-empty string.');
  } else if (payload.conversationName.trim().length > 140) {
    errors.push('conversationName must be 140 characters or fewer.');
  }
  return errors;
};

const validateLlmGeneratePayload = (payload) => {
  const errors = [];
  const allowedProviders = ['openai', 'gemini', 'claude'];
  if (!isPlainObject(payload)) return ['Request body must be a JSON object.'];
  if (!allowedProviders.includes(payload.provider)) {
    errors.push(`provider must be one of: ${allowedProviders.join(', ')}.`);
  }
  if (!isNonEmptyString(payload.model)) {
    errors.push('model is required and must be a non-empty string.');
  }
  if (!isNonEmptyString(payload.prompt)) {
    errors.push('prompt is required and must be a non-empty string.');
  }
  if (payload.maxTokens !== undefined && (!Number.isInteger(payload.maxTokens) || payload.maxTokens <= 0 || payload.maxTokens > 8000)) {
    errors.push('maxTokens must be an integer between 1 and 8000 when provided.');
  }
  if (payload.temperature !== undefined && (!isFiniteNumber(payload.temperature) || payload.temperature < 0 || payload.temperature > 2)) {
    errors.push('temperature must be a number between 0 and 2 when provided.');
  }
  return errors;
};

const validateLlmTaskPayload = (payload) => {
  const errors = [];
  const allowedBackends = ['codex', 'claude', 'gemini', 'claude-cli', 'gemini-cli'];
  if (!isPlainObject(payload)) return ['Request body must be a JSON object.'];
  if (!allowedBackends.includes(payload.backend)) {
    errors.push(`backend must be one of: ${allowedBackends.join(', ')}.`);
  }
  if (!isNonEmptyString(payload.prompt)) {
    errors.push('prompt is required and must be a non-empty string.');
  }
  if (payload.cwd !== undefined && !isNonEmptyString(payload.cwd)) {
    errors.push('cwd must be a non-empty string when provided.');
  }
  if (payload.model !== undefined && !isNonEmptyString(payload.model)) {
    errors.push('model must be a non-empty string when provided.');
  }
  return errors;
};

app.use(cors(corsOptions));
app.use((err, req, res, next) => {
  if (err && err.message === 'Origin not allowed by CORS') {
    return sendError(res, 403, err.message);
  }
  return next(err);
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize SQLite database
// create a table called:  characterstable
// create schema for character stats

/*
  characterId
  Name, Gender, profilePicture
  Race, Class, Level, Background, Alignment
  Stats [Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma]

  */


/*  --- this comes from HeroCreation.js
     const newCharacter = {
      characterId: characterToEdit?.characterId || uuidv4(), //newCharacterId,
      characterName: characterName,
      characterGender: selectedGender,
      profilePicture: selectedProfilePicture,
      characterRace: selectedRace,
      characterClass: selectedClass,
      characterLevel: level,
      characterBackground: characterBackground,
      characterAlignment: alignment,
      stats: stats,
    };
 */


/*
 * Previously I had
 * db.run(`CREATE TABLE IF NOT EXISTS characterstable (
 *           id INTEGER PRIMARY KEY AUTOINCREMENT,
 *
 */

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Error opening database', err);
  } else {
    logger.info('Connected to SQLite database');
    // language=SQL format=false
    db.run(`CREATE TABLE IF NOT EXISTS characterstable (
             characterId TEXT PRIMARY KEY,
             characterName TEXT,
             characterGender TEXT,
             profilePicture TEXT,
             characterRace TEXT,
             characterClass TEXT,
             characterLevel INTEGER,
             characterBackground TEXT,
             characterAlignment TEXT,
             stats TEXT
           )`, (err) => {
      if (err) {
        logger.error('Error creating table', err);
      } else {
        logger.debug('Characters table created or already exists');
      }
    });

    // Create heroestable (new schema with hero* column names)
    db.run(`CREATE TABLE IF NOT EXISTS heroestable (
             heroId TEXT PRIMARY KEY,
             heroName TEXT,
             heroGender TEXT,
             profilePicture TEXT,
             heroRace TEXT,
             heroClass TEXT,
             heroLevel INTEGER,
             heroBackground TEXT,
             heroAlignment TEXT,
             stats TEXT
           )`, (err) => {
      if (err) {
        logger.error('Error creating heroes table', err);
      } else {
        logger.debug('Heroes table created or already exists');
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS conversations (
             sessionId TEXT PRIMARY KEY,
             conversation_data TEXT,
             provider TEXT,
             timestamp TEXT,
             conversation_name TEXT,
             game_settings TEXT,
             selected_heroes TEXT,
             summary TEXT,
             world_map TEXT,
             player_position TEXT,
             sub_maps TEXT
           )`, (err) => {
      if (err) {
        logger.error('Error creating conversations table', err);
      } else {
        logger.debug('Conversations table created or already exists');

        // Add new columns if they don't exist (for existing databases)
        db.run(`ALTER TABLE conversations ADD COLUMN conversation_name TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding conversation_name column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN game_settings TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding game_settings column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN selected_heroes TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding selected_heroes column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN summary TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding summary column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN world_map TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding world_map column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN player_position TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding player_position column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN model TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding model column', err);
          }
        });

        db.run(`ALTER TABLE conversations ADD COLUMN sub_maps TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.error('Error adding sub_maps column', err);
          }
        });
      }
    });
  }
});

// Define routes
// These are the API methods

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'dungeongpt-js-api' });
});

app.use(['/characters', '/heroes', '/api/conversations', '/api/llm'], requireApiAuthMiddleware);


/* // First route: a route to add a new character
  0. characterId
  1. Name, 2. Gender, 3. profilePicture
  4. Race, 5. Class, 6. Level, 7. Background, 8. Alignment
  9. Strength, Dexterity, Constitution, Intelligence, Wisdom, 14. Charisma
  */

// Route to add a new character
app.post('/characters', (req, res) => {
  const validationErrors = validateCharacterPayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }

  const { characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, stats } = req.body;
  logger.debug('Adding character', [characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, JSON.stringify(stats)]);

  const query = `INSERT INTO characterstable (characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, JSON.stringify(stats)];

  db.run(query, params, function (err) {
    if (err) {
      logger.error('Error adding character', err);
      return sendError(res, 500, 'Failed to add character');
    } else {
      res.json({ id: this.lastID });
    }
  });
});

// Route to update an existing character
app.put('/characters/:characterId', (req, res) => {
  const { characterId } = req.params;
  if (!isNonEmptyString(characterId)) {
    return buildValidationError(res, ['characterId route parameter is required.']);
  }

  const validationErrors = validateCharacterPayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }

  if (req.body.characterId !== characterId) {
    return buildValidationError(res, ['characterId in body must match route parameter.']);
  }

  const { characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, stats } = req.body;

  logger.debug('Updating character', characterId, [characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, JSON.stringify(stats)]);

  const query = `
    UPDATE characterstable 
    SET characterName = ?, 
        characterGender = ?, 
        profilePicture = ?, 
        characterRace = ?, 
        characterClass = ?, 
        characterLevel = ?, 
        characterBackground = ?, 
        characterAlignment = ?, 
        stats = ? 
    WHERE characterId = ?`;

  const params = [
    characterName,
    characterGender,
    profilePicture,
    characterRace,
    characterClass,
    characterLevel,
    characterBackground,
    characterAlignment,
    JSON.stringify(stats),
    characterId
  ];

  db.run(query, params, function (err) {
    if (err) {
      logger.error('Error updating character', err);
      return sendError(res, 500, 'Failed to update character');
    } else if (this.changes === 0) {
      return sendError(res, 404, 'Character not found');
    } else {
      res.json({ message: 'Character updated successfully' });
    }
  });
});

// Route to get all characters
app.get('/characters', (req, res) => {

  db.all('SELECT * FROM characterstable', [], (err, rows) => {

    if (err) {
      logger.error('Error retrieving characters', err);
      return sendError(res, 500, 'Failed to retrieve characters');
    } else {

      //old res.json(rows);

      // Parse the stats JSON string for each row
      const parsedRows = rows.map(row => ({
        ...row,
        stats: JSON.parse(row.stats)
      }));
      res.json(parsedRows);

    }
  });

});

// ===== NEW HEROES API ENDPOINTS =====

// Route to add a new hero
app.post('/heroes', (req, res) => {
  const validationErrors = validateHeroPayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }

  const { heroId, heroName, heroGender, profilePicture, heroRace, heroClass, heroLevel, heroBackground, heroAlignment, stats } = req.body;
  logger.debug('Adding hero', [heroId, heroName, heroGender, profilePicture, heroRace, heroClass, heroLevel, heroBackground, heroAlignment, JSON.stringify(stats)]);

  const query = `INSERT INTO heroestable (heroId, heroName, heroGender, profilePicture, heroRace, heroClass, heroLevel, heroBackground, heroAlignment, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [heroId, heroName, heroGender, profilePicture, heroRace, heroClass, heroLevel, heroBackground, heroAlignment, JSON.stringify(stats)];

  db.run(query, params, function (err) {
    if (err) {
      logger.error('Error adding hero', err);
      return sendError(res, 500, 'Failed to add hero');
    } else {
      res.json({ id: this.lastID });
    }
  });
});

// Route to update an existing hero
app.put('/heroes/:heroId', (req, res) => {
  const { heroId } = req.params;
  if (!isNonEmptyString(heroId)) {
    return buildValidationError(res, ['heroId route parameter is required.']);
  }

  const validationErrors = validateHeroPayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }

  if (req.body.heroId !== heroId) {
    return buildValidationError(res, ['heroId in body must match route parameter.']);
  }

  const { heroName, heroGender, profilePicture, heroRace, heroClass, heroLevel, heroBackground, heroAlignment, stats } = req.body;

  logger.debug('Updating hero', heroId, [heroName, heroGender, profilePicture, heroRace, heroClass, heroLevel, heroBackground, heroAlignment, JSON.stringify(stats)]);

  const query = `
    UPDATE heroestable 
    SET heroName = ?, 
        heroGender = ?, 
        profilePicture = ?, 
        heroRace = ?, 
        heroClass = ?, 
        heroLevel = ?, 
        heroBackground = ?, 
        heroAlignment = ?, 
        stats = ? 
    WHERE heroId = ?`;

  const params = [
    heroName,
    heroGender,
    profilePicture,
    heroRace,
    heroClass,
    heroLevel,
    heroBackground,
    heroAlignment,
    JSON.stringify(stats),
    heroId
  ];

  db.run(query, params, function (err) {
    if (err) {
      logger.error('Error updating hero', err);
      return sendError(res, 500, 'Failed to update hero');
    } else if (this.changes === 0) {
      return sendError(res, 404, 'Hero not found');
    } else {
      res.json({ message: 'Hero updated successfully' });
    }
  });
});

// Route to get all heroes
app.get('/heroes', (req, res) => {
  db.all('SELECT * FROM heroestable', [], (err, rows) => {
    if (err) {
      logger.error('Error retrieving heroes', err);
      return sendError(res, 500, 'Failed to retrieve heroes');
    } else {
      // Parse the stats JSON string for each row
      const parsedRows = rows.map(row => ({
        ...row,
        stats: JSON.parse(row.stats)
      }));
      res.json(parsedRows);
    }
  });
});

// Route to delete a hero
app.delete('/heroes/:heroId', (req, res) => {
  const { heroId } = req.params;
  if (!isNonEmptyString(heroId)) {
    return buildValidationError(res, ['heroId route parameter is required.']);
  }

  db.run('DELETE FROM heroestable WHERE heroId = ?', [heroId], function(err) {
    if (err) {
      logger.error('Error deleting hero', err);
      return sendError(res, 500, 'Failed to delete hero');
    }
    if (this.changes === 0) {
      return sendError(res, 404, 'Hero not found');
    }
    logger.info(`Hero deleted: ${heroId}`);
    res.json({ message: 'Hero deleted successfully', heroId });
  });
});

// GET endpoint to fetch all conversations (API version)
app.get('/api/conversations', (req, res) => {
  const query = `SELECT * FROM conversations ORDER BY timestamp DESC`;

  db.all(query, [], (err, rows) => {
    if (err) {
      logger.error('Error retrieving conversations', err);
      return sendError(res, 500, 'Failed to retrieve conversations');
    } else {
      res.json(rows);
    }
  });
});

// --- New Conversation Saving Endpoint (SQLite Version) ---
app.post('/api/conversations', (req, res) => {
  try {
    const validationErrors = validateConversationSavePayload(req.body);
    if (validationErrors.length > 0) {
      return buildValidationError(res, validationErrors);
    }

    const { sessionId, conversation, provider, model, timestamp, conversationName, gameSettings, selectedHeroes, currentSummary, worldMap, playerPosition, sub_maps, subMaps } = req.body;
    const effectiveSubMaps = sub_maps || subMaps;

    logger.debug('Received save request', {
      sessionId,
      provider,
      model,
      modelType: typeof model
    });
    // Convert conversation array to JSON string for storage
    const conversationJson = JSON.stringify(conversation);
    const settingsJson = gameSettings ? JSON.stringify(gameSettings) : null;
    const heroesJson = selectedHeroes ? JSON.stringify(selectedHeroes) : null;
    const mapJson = worldMap ? JSON.stringify(worldMap) : null;
    const positionJson = playerPosition ? JSON.stringify(playerPosition) : null;
    const subMapsJson = effectiveSubMaps ? JSON.stringify(effectiveSubMaps) : null;

    // SQL Query using ON CONFLICT for Upsert behavior
    const query = `
      INSERT INTO conversations (sessionId, conversation_data, provider, model, timestamp, conversation_name, game_settings, selected_heroes, summary, world_map, player_position, sub_maps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (sessionId)
      DO UPDATE SET
        conversation_data = excluded.conversation_data,
        provider = excluded.provider,
        model = excluded.model,
        timestamp = excluded.timestamp,
        conversation_name = excluded.conversation_name,
        game_settings = excluded.game_settings,
        selected_heroes = excluded.selected_heroes,
        summary = excluded.summary,
        world_map = excluded.world_map,
        player_position = excluded.player_position,
        sub_maps = excluded.sub_maps;
    `;

    const params = [
      sessionId,
      conversationJson,
      provider,
      model,
      timestamp,
      conversationName || `Game Session ${new Date(timestamp).toLocaleDateString()}`,
      settingsJson,
      heroesJson,
      currentSummary,
      mapJson,
      positionJson,
      subMapsJson
    ];

    db.run(query, params, function (err) {
      if (err) {
        logger.error('Error saving conversation to SQLite', err);
        return sendError(res, 500, 'Server error saving conversation', err.message);
      }

      logger.debug(`Conversation saved/updated for session ${sessionId}. Rows affected: ${this.changes}`);
      res.status(201).json({ message: 'Conversation saved successfully', sessionId });
    });

  } catch (error) {
    logger.error('Unexpected error in /api/conversations', error);
    return sendError(res, 500, 'Unexpected server error', error.message);
  }
});

// Get a specific conversation by sessionId
app.get('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!isNonEmptyString(sessionId)) {
    return buildValidationError(res, ['sessionId route parameter is required.']);
  }

  const query = `SELECT * FROM conversations WHERE sessionId = ?`;

  db.get(query, [sessionId], (err, row) => {
    if (err) {
      logger.error('Error retrieving conversation', err);
      return sendError(res, 500, 'Failed to retrieve conversation');
    } else if (!row) {
      return sendError(res, 404, 'Conversation not found');
    } else {
      // Parse JSON fields back to objects
      const conversation = {
        ...row,
        conversation_data: JSON.parse(row.conversation_data),
        game_settings: row.game_settings ? JSON.parse(row.game_settings) : null,
        selected_heroes: row.selected_heroes ? JSON.parse(row.selected_heroes) : null,
        world_map: row.world_map ? JSON.parse(row.world_map) : null,
        player_position: row.player_position ? JSON.parse(row.player_position) : null,
        sub_maps: row.sub_maps ? JSON.parse(row.sub_maps) : null
      };
      res.json(conversation);
    }
  });
});

// Update conversation data (messages)
app.put('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!isNonEmptyString(sessionId)) {
    return buildValidationError(res, ['sessionId route parameter is required.']);
  }
  const validationErrors = validateConversationMessagesPayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }
  const { conversation_data } = req.body;

  const conversationDataStr = JSON.stringify(conversation_data);
  const query = `UPDATE conversations SET conversation_data = ? WHERE sessionId = ?`;

  db.run(query, [conversationDataStr, sessionId], function (err) {
    if (err) {
      logger.error('Error updating conversation data', err);
      return sendError(res, 500, 'Server error updating conversation data');
    } else if (this.changes === 0) {
      return sendError(res, 404, 'Conversation not found');
    } else {
      res.json({ message: 'Conversation data updated successfully' });
    }
  });
});

// Update conversation name
app.put('/api/conversations/:sessionId/name', (req, res) => {
  const { sessionId } = req.params;
  if (!isNonEmptyString(sessionId)) {
    return buildValidationError(res, ['sessionId route parameter is required.']);
  }
  const validationErrors = validateConversationNamePayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }
  const { conversationName } = req.body;

  const query = `UPDATE conversations SET conversation_name = ? WHERE sessionId = ?`;

  db.run(query, [conversationName.trim(), sessionId], function (err) {
    if (err) {
      logger.error('Error updating conversation name', err);
      return sendError(res, 500, 'Server error updating conversation name');
    } else if (this.changes === 0) {
      return sendError(res, 404, 'Conversation not found');
    } else {
      res.json({ message: 'Conversation name updated successfully' });
    }
  });
});

// Delete a conversation
app.delete('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!isNonEmptyString(sessionId)) {
    return buildValidationError(res, ['sessionId route parameter is required.']);
  }

  const query = `DELETE FROM conversations WHERE sessionId = ?`;

  db.run(query, [sessionId], function (err) {
    if (err) {
      logger.error('Error deleting conversation', err);
      return sendError(res, 500, 'Server error deleting conversation');
    } else if (this.changes === 0) {
      return sendError(res, 404, 'Conversation not found');
    } else {
      res.json({ message: 'Conversation deleted successfully' });
    }
  });
});

// --- Unified LLM Endpoints ---

// Standard generation (SDK-based)
app.post('/api/llm/generate', async (req, res) => {
  const validationErrors = validateLlmGeneratePayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }
  try {
    const response = await llmBackend.generateText(req.body);
    res.json({ text: response });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// CLI Task Creation
app.post('/api/llm/tasks', (req, res) => {
  const validationErrors = validateLlmTaskPayload(req.body);
  if (validationErrors.length > 0) {
    return buildValidationError(res, validationErrors);
  }
  const { backend, prompt, cwd, model } = req.body;
  try {
    const taskId = runner.createTask({ backend, prompt, cwd, model });
    res.json({ id: taskId, status: 'queued' });
  } catch (error) {
    logger.error('Task creation failed', error);
    return sendError(res, 500, error.message);
  }
});

// CLI Task Streaming (SSE)
app.get('/api/llm/tasks/:id/stream', (req, res) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    runner.streamTask(id, res);
  } catch (error) {
    logger.error('Stream failed', error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
});


// ... MongoDB connection logic ...
// ... Start server logic ...

// Example connection (replace with your actual connection string)
// mongoose.connect('mongodb://localhost:27017/your-game-db')
//   .then(() => console.log('MongoDB Connected'))
//   .catch(err => console.error('MongoDB Connection Error:', err));

const startServer = () => app.listen(port, () => {
  logger.info(`Server running on http://localhost:${port}`);
});

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  db,
  startServer,
  extractAuthToken,
  requireApiAuthMiddleware
};


/**
 * here is an old idea I was thinking about
 * I was thinking that each stat was a separate column in the table, but that doesn't match what I have in the app now.
 * it would be a bigger main to modify the app.
 *
 *              Strength INTEGER,
 *              Dexterity INTEGER,
 *              Constitution INTEGER,
 *              Intelligence INTEGER,
 *              Wisdom INTEGER,
 *              Charisma INTEGER,
 */
