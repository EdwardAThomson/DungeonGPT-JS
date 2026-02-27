import { AVAILABLE_MODELS, DEFAULT_MODELS, getAvailableModels, getDefaultProvider as getEnvDefaultProvider } from './llm_constants';

export const CLI_PROVIDERS = ['codex', 'claude-cli', 'gemini-cli'];

export const isCliProvider = (provider) => CLI_PROVIDERS.includes(provider);

export const getDefaultProvider = () => getEnvDefaultProvider();

export const getDefaultModelForProvider = (provider) => {
  return DEFAULT_MODELS[provider] || DEFAULT_MODELS[getDefaultProvider()];
};

export const resolveProviderAndModel = (
  provider,
  model,
  fallbackProvider = getDefaultProvider()
) => {
  const availableModels = getAvailableModels();
  const resolvedProvider = provider && availableModels[provider] ? provider : fallbackProvider;
  const providerModels = availableModels[resolvedProvider] || [];

  if (model && providerModels.some((candidate) => candidate.id === model)) {
    return { provider: resolvedProvider, model };
  }

  return {
    provider: resolvedProvider,
    model: getDefaultModelForProvider(resolvedProvider)
  };
};

export const buildModelOptions = () => {
  const availableModels = getAvailableModels();
  return Object.entries(availableModels).flatMap(([provider, models]) =>
    models.map((entry) => ({
      provider,
      model: entry.id,
      label: `${provider.toUpperCase()} - ${entry.name}`
    }))
  );
};
