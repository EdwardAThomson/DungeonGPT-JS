// llmHelper.js
// import dotenv from "dotenv";



import { OpenAI } from "openai";
// Import SDKs for Gemini and Claude
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from '@anthropic-ai/sdk';

/**
 * Generates text using the specified LLM provider.
 * @param {string} provider - The LLM provider ('openai', 'gemini', 'claude').
 * @param {string} apiKey - The API key for the selected provider.
 * @param {string} model - The specific model to use (e.g., 'gpt-4o-mini', 'gemini-pro').
 * @param {string} prompt - The input prompt for the LLM (should contain context and user input).
 * @param {number} maxTokens - The maximum number of tokens to generate.
 * @param {number} temperature - The sampling temperature.
 * @returns {Promise<string>} - The generated text.
 */
async function generateText(provider, apiKey, model, prompt, maxTokens, temperature) {
  console.log(`Generating text with ${provider}, model: ${model}`);

  if (!apiKey) {
    throw new Error(`API key for ${provider} is missing.`);
  }

  // --- System Prompt Definition ---
  const systemPromptContent = `You are a dungeon master acting as the narrator and world simulator for a text-based RPG. Keep responses concise (1-3 paragraphs), focused on the game narrative, describing the results of the user's actions and the current situation. Do not speak OOC or give instructions.`;

  try {
    if (provider === 'openai') {
      // --- OpenAI Implementation ---
      const openai = new OpenAI({ apiKey: apiKey, dangerouslyAllowBrowser: true });
      const messages = [
        { role: "system", content: systemPromptContent },
        { role: "user", content: prompt }, // Prompt already includes context + user action
      ];
      const response = await openai.chat.completions.create({
        model: model, // e.g., 'gpt-4o-mini'
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature,
      });
      if (!response.choices || response.choices.length === 0 || !response.choices[0].message?.content) {
        throw new Error('Invalid response structure from OpenAI API');
      }
      return response.choices[0].message.content.trim();

    } else if (provider === 'gemini') {
      // --- Gemini Implementation ---
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({
          model: model, // e.g., 'gemini-pro'
          // Apply the system prompt - format can vary based on model version
          systemInstruction: systemPromptContent,
      });

      const generationConfig = {
        temperature: temperature,
        maxOutputTokens: maxTokens,
      };

      // For simple cases, generateContent can take the prompt string directly.
      // For more complex chat history, use model.startChat().
      const result = await geminiModel.generateContent(prompt, generationConfig);
      const response = await result.response;

      if (!response || !response.text) {
           throw new Error('Invalid response structure from Gemini API');
      }
      return response.text().trim();

    } else if (provider === 'claude') {
      // --- Claude Implementation ---
      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
        // Note: Anthropic SDK discourages browser usage without a proxy.
        // You should use a backend proxy for production to keep API keys secure.
      });

      const response = await anthropic.messages.create({
        model: model, // e.g., "claude-3-haiku-20240307"
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPromptContent, // Pass system prompt separately
        messages: [
          { role: "user", content: prompt } // User prompt includes context + action
        ]
      });

      if (!response.content || response.content.length === 0 || response.content[0].type !== 'text' || !response.content[0].text) {
         throw new Error('Invalid response structure from Claude API');
      }
      // Assuming the first content block is the text response
      return response.content[0].text.trim();

    } else {
      console.error(`Unsupported LLM provider: ${provider}`);
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  } catch (error) {
    console.error(`Error generating text with ${provider}:`, error);
    // Refine error message if possible (e.g., check for specific API error types)
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    throw new Error(`Failed to get response from ${provider}: ${errorMessage}`);
  }
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