export const AVAILABLE_MODELS = {
    gemini: [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Legacy)' },
    ],
    openai: [
        { id: 'gpt-5', name: 'GPT-5' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
        { id: 'gpt-4o', name: 'GPT-4o (Legacy)' },
    ],
    claude: [
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Legacy)' },
    ],
    // CLI Tools
    'codex': [
        { id: 'codex-cli', name: 'Codex CLI (Default)' }
    ],
    'claude-cli': [
        { id: 'claude-cli', name: 'Claude CLI (Default)' }
    ],
    'gemini-cli': [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash CLI (Default)' },
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro CLI' },
        { id: 'gemini-cli', name: 'Gemini 2.5 CLI (Legacy)' }
    ]
};

export const DEFAULT_MODELS = {
    gemini: 'gemini-3-flash-preview',
    openai: 'gpt-5-mini',
    claude: 'claude-sonnet-4-5-20250929',
    codex: 'codex-cli',
    'claude-cli': 'claude-cli',
    'gemini-cli': 'gemini-3-flash-preview'
};

export const PROMPT_SNIPPET = `You are a dungeon master acting as the narrator and world simulator for a text-based RPG. Keep responses concise (1-3 paragraphs), focused on the game narrative, describing the results of the user's actions and the current situation. Do not speak OOC or give instructions.`;
