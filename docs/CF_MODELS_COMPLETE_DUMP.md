# Cloudflare Workers AI — Complete Model Dump

**Source:** https://developers.cloudflare.com/workers-ai/models/  
**Date:** Feb 28, 2026

## All Text Generation Models (Complete List)

### 🏆 Ultra Tier — Absolute Best Available (100B+ or Reasoning)

| Model ID | Name | Params | Context | Notes |
|----------|------|--------|---------|-------|
| `@cf/openai/gpt-oss-120b` | GPT-OSS 120B | 120B | - | **NEW 2025** OpenAI open-weight, production reasoning |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | DeepSeek R1 32B | 32B | - | Distilled from R1, beats o1-mini |
| `@cf/qwen/qwq-32b` | QwQ 32B | 32B | - | Reasoning model (R1/o1-mini competitor) |

### Tier 1 — Premium (30B-70B Dense, Large MoE)

| Model ID | Name | Params | Context | Notes |
|----------|------|--------|---------|-------|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Llama 3.3 70B FP8 | 70B | - | **CURRENT** FP8 quantized, function calling |
| `@cf/meta/llama-3.1-70b-instruct` | Llama 3.1 70B | 70B | 128K | Full precision (slower) |
| `@cf/qwen/qwen3-30b-a3b-fp8` | Qwen3 30B MoE | 30B (3B active) | - | MoE = 30B quality at 3B cost, function calling |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | Qwen 2.5 Coder 32B | 32B | - | Code-specialized, LoRA |

### Tier 2 — High Quality (12B-24B)

| Model ID | Name | Params | Context | Notes |
|----------|------|--------|---------|-------|
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | Mistral Small 3.1 | 24B | 128K | Vision + 128K context, function calling |
| `@cf/openai/gpt-oss-20b` | GPT-OSS 20B | 20B | - | **NEW 2025** OpenAI open-weight, lower latency |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | Llama 4 Scout | 17B MoE | - | **NEW 2025** Multimodal, function calling |
| `@cf/google/gemma-3-12b-it` | Gemma 3 12B | 12B | 128K | **CURRENT** Multimodal, LoRA |
| `@cf/meta/llama-3.2-11b-vision-instruct` | Llama 3.2 11B Vision | 11B | - | Vision capable, LoRA |

### Tier 3 — Balanced (7B-8B)

| Model ID | Name | Params | Context | Notes |
|----------|------|--------|---------|-------|
| `@cf/meta/llama-3.1-8b-instruct-fast` | Llama 3.1 8B Fast | 8B | 128K | **CURRENT** Optimized for speed |
| `@cf/meta/llama-3.1-8b-instruct` | Llama 3.1 8B | 8B | 128K | Standard precision |
| `@cf/meta/llama-3.1-8b-instruct-fp8` | Llama 3.1 8B FP8 | 8B | 128K | FP8 quantized |
| `@cf/meta/llama-3.1-8b-instruct-awq` | Llama 3.1 8B AWQ | 8B | - | INT4 quantized |
| `@cf/meta/llama-guard-3-8b` | Llama Guard 3 8B | 8B | - | Safety classification, LoRA |
| `@cf/zai-org/glm-4.7-flash` | GLM 4.7 Flash | ~7B | 131K | **Huge 131K context**, function calling |
| `@cf/ibm-granite/granite-4.0-h-micro` | Granite 4.0 Micro | ~7B | - | Instruction following specialist, function calling |
| `@cf/meta/meta-llama-3-8b-instruct` | Meta Llama 3 8B | 8B | - | Previous gen |
| `@cf/aisingapore/gemma-sea-lion-v4-27b-it` | SEA-LION v4 27B | 27B | - | Southeast Asian languages |

### Tier 4 — Fast/Cheap (1B-3B)

| Model ID | Name | Params | Context | Notes |
|----------|------|--------|---------|-------|
| `@cf/meta/llama-3.2-3b-instruct` | Llama 3.2 3B | 3B | - | Very fast, limited quality |
| `@cf/meta/llama-3.2-1b-instruct` | Llama 3.2 1B | 1B | - | Ultra-fast, minimal quality |

### Beta / Legacy (May be deprecated)

| Model ID | Name | Notes |
|----------|------|-------|
| `@cf/nousresearch/hermes-2-pro-mistral-7b` | Hermes 2 Pro Mistral 7B | Function calling, Beta |
| `@cf/mistralai/mistral-7b-instruct-v0.2` | Mistral 7B v0.2 | 32K context, LoRA, Beta |
| `@cf/mistralai/mistral-7b-instruct-v0.1` | Mistral 7B v0.1 | LoRA, older |
| `@cf/google/gemma-7b-it` | Gemma 7B | LoRA, Beta |
| `@cf/microsoft/phi-2` | Phi-2 | 2.7B, Beta |
| `@cf/qwen/qwen1.5-*` | Qwen 1.5 (various) | Deprecated - use Qwen3 |
| Many AWQ quantized models | Various | Mostly deprecated |

---

## All Non-Text Models (For Reference)

