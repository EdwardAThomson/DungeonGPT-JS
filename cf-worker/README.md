# DungeonGPT API - CloudFlare Workers Backend

This is the CloudFlare Workers backend for DungeonGPT, providing AI text generation via Workers AI.

## Setup

```bash
cd workers/backend
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

| Model ID | Name | Tier | Max Tokens |
|----------|------|------|------------|
| `@cf/meta/llama-3.1-8b-instruct-fast` | Llama 3.1 8B Fast | fast | 2048 |
| `@cf/google/gemma-3-12b-it` | Gemma 3 12B | balanced | 4096 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Llama 3.3 70B | quality | 4096 |

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
