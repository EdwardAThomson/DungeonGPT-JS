# Project Overview: Character Creation & Game App

1.  **Goal:**
    *   This application allows users to create, view, and manage characters, for a role-playing game setting.
    *   It enables setting up game sessions, selecting created characters (heroes) for a game, and participating in an interactive game session driven by an AI (using the OpenAI API).

2.  **Technology Stack:**
    *   **Frontend:** React (using functional components and Hooks like `useState`, `useContext`, `useLocation`).
    *   **Routing:** `react-router-dom` for navigation between different views.
    *   **Styling:** CSS (likely `App.css` and potentially `index.css`).
    *   **AI:** OpenAI API (specifically models like `gpt-4o`) via `llmHelper.js`.
    *   **Backend:** Likely Node.js/Express (`server.js` exists), possibly serving the frontend and handling API requests or database interactions.
    *   **Database:** SQLite (`game.db` file present) is used for persistence, and is managed by `server.js`.

3.  **Core Features & Components:**
    *   **`HomePage.js`:** The main landing page.
    *   **`CharacterCreation.js`:** A form/interface for users to input character details (stats, class, race, etc.). Seems quite detailed given its size (500+ lines).
    *   **`CharacterSummary.js`:** Displays the details of a newly created or selected character.
    *   **`AllCharacters.js`:** Shows a list of all characters created by the user. Allows selecting a character for editing.
    *   **`GameSettings.js`:** Allows the user to configure settings for a new game session (e.g., description, rules).
    *   **`HeroSelection.js`:** Allows the user to choose from their created characters to form a party for a game session.
    *   **`Game.js`:** The main game interface. It displays the game setting, manages a chat-like conversation between the user and the AI (acting as a game master or environment), summarizes the conversation history, and shows the selected party members' details.
    *   **`App.js`:** The root component. It sets up the main routing using `react-router-dom` and manages the top-level state for the list of `characters` and which character is being edited.
    *   **`openaiHelper.js`:** Contains logic to interact with the OpenAI API for generating text responses in the `Game.js` component and summarizing conversations.
    *   **`server.js`:** Acts as the backend server. Its exact functions need closer inspection, but it likely handles saving/loading character data to/from `game.db` and potentially serves the React application build.
    *   **`DebugMenu.js`:** A floating button in the bottom-right corner that toggles a menu for accessing developer tools.
    *   **`DiceTest.js`:** A diagnostic page for verifying the dice rolling logic and skill check math.
    *   **`TownMapTest.js`:** A testing ground for the town map visualization.
    *   **Contexts (`ApiKeyContext.js`, `SettingsContext.js`, `CharacterContext.js`):** Used to provide global state (like the OpenAI API key, game settings, and potentially character data) to different components without prop drilling.

4.  **State Management:**
    *   Local component state is managed using `useState` (e.g., `userInput`, `conversation` in `Game.js`).
    *   App-level state (like the `characters` array) is managed in `App.js` and passed down as props.
    *   Shared global state (API Key, Game Settings) is managed using React Context API.

5.  **Data Flow & Persistence:**
    *   Characters are created in `CharacterCreation`, added to the `characters` state in `App.js`.
    *   `AllCharacters` displays this list. `HeroSelection` likely uses this list to allow users to pick heroes.
    *   Selected heroes are passed to the `Game` component using `react-router-dom`'s location state.
    *   The presence of `server.js` and `game.db` strongly suggests that character data is persisted on the backend, likely allowing users to retain their characters across sessions.

6.  **Key Interactions:**
    *   User navigates between sections using the navigation bar (`App.js`).
    *   User creates a character -> Character added to list -> User can view all characters.
    *   User sets game settings -> User selects heroes -> User starts game.
    *   In `Game.js`, the user inputs text -> `handleSubmit` sends input + context (summary) to OpenAI -> AI response is displayed -> Conversation is summarized for future context.

7.  **Potential Areas Noted:**
    *   Client-side API calls in `openaiHelper.js` might expose the OpenAI API key if not handled carefully (e.g., if the key is hardcoded or easily accessible in the browser's source). Ideally, these calls would be proxied through `server.js`.

8.  **Developer Tools & Diagnostics:**
    *   **Secret Debug Menu:** A hidden menu accessible via a floating button (🐞) in the bottom-right corner of the screen.
    *   **Dice Diagnostics:** Accessible via the debug menu, this page runs automated tests on the dice rolling algorithms to ensure distribution fairness and mathematical correctness of skill modifiers.
    *   **Map Testing:** Accessible via the debug menu, allowing for isolated testing of the town map features. 