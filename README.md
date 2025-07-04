# DungeonGPT (JS): Character Creator & AI Game Master

This is a web application built with React that allows users to create detailed characters for role-playing games, manage them, and use them in an interactive game session powered by an AI (default: OpenAI's GPT models).

This project is based upon the [Python version of the same name](https://github.com/EdwardAThomson/DungeonGPT).

![DungeonGPT - a lone figure roams through the forest](./public/through_the_forest.webp)

## Features

*   **Character Creation:** Detailed form to define character stats, class, race, background, alignment, and profile picture.
*   **Character Management:** View all created characters, edit existing characters.
*   **Game Setup:** Configure settings for a new game session (description, rules).
*   **Hero Selection:** Choose created characters to form a party for the game.
*   **AI-Powered Game:** Engage in an interactive text-based adventure where the AI acts as the game master, responding to user actions and summarizing the story.
*   **Persistent Characters:** Characters are saved (likely via the backend server and SQLite database).

## Technology Stack

*   **Frontend:** React (Hooks, Context API)
*   **Routing:** React Router DOM
*   **Styling:** CSS
*   **Backend:** Node.js / Express (using `src/server.js`)
*   **Database:** SQLite (`src/game.db`)
*   **AI:** OpenAI API (e.g., `gpt-4o`)

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
    *   This project requires an key for one of the big 3 LLMs (OpenAI/ Gemini/ Claude) to use the AI features in the game section.
    *   You need to provide these keys to the application. Currently, keys are entered via the Home page UI (`src/HomePage.js`) and stored in React Context (`src/ApiKeysContext.js`).
    *   **Important Security Note:** Exposing API keys directly via the frontend UI is insecure for production. It's highly recommended to modify the application to handle LLM API calls through the backend server (`src/server.js`) instead, using environment variables on the server.
    *   For local development/testing, using the UI input method is functional.

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

## Potential Future Improvements

*   Refactor OpenAI API calls to be handled securely by the backend (`server.js`).
*   Improve UI/UX.
*   Add more detailed error handling.
