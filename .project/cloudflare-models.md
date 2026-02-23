# Cloudflare Workers AI — Text Generation Models

> Reference for DungeonGPT model selection. All models run on Cloudflare Workers AI
> via `env.AI.run()` — no external API keys needed.
>
> **Model ID format:** `@cf/{author}/{model-name}`
>
> **Last updated:** 2026-02-22
> **Source:** https://developers.cloudflare.com/workers-ai/models/

---

## Model Selection for DungeonGPT

We need models that are:
- Fast (players shouldn't wait 10+ seconds for narrative)
- Creative enough for RPG narration (not coding/math focused)
- Instruction-following (stay in DM character, follow protocol markers)
- Available on Workers AI free tier (no external API keys)

---

## Active Text Generation Models

### Tier 1: Fast (low latency, good for game narration)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Model ID                                    │ Params │ Author   │ Notes    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.1-8b-instruct-fast         │   8B   │ Meta     │ Speed-   │
│                                              │        │          │ optimized│
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/zai-org/glm-4.7-flash                   │   ~7B  │ zai-org  │ 131K ctx │
│                                              │        │          │ 100+ lang│
│                                              │        │          │ Fn call  │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.1-8b-instruct              │   8B   │ Meta     │ Standard │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.1-8b-instruct-fp8          │   8B   │ Meta     │ FP8 quant│
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.1-8b-instruct-awq          │   8B   │ Meta     │ INT4     │
│                                              │        │          │ quant    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.2-3b-instruct              │   3B   │ Meta     │ Tiny,    │
│                                              │        │          │ very fast│
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.2-1b-instruct              │   1B   │ Meta     │ Smallest │
│                                              │        │          │ available│
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/ibm/granite-4.0-h-micro                 │  ~4B   │ IBM      │ Agentic  │
│                                              │        │          │ Fn call  │
└──────────────────────────────────────────────┴────────┴──────────┴──────────┘
```

### Tier 2: Balanced (good quality + reasonable speed)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Model ID                                    │ Params │ Author   │ Notes    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/google/gemma-3-12b-it                   │  12B   │ Google   │ Multi-   │
│                                              │        │          │ modal    │
│                                              │        │          │ 128K ctx │
│                                              │        │          │ LoRA     │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-4-scout-17b-16e-instruct     │  17B   │ Meta     │ MoE 16   │
│                                              │        │          │ experts  │
│                                              │        │          │ Fn call  │
│                                              │        │          │ Batch    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/openai/gpt-oss-20b                      │  20B   │ OpenAI   │ Open-wt  │
│                                              │        │          │ Lower    │
│                                              │        │          │ latency  │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/mistralai/mistral-small-3.1-24b-instruct│  24B   │ Mistral  │ Vision   │
│                                              │        │          │ 128K ctx │
│                                              │        │          │ Fn call  │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/aisingapore/gemma-sea-lion-v4-27b-it    │  27B   │ AISing.  │ SEA lang │
│                                              │        │          │ focus    │
└──────────────────────────────────────────────┴────────┴──────────┴──────────┘
```

### Tier 3: Quality (best output, higher latency)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Model ID                                    │ Params │ Author   │ Notes    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/qwen/qwen3-30b-a3b-fp8                  │  30B   │ Qwen     │ MoE FP8  │
│                                              │        │          │ Fn call  │
│                                              │        │          │ Batch    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.3-70b-instruct-fp8-fast    │  70B   │ Meta     │ FP8 fast │
│                                              │        │          │ Fn call  │
│                                              │        │          │ Batch    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.1-70b-instruct             │  70B   │ Meta     │ Standard │
│                                              │        │          │ 70B      │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/openai/gpt-oss-120b                     │ 120B   │ OpenAI   │ Open-wt  │
│                                              │        │          │ Highest  │
│                                              │        │          │ reasoning│
└──────────────────────────────────────────────┴────────┴──────────┴──────────┘
```

### Reasoning Models (slow — think tokens, not ideal for game narration)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Model ID                                    │ Params │ Author   │ Notes    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/qwen/qwq-32b                            │  32B   │ Qwen     │ Deep     │
│                                              │        │          │ reasoning│
│                                              │        │          │ LoRA     │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/deepseek/deepseek-r1-distill-qwen-32b   │  32B   │ DeepSeek │ Distilled│
│                                              │        │          │ reasoning│
└──────────────────────────────────────────────┴────────┴──────────┴──────────┘
```

### Specialized (not for game narration)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Model ID                                    │ Params │ Author   │ Notes    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/qwen/qwen2.5-coder-32b-instruct         │  32B   │ Qwen     │ Code only│
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-guard-3-8b                    │   8B   │ Meta     │ Safety   │
│                                              │        │          │ classify │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta/llama-3.2-11b-vision-instruct       │  11B   │ Meta     │ Vision   │
│                                              │        │          │ only     │
└──────────────────────────────────────────────┴────────┴──────────┴──────────┘
```

### Legacy (older versions, still available, not recommended)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Model ID                                    │ Params │ Author   │ Notes    │
├──────────────────────────────────────────────┼────────┼──────────┼──────────┤
│ @cf/meta-llama/meta-llama-3-8b-instruct      │   8B   │ Meta     │ Older L3 │
│ @cf/meta/llama-3-8b-instruct-awq             │   8B   │ Meta     │ Older L3 │
│ @cf/meta/llama-3-8b-instruct                 │   8B   │ Meta     │ Older L3 │
│ @cf/mistralai/mistral-7b-instruct-v0.2       │   7B   │ Mistral  │ Older    │
│ @cf/mistralai/mistral-7b-instruct-v0.1       │   7B   │ Mistral  │ Oldest   │
│ @cf/google/gemma-7b-it                       │   7B   │ Google   │ Older    │
│ @cf/google/gemma-7b-it-lora                  │   7B   │ Google   │ LoRA base│
│ @cf/google/gemma-2b-it-lora                  │   2B   │ Google   │ LoRA base│
│ @cf/meta-llama/llama-2-7b-chat-hf-lora       │   7B   │ Meta     │ Llama 2  │
│ @cf/meta/llama-2-7b-chat-fp16                │   7B   │ Meta     │ Llama 2  │
│ @cf/meta/llama-2-7b-chat-int8                │   7B   │ Meta     │ Llama 2  │
│ @cf/nousresearch/hermes-2-pro-mistral-7b     │   7B   │ Nous     │ Fn call  │
└──────────────────────────────────────────────┴────────┴──────────┴──────────┘
```

---

## DungeonGPT Default Selection

| Slot          | Model ID                                    | Why                              |
|---------------|---------------------------------------------|----------------------------------|
| **Default**   | `@cf/meta/llama-3.1-8b-instruct-fast`       | Fast, good narrative, free       |
| **Fallback**  | `@cf/zai-org/glm-4.7-flash`                 | Fast alt, huge context window    |
| **Upgrade**   | `@cf/meta/llama-4-scout-17b-16e-instruct`   | MoE, better quality, still fast  |
| **Best**      | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`  | 70B quality, fp8 speed-optimized |

---

## Notes

- **No external API keys required** — all models run on Workers AI binding
- **No premium tier needed** — removed OpenAI/Anthropic/Google API Gateway dependency
- Model IDs use `@cf/{author}/{model}` format — pass directly to `env.AI.run()`
- `@cf/mistralai/mistral-nemo-instruct-2407` was in old registry but NOT in current catalog — may be removed
- `@cf/qwen/qwen2.5-72b-instruct` was in old registry but NOT in current catalog — may be removed
- Verify all model IDs after deployment via `wrangler ai models list` or the dashboard
