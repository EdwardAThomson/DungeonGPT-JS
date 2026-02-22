import { AVAILABLE_MODELS, DEFAULT_MODELS } from './llm_constants';

export const CLI_PROVIDERS = ['codex', 'claude-cli', 'gemini-cli'];

export const isCliProvider = (provider) => CLI_PROVIDERS.includes(provider);

export const getDefaultProvider = () => 'gemini-cli';

export const getDefaultModelForProvider = (provider) => {
  return DEFAULT_MODELS[provider] || DEFAULT_MODELS[getDefaultProvider()];
};

export const resolveProviderAndModel = (
  provider,
  model,
  fallbackProvider = getDefaultProvider()
) => {
  const resolvedProvider = provider && AVAILABLE_MODELS[provider] ? provider : fallbackProvider;
  const providerModels = AVAILABLE_MODELS[resolvedProvider] || [];

  if (model && providerModels.some((candidate) => candidate.id === model)) {
    return { provider: resolvedProvider, model };
  }

  return {
    provider: resolvedProvider,
    model: getDefaultModelForProvider(resolvedProvider)
  };
};

export const buildModelOptions = () => {
  return Object.entries(AVAILABLE_MODELS).flatMap(([provider, models]) =>
    models.map((entry) => ({
      provider,
      model: entry.id,
      label: `${provider.toUpperCase()} - ${entry.name}`
    }))
  );
};
