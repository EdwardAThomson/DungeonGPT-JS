# DungeonGPT API - CloudFlare Workers Backend

This is the CloudFlare Workers backend for DungeonGPT, providing AI text generation via Workers AI.

## Setup

```bash
cd cf-worker
npm install
```

## Development

```bash
npm run dev
```

This starts a local dev server at `http://localhost:8787`.

### Test Endpoints

Health check:
```bash
curl http://localhost:8787/health
```

List models:
```bash
curl http://localhost:8787/api/ai/models
```

Generate text:
```bash
curl -X POST http://localhost:8787/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "cf-workers",
    "model": "@cf/meta/llama-3.1-8b-instruct-fast",
    "prompt": "The adventurer enters the dark cave...",
    "maxTokens": 500,
    "temperature": 0.7
  }'
```

## Deployment

```bash
npm run deploy
```

## Available Models

Source of truth: `cf-worker/src/services/models.ts` (`MODEL_REGISTRY`).

| Model ID | Name | Tier | Max Tokens |
|----------|------|------|------------|
| `@cf/openai/gpt-oss-120b` (default) | GPT-OSS 120B | ultra | 4096 |
| `@cf/openai/gpt-oss-20b` | GPT-OSS 20B | quality | 4096 |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | Llama 4 Scout 17B | quality | 4096 |
| `@cf/google/gemma-3-12b-it` | Gemma 3 12B | quality | 4096 |
| `@cf/meta/llama-3.1-8b-instruct-fast` | Llama 3.1 8B Fast | balanced | 2048 |

## API Reference

### `GET /health`
Returns service health status.

### `GET /api/ai/models`
Returns available models and default model ID.

### `POST /api/ai/generate`
Generates AI text response.

**Request Body:**
```json
{
  "provider": "cf-workers",
  "model": "@cf/meta/llama-3.1-8b-instruct-fast",
  "prompt": "Your prompt here",
  "maxTokens": 500,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "text": "Generated response..."
}
```
