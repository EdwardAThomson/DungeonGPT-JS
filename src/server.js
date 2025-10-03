const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
// create a table called:  characterstable
// create schema for character stats

 /*
   characterId
   Name, Gender, profilePicture
   Race, Class, Level, Background, Alignment
   Stats [Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma]

   */


/*  --- this comes from CharacterCreation.js
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

const db = new sqlite3.Database('./src/game.db', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database');
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
        console.error('Error creating table', err);
      } else {
        console.log('Table created or already exists (re: Characters Table)');
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
             player_position TEXT
           )`, (err) => {
      if (err) {
        console.error('Error creating conversations table', err);
      } else {
        console.log('Table created or already exists (re: Conversations Table)');
        
        // Add new columns if they don't exist (for existing databases)
        db.run(`ALTER TABLE conversations ADD COLUMN conversation_name TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding conversation_name column:', err);
          }
        });
        
        db.run(`ALTER TABLE conversations ADD COLUMN game_settings TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding game_settings column:', err);
          }
        });
        
        db.run(`ALTER TABLE conversations ADD COLUMN selected_heroes TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding selected_heroes column:', err);
          }
        });
        
        db.run(`ALTER TABLE conversations ADD COLUMN summary TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding summary column:', err);
          }
        });
        
        db.run(`ALTER TABLE conversations ADD COLUMN world_map TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding world_map column:', err);
          }
        });
        
        db.run(`ALTER TABLE conversations ADD COLUMN player_position TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding player_position column:', err);
          }
        });
        
        db.run(`ALTER TABLE conversations ADD COLUMN model TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding model column:', err);
          }
        });
      }
    });
  }
});

// Define routes
// These are the API methods


 /* // First route: a route to add a new character
   0. characterId
   1. Name, 2. Gender, 3. profilePicture
   4. Race, 5. Class, 6. Level, 7. Background, 8. Alignment
   9. Strength, Dexterity, Constitution, Intelligence, Wisdom, 14. Charisma
   */

app.post('/characters', (req, res) => {
  const { characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, stats} = req.body;

       /*
             characterName TEXT,
             characterGender TEXT,
             profilePicture TEXT,
             characterRace TEXT,
             characterClass TEXT,
             characterLevel INTEGER,
             characterBackground TEXT,
             characterAlignment TEXT,
             stats TEXT
        */

  console.log([characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, JSON.stringify(stats)]);

  const query = `INSERT INTO characterstable (characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, JSON.stringify(stats)]

// If no existing character, proceed to insert
  db.run(query, params, function (err) {
    if (err) {
      console.error('Error adding character', err);
      res.status(500).json({ error: 'Failed to add character' });
    } else {
      res.json({ id: this.lastID });
    }
  });
});

// Route to get all characters
app.get('/characters', (req, res) => {

  db.all('SELECT * FROM characterstable', [], (err, rows) => {

    if (err) {
      console.error('Error retrieving characters', err);
      res.status(500).json({ error: 'Failed to retrieve characters' });
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


app.post('/conversation', (req, res) => {

  const query = `
    INSERT INTO conversations (conversation_id, conversation_text, summary_text, timestamp)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (conversation_id) 
    DO UPDATE SET 
      conversation_text = excluded.conversation_text,
      summary_text = excluded.summary_text,
      timestamp = CURRENT_TIMESTAMP;
  `;

  db.run(query, [conversationId, conversationText, summaryText], (err) => {
    if (err) {
      console.error("Error saving conversation:", err);
    } else {
      console.log("Conversation saved successfully.");
    }
  });

});


// GET endpoint to fetch all conversations
app.get('/conversations', (req, res) => {
    const query = `SELECT * FROM conversations`;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error retrieving conversations', err);
            res.status(500).json({ error: 'Failed to retrieve conversations' });
        } else {
            res.json(rows);
        }
    });
});




app.get('/test', (req, res) => {
  console.log("Received request for /test");
  res.json([{name: "Test Character" }]);
});

// --- New Conversation Saving Endpoint (SQLite Version) ---
app.post('/api/conversations', (req, res) => {
  try {
    const { sessionId, conversation, provider, model, timestamp, conversationName, gameSettings, selectedHeroes, currentSummary, worldMap, playerPosition } = req.body;

    // Basic validation
    if (!sessionId || !conversation || !Array.isArray(conversation)) {
      return res.status(400).json({ message: 'Missing required session ID or conversation data.' });
    }

    // Convert conversation array to JSON string for storage
    const conversationJson = JSON.stringify(conversation);
    const settingsJson = gameSettings ? JSON.stringify(gameSettings) : null;
    const heroesJson = selectedHeroes ? JSON.stringify(selectedHeroes) : null;
    const mapJson = worldMap ? JSON.stringify(worldMap) : null;
    const positionJson = playerPosition ? JSON.stringify(playerPosition) : null;

    // SQL Query using ON CONFLICT for Upsert behavior
    const query = `
      INSERT INTO conversations (sessionId, conversation_data, provider, model, timestamp, conversation_name, game_settings, selected_heroes, summary, world_map, player_position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        player_position = excluded.player_position;
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
      positionJson
    ];

    db.run(query, params, function (err) {
      if (err) {
        console.error('Error saving conversation to SQLite:', err);
        return res.status(500).json({ message: 'Server error saving conversation', error: err.message });
      }

      console.log(`Conversation saved/updated for session: ${sessionId}. Rows affected: ${this.changes}`);
      res.status(201).json({ message: 'Conversation saved successfully', sessionId });
    });

  } catch (error) {
    console.error('Unexpected error in /api/conversations:', error);
    res.status(500).json({ message: 'Unexpected server error', error: error.message });
  }
});

