import { llmService } from '../services/llmService';

/**
 * Generates text using the specified LLM provider via the backend.
 * @param {string} provider - The LLM provider ('openai', 'gemini', 'claude').
 * @param {object} apiKeys - Ignored (handled by backend).
 * @param {string} model - The specific model to use.
 * @param {string} prompt - The input prompt.
 * @param {number} maxTokens - Max tokens.
 * @param {number} temperature - Temperature.
 * @returns {Promise<string>} - The generated text.
 */
async function generateText(provider, apiKeys, model, prompt, maxTokens, temperature) {
  return llmService.generateText({
    provider,
    model,
    prompt,
    maxTokens,
    temperature
  });
}

// Note: generateCharacter function still needs updating for multi-provider support if used.
const generateCharacter = async (apiKey, prompt, maxTokens) => {
  console.warn('generateCharacter function is using default OpenAI settings and needs updating for multi-provider support.');
  // Needs logic to determine provider and get the correct key from apiKeys context.
  const engine = "gpt-4o"; // Example model
  const temperature = 0.7;
  // This function will likely fail until updated, as it expects a single apiKey string.
  // It needs access to the full apiKeys object and the selectedProvider.
  // return generateText('openai', apiKey, engine, prompt, maxTokens, temperature);
  throw new Error('generateCharacter function needs refactoring for multi-provider support.');
};

export { generateCharacter, generateText };