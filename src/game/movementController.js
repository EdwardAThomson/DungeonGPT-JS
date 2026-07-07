import { llmService } from '../services/llmService';
import { resolveProviderAndModel } from '../llm/modelResolver';

export const generateMovementNarrative = async ({
  provider,
  model,
  prompt,
  onProgress
}) => {
  const resolved = resolveProviderAndModel(provider, model);
  return llmService.generateUnified({
    provider: resolved.provider,
    model: resolved.model,
    prompt,
    maxTokens: 1500, // server caps at 1500 (cf-worker ai.ts schema); 1600 made zod 400 every request (playtest 2026-07-07)
    temperature: 0.7,
    onProgress
  });
};
