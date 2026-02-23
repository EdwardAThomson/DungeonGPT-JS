# DungeonGPT (JS): Character Creator & AI Game Master

This is a web application built with React that allows users to create detailed characters for role-playing games, manage them, and use them in an interactive game session powered by an AI (default: OpenAI's GPT models).

This project is based upon the [Python version of the same name](https://github.com/EdwardAThomson/DungeonGPT).

YouTube Video 🎥:

* [How To Play / Overview](https://youtu.be/CGskdUTQnMo)

![DungeonGPT - a lone figure roams through the forest](./public/through_the_forest.webp)

## Features

*   **Character Creation:** Detailed form to define character stats, class, race, background, alignment, and profile picture.
*   **Character Management:** View all created characters, edit existing characters.
*   **Game Setup:** Configure settings for a new game session (description, rules, world seed).
*   **Hero Selection:** Choose created characters to form a party for the game.
*   **AI-Powered Game:** Engage in an interactive text-based adventure where the AI acts as the game master, responding to user actions and summarizing the story.
*   **World Map:** Explore a procedurally generated world map with biomes, towns, and points of interest.
*   **Encounter System:** Dynamic encounters with skill checks, rewards, and AI-narrated outcomes.
*   **Inventory & Progression:** Track party inventory, gold, HP, and XP progression.
*   **Multi-Provider AI:** Support for OpenAI, Google Gemini, and Anthropic Claude (cloud APIs and CLI modes).
*   **Persistent Sessions:** Characters and game sessions saved via backend server and SQLite database.

## Technology Stack

*   **Frontend:** React (Hooks, Context API)
*   **Routing:** React Router DOM
*   **Styling:** Modular CSS (feature-based organization in `src/styles/`)
*   **Backend:** Node.js / Express (`src/server.js`)
*   **Database:** SQLite (`src/game.db`)
*   **AI Providers:** OpenAI, Google Gemini, Anthropic Claude (cloud APIs and CLI modes)

## Project Structure

```
src/
├── components/      # Reusable UI components (modals, panels, maps)
├── contexts/        # React Context providers (Settings, API keys)
├── data/            # Static game data (encounters, races, classes)
├── game/            # Game logic controllers (movement, encounters, saves)
├── hooks/           # Custom React hooks (useGameMap, useGameSession, etc.)
├── llm/             # LLM integration (model resolver, constants)
├── pages/           # Page components (Game, CharacterCreation, etc.)
├── services/        # API client services (characters, conversations, LLM)
├── styles/          # Feature-based CSS files
├── utils/           # Utility functions (map generation, health system, etc.)
└── server.js        # Express backend server
```

The following images shows the chat interface of DungeonGPT:

![Character Creation](./screenshots/character_creator.png)
![Chat Interface](./screenshots/chat_interface_update.png)


## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd character-creation
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables:**
    *   Copy `.env.example` to `.env` and configure your API keys:
    ```bash
    cp .env.example .env
    ```
    *   Add your LLM API keys to `.env`:
    ```
    OPENAI_API_KEY=your-openai-key
    GEMINI_API_KEY=your-gemini-key
    ANTHROPIC_API_KEY=your-claude-key
    ```
    *   API keys are handled securely by the backend server — they are never exposed to the frontend.

4.  **Run the backend server (Required for Database Persistence):**
    *   The backend server (`src/server.js`) handles saving and loading characters to/from the SQLite database (`src/game.db`).
    *   **This server must be running** in a separate terminal for character saving/loading features to work.
    *   Open a terminal, navigate to the project root directory, and run:

    ```bash
    node src/server.js
    ```
    
    *   Keep this terminal window open while using the application.

5.  **Run the React development server:**
    *   In **another** terminal window (while the backend server is running), navigate to the project root directory and run:

    ```bash
    npm start
    ```

    *   This will open the application in your default browser, usually at `http://localhost:3000`.

## Usage

1.  **Navigate** through the sections using the top navigation bar (Home, Character Creator, All Characters, New Game).
2.  **Create a character** using the "Character Creator" form.
3.  **View and manage** your characters under "All Characters".
4.  **Start a new game** by going to "New Game", filling in the settings, and then selecting your heroes on the subsequent "Hero Selection" page.
5.  **Play the game:** Interact with the AI game master by typing actions in the input box on the "Game" screen.

## Recent Improvements (Phase 0-2 Refactor)

*   ✅ API calls handled securely by the backend (API keys in `.env`, not exposed to frontend)
*   ✅ Modular game architecture (controllers for movement, encounters, saves)
*   ✅ Multi-provider AI support (OpenAI, Gemini, Claude — cloud and CLI modes)
*   ✅ Environment-aware logging system (production-safe)
*   ✅ CSS split into feature-based modules for maintainability
*   ✅ World map with procedural generation and exploration
*   ✅ Encounter system with skill checks and AI narration

## Potential Future Improvements

*   User authentication and multi-user support (Phase 4)
*   Migration to Cloudflare D1 for edge deployment
*   Unit and integration tests for core game loops
*   Additional encounter types and world events

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for details.

Copyright and attribution notices are in the [NOTICE](./NOTICE) file.

For contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).
