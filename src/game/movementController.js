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
    maxTokens: 1600,
    temperature: 0.7,
    onProgress
  });
};
