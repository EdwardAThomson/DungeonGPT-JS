const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const mongoose = require('mongoose');
const Conversation = require('./models/Conversation'); // Adjust path if needed

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

const db = new sqlite3.Database('./game.db', (err) => {
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
             conversation_data TEXT,  // Store the conversation array as JSON text
             provider TEXT,
             timestamp TEXT          // Store timestamp as ISO string
           )`, (err) => {
      if (err) {
        console.error('Error creating conversations table', err);
      } else {
        console.log('Table created or already exists (re: Conversations Table)');
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
    const { sessionId, conversation, provider, timestamp } = req.body;

    // Basic validation
    if (!sessionId || !conversation || !Array.isArray(conversation)) {
      return res.status(400).json({ message: 'Missing required session ID or conversation data.' });
    }
    // Allow saving empty conversations if desired, otherwise check length:
    // if (conversation.length === 0) {
    //     return res.status(400).json({ message: 'Cannot save empty conversation.' });
    // }

    // Convert conversation array to JSON string for storage
    const conversationJson = JSON.stringify(conversation);

    // SQL Query using ON CONFLICT for Upsert behavior (update if sessionId exists, insert if not)
    const query = `
      INSERT INTO conversations (sessionId, conversation_data, provider, timestamp)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (sessionId)
      DO UPDATE SET
        conversation_data = excluded.conversation_data,
        provider = excluded.provider,
        timestamp = excluded.timestamp;
    `;

    const params = [sessionId, conversationJson, provider, timestamp];

    db.run(query, params, function (err) {
      if (err) {
        console.error('Error saving conversation to SQLite:', err);
        return res.status(500).json({ message: 'Server error saving conversation', error: err.message });
      }

      console.log(`Conversation saved/updated for session: ${sessionId}. Rows affected: ${this.changes}`);
      // If you wanted to return the saved data, you'd need a subsequent SELECT,
      // but for just confirming save, this is okay.
      res.status(201).json({ message: 'Conversation saved successfully' });
    });

  } catch (error) {
    // Catch synchronous errors, like JSON.stringify failing (unlikely here)
    console.error('Unexpected error in /api/conversations:', error);
    res.status(500).json({ message: 'Unexpected server error', error: error.message });
  }
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