// Get a specific conversation by sessionId
app.get('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  const query = `SELECT * FROM conversations WHERE sessionId = ?`;
  
  db.get(query, [sessionId], (err, row) => {
    if (err) {
      console.error('Error retrieving conversation:', err);
      res.status(500).json({ error: 'Failed to retrieve conversation' });
    } else if (!row) {
      res.status(404).json({ error: 'Conversation not found' });
    } else {
      // Parse JSON fields back to objects
      const conversation = {
        ...row,
        conversation_data: JSON.parse(row.conversation_data),
        game_settings: row.game_settings ? JSON.parse(row.game_settings) : null,
        selected_heroes: row.selected_heroes ? JSON.parse(row.selected_heroes) : null,
        world_map: row.world_map ? JSON.parse(row.world_map) : null,
        player_position: row.player_position ? JSON.parse(row.player_position) : null
      };
      res.json(conversation);
    }
  });
});

// Update conversation name
app.put('/api/conversations/:sessionId/name', (req, res) => {
  const { sessionId } = req.params;
  const { conversationName } = req.body;
  
  if (!conversationName || !conversationName.trim()) {
    return res.status(400).json({ message: 'Conversation name is required' });
  }
  
  const query = `UPDATE conversations SET conversation_name = ? WHERE sessionId = ?`;
  
  db.run(query, [conversationName.trim(), sessionId], function (err) {
    if (err) {
      console.error('Error updating conversation name:', err);
      res.status(500).json({ message: 'Server error updating conversation name' });
    } else if (this.changes === 0) {
      res.status(404).json({ message: 'Conversation not found' });
    } else {
      res.json({ message: 'Conversation name updated successfully' });
    }
  });
});

// Delete a conversation
app.delete('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  const query = `DELETE FROM conversations WHERE sessionId = ?`;
  
  db.run(query, [sessionId], function (err) {
    if (err) {
      console.error('Error deleting conversation:', err);
      res.status(500).json({ message: 'Server error deleting conversation' });
    } else if (this.changes === 0) {
      res.status(404).json({ message: 'Conversation not found' });
    } else {
      res.json({ message: 'Conversation deleted successfully' });
    }
  });
});


// ... MongoDB connection logic ...
// ... Start server logic ...

// Example connection (replace with your actual connection string)
// mongoose.connect('mongodb://localhost:27017/your-game-db')
//   .then(() => console.log('MongoDB Connected'))
//   .catch(err => console.error('MongoDB Connection Error:', err));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});


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