### Text-to-Image
- `@cf/black-forest-labs/flux-2-klein-9b` — FLUX.2 Klein 9B (ultra-fast)
- `@cf/black-forest-labs/flux-2-klein-4b` — FLUX.2 Klein 4B
- `@cf/black-forest-labs/flux-2-dev` — FLUX.2 Dev (realistic)
- `@cf/black-forest-labs/flux-1-schnell` — FLUX.1 Schnell (12B)
- `@cf/leonardo/lucid-origin` — Lucid Origin (Leonardo.AI, Partner)
- `@cf/leonardo/phoenix-1.0` — Phoenix 1.0 (text coherent)
- `@cf/bytedance/stable-diffusion-xl-lightning` — SDXL Lightning (fast)
- `@cf/lykon/dreamshaper-8-lcm` — Dreamshaper 8
- `@cf/stability.ai/stable-diffusion-xl-base-1.0` — SDXL Base 1.0
- `@cf/runwayml/stable-diffusion-v1-5-*` — SD 1.5 variants (img2img, inpainting)

### Text-to-Speech
- `@cf/deepgram/aura-2-es` — Aura 2 Spanish (context-aware, Partner)
- `@cf/deepgram/aura-2-en` — Aura 2 English (context-aware, Partner)
- `@cf/deepgram/aura-1` — Aura 1 (context-aware, Partner)
- `@cf/myshell-ai/melotts` — MeloTTS (multi-lingual)

### Speech-to-Text (ASR)
- `@cf/deepgram/flux` — Flux (voice agent optimized, Partner, Real-time)
- `@cf/deepgram/nova-3` — Nova 3 (Deepgram, Partner, Real-time)
- `@cf/openai/whisper-large-v3-turbo` — Whisper Large v3 Turbo
- `@cf/openai/whisper` — Whisper (general-purpose)
- `@cf/openai/whisper-tiny-en` — Whisper Tiny English (Beta)

### Text Embeddings
- `@cf/qwen/qwen3-embedding-0.6b` — Qwen3 Embedding 0.6B
- `@cf/google/embeddinggemma-300m` — EmbeddingGemma 300M (100+ languages)
- `@cf/pfnet/plamo-embedding-1b` — PLaMo-Embedding 1B (Japanese)
- `@cf/baai/bge-m3` — BGE-M3 (Multi-lingual, multi-granular)
- `@cf/baai/bge-large-en-v1.5` — BGE Large (1024-dim)
- `@cf/baai/bge-base-en-v1.5` — BGE Base (768-dim)
- `@cf/baai/bge-small-en-v1.5` — BGE Small (384-dim)

### Translation
- `@cf/meta/m2m100-1.2b` — M2M100 (many-to-many multilingual)
- `@cf/ai4bharat/indictrans2-en-indic-1B` — IndicTrans2 (22 Indic languages)

### Classification / Computer Vision
- `@cf/baai/bge-reranker-base` — BGE Reranker (relevance scoring)
- `@cf/huggingface/distilbert-sst-2-int8` — DistilBERT SST-2 (sentiment)
- `@cf/microsoft/resnet-50` — ResNet-50 (image classification)
- `@cf/facebook/detr-resnet-50` — DETR ResNet-50 (object detection, Beta)

### Voice Activity Detection
- `@cf/pipecat-ai/smart-turn-v2` — Smart Turn v2 (audio turn detection)

### Image-to-Text / Vision
- `@cf/llava-hf/llava-1.5-7b-hf` — LLaVA 1.5 7B (Beta)
- `@cf/unum/uform-gen2-qwen-500m` — UForm-Gen2 (captioning, VQA, Beta)

### Summarization
- `@cf/facebook/bart-large-cnn` — BART Large CNN (Beta)

---

## Recommended Testing Strategy (Revised)

### Must Test — Spanning All Quality Levels (8 models)

1. **Ultra:** `@cf/openai/gpt-oss-120b` — Absolute best available
2. **Ultra:** `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` — Best reasoning model
3. **Tier 1:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — Current quality tier
4. **Tier 1:** `@cf/qwen/qwen3-30b-a3b-fp8` — MoE sweet spot (30B quality, 3B cost)
5. **Tier 2:** `@cf/openai/gpt-oss-20b` — OpenAI mid-tier
6. **Tier 2:** `@cf/google/gemma-3-12b-it` — Current balanced tier
7. **Tier 3:** `@cf/meta/llama-3.1-8b-instruct-fast` — Current fast tier
8. **Tier 4:** `@cf/meta/llama-3.2-3b-instruct` — Ultra-cheap baseline

### Should Test — Specialists (4 models)

9. `@cf/meta/llama-4-scout-17b-16e-instruct` — Newest Meta model (2025)
10. `@cf/ibm-granite/granite-4.0-h-micro` — Instruction following specialist
11. `@cf/zai-org/glm-4.7-flash` — Huge 131K context
12. `@cf/mistralai/mistral-small-3.1-24b-instruct` — Vision + 128K context

---

## Key Insights

### What I Missed Before:
- **GPT-OSS 120B** is genuinely the largest/best available text model on CF Workers AI
- **DeepSeek R1** reasoning models are top-tier for complex tasks
- I incorrectly categorized 120B/70B as "Tier 1" when they're actually the absolute top

### MoE Advantage:
- **Qwen3-30B-A3B** has 30B params but only activates 3B per token = massive cost savings
- **Llama 4 Scout 17B** is MoE with 16 experts

### Context Window Champions:
- **GLM 4.7 Flash:** 131K tokens (!!)
- **Mistral Small 3.1:** 128K tokens
- **Llama 3.1 models:** 128K tokens
- **Gemma 3:** 128K tokens

### Newest Models (2025):
1. GPT-OSS 120B & 20B (OpenAI open-weight)
2. Llama 4 Scout 17B (Meta)
3. Mistral Small 3.1 24B
4. DeepSeek R1 distilled models
5. Qwen3 series
