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
    ],
    'cf-workers': [
        // Ultra Tier (100B+)
        { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B (Ultra)' },
        // Quality Tier (12B-20B) - Best for production
        { id: '@cf/openai/gpt-oss-20b', name: 'GPT-OSS 20B (Quality) ⭐' },
        { id: '@cf/meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (Quality)' },
        { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B (Quality)' },
        // Balanced Tier (8B)
        { id: '@cf/meta/llama-3.1-8b-instruct-fast', name: 'Llama 3.1 8B Fast (Balanced)' }
    ]
};

export const DEFAULT_MODELS = {
    gemini: 'gemini-3-flash-preview',
    openai: 'gpt-5-mini',
    claude: 'claude-sonnet-4-5-20250929',
    codex: 'codex-cli',
    'claude-cli': 'claude-cli',
    'gemini-cli': 'gemini-3-flash-preview',
    'cf-workers': '@cf/openai/gpt-oss-120b'  // Best quality: 25/25 multi-turn, 3.7s latency
};

// Filter models based on environment
// Production: Only CF Workers
// Development: All providers
export const getAvailableModels = () => {
    // Check if we're in CloudFlare Pages production
    // CF_PAGES is set by CloudFlare Pages during build
    // REACT_APP_CF_PAGES can be manually set in CF Pages env vars
    // REACT_APP_USE_SQLITE=true forces dev mode (all providers)
    const forceDev = process.env.REACT_APP_USE_SQLITE === 'true';
    const isProduction = !forceDev && (
        process.env.REACT_APP_CF_PAGES === 'true' || 
        process.env.CF_PAGES === '1'
    );
    
    console.log('[llm_constants] Environment check:', {
        REACT_APP_CF_PAGES: process.env.REACT_APP_CF_PAGES,
        REACT_APP_USE_SQLITE: process.env.REACT_APP_USE_SQLITE,
        CF_PAGES: process.env.CF_PAGES,
        NODE_ENV: process.env.NODE_ENV,
        forceDev,
        isProduction,
        availableProviders: isProduction ? ['cf-workers'] : Object.keys(AVAILABLE_MODELS)
    });
    
    if (isProduction) {
        // Production: Only CF Workers
        console.log('[llm_constants] Production mode - only CF Workers available');
        return {
            'cf-workers': AVAILABLE_MODELS['cf-workers']
        };
    }
    
    // Development: All providers
    console.log('[llm_constants] Development mode - all providers available');
    return AVAILABLE_MODELS;
};

export const getDefaultProvider = () => {
    const forceDev = process.env.REACT_APP_USE_SQLITE === 'true';
    const isProduction = !forceDev && (
        process.env.REACT_APP_CF_PAGES === 'true' || 
        process.env.CF_PAGES === '1'
    );
    return isProduction ? 'cf-workers' : 'gemini';
};

export const PROMPT_SNIPPET = `You are a dungeon master acting as the narrator and world simulator for a text-based RPG. Keep responses concise (1-3 paragraphs), focused on the game narrative, describing the results of the user's actions and the current situation. Do not speak OOC or give instructions.`;
