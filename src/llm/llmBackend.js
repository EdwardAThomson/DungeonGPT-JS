const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const { createLogger } = require('../server/logger');

const logger = createLogger('llm-backend');

/**
 * Server-side LLM Backend
 * Handles direct SDK calls using environment variables.
 */

async function generateText({ provider, model, prompt, maxTokens, temperature, systemPrompt }) {
    logger.debug(`Generating text with provider=${provider}, model=${model}`);

    try {
        if (provider === 'openai') {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) throw new Error('OpenAI API key missing on server.');

            const openai = new OpenAI({ apiKey: apiKey });
            const messages = [];
            if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
            messages.push({ role: "user", content: prompt });

            const response = await openai.chat.completions.create({
                model: model,
                messages,
                max_tokens: maxTokens || 500,
                temperature: temperature || 0.7,
            });
            return response.choices[0].message.content.trim();

        } else if (provider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('Gemini API key missing on server.');

            const genAI = new GoogleGenerativeAI(apiKey);
            const modelConfig = { model: model || 'gemini-pro' };
            if (systemPrompt) modelConfig.systemInstruction = systemPrompt;
            const geminiModel = genAI.getGenerativeModel(modelConfig);

            const result = await geminiModel.generateContent(prompt, {
                temperature: temperature || 0.7,
                maxOutputTokens: maxTokens || 500,
            });
            const response = await result.response;
            return response.text().trim();

        } else if (provider === 'claude') {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) throw new Error('Anthropic API key missing on server.');

            const anthropic = new Anthropic({ apiKey: apiKey });
            const claudeOptions = {
                model: model || 'claude-3-opuses-20240229',
                max_tokens: maxTokens || 500,
                temperature: temperature || 0.7,
                messages: [{ role: "user", content: prompt }]
            };
            if (systemPrompt) claudeOptions.system = systemPrompt;
            const response = await anthropic.messages.create(claudeOptions);
            return response.content[0].text.trim();

        } else if (['codex', 'claude-cli', 'gemini-cli'].includes(provider)) {
            // CLI providers are handled by llmService.js via the runner system
            throw new Error(`CLI provider ${provider} should not reach llmBackend.js - use llmService instead`);

        } else {
            throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    } catch (error) {
        logger.error(`LLM backend error for provider=${provider}`, error.message);
        throw error;
    }
}

module.exports = { generateText };
