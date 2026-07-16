# TTS for DungeonGPT — Working Notes

Notes on adding text-to-speech (dynamic voice narration) to DungeonGPT, given the current stack: **CF Pages frontend → CF Worker (+ Hyperdrive → Hetzner Postgres)**, with an AI dungeon master that splits **deterministic rules engine + LLM narration**.

---

## TL;DR / Recommendation

- **No GPU needed.** Both candidate models are CPU-first, on-device designs.
- **Don't run the TTS model inside the CF Worker** — isolate limits make it a non-starter.
- **Start with Workers AI (Deepgram Aura) called from the Worker, fronted by an R2 cache keyed by `hash(text + voice)`.** It's a one-binding extension of what already exists.
- **Migrate dynamic synthesis to client-side (`kokoro-js`)** later if per-use cost climbs or you want the open-model control. Keep R2-cached deterministic lines either way.
- **Hold Hetzner self-hosting in reserve** for total control or offline batch pre-generation.

---

## Candidate open models

| Model | Params | License | Languages | Browser path | Notes |
|---|---|---|---|---|---|
| **Kokoro-82M** (hexgrad) | ~82M | Apache 2.0 | English only | `kokoro-js` (Transformers.js), WASM + WebGPU | Quality leader; needs G2P (misaki) but the JS lib bundles it |
| **Supertonic 3** (Supertone) | ~99M | Open weights | 31 languages | `onnxruntime-web`, WASM + WebGPU | Faster/lighter; does its own text normalization (no separate phonemizer); released Apr 2026 |

Both are genuine on-device ONNX models. Kokoro wins on naturalness; Supertonic wins on speed, footprint, and multilingual.

---

## The benchmark I sense-checked

Source: `gauravvij/kokoro-tts-vs-supertonic-3-tts` — CPU-only, 4-core AMD EPYC cloud VM, 120 timed runs. **It's 2 models × 4 configs, not 4 models.**

**Headline results (RTF, lower = faster):**

| Config | Mean RTF | vs real-time | Quality (subjective) |
|---|---|---|---|
| Supertonic-3 (2-step) | 0.165 | 6.1× | ❌ Robotic / unclear |
| Supertonic-3 (5-step) | 0.313 | 3.2× | ✅ Clear, intelligible |
| Kokoro-82M (PyTorch) | 0.469 | 2.1× | ✅✅ Human-like |
| Kokoro-82M (ONNX) | 0.509 | 2.0× | ✅✅ Human-like |

**Trust the shape, not the decimals.** The direction (Supertonic fast / Kokoro natural / 2-step too degraded) is sound and matches the models' design intent. But:

- **One paragraph is outright wrong.** It claims Kokoro ONNX gives a "0.92× speedup" and "outperforms" PyTorch — but ONNX RTF (0.509) is *higher* (slower) than PyTorch (0.469). The narrative is backwards from its own data. The whole report was generated end-to-end by an autonomous agent with no human review, which explains it (section numbering also skips 6).
- **RTF slightly flatters Supertonic.** RTF = wall_time / audio_duration, and Supertonic renders ~10–15% longer audio for the same text → lower RTF at equal compute. Throughput (chars/sec) is the cleaner metric; the ranking survives there (~111 vs ~34) but the magnitude is generous.
- **Quality eval is n=1** — a single non-blind listener, one voice per model, English only. Directional, not a finding.

---

## CPU vs GPU

CPU is fine — the entire benchmark is GPU-free. For a game, the metric that matters isn't RTF, it's **per-call latency**, which scales with how much text you synthesize at once.

**Worst-case latency (from the report's weak 4-core VM):**

| Text length | Supertonic 2-step | Supertonic 5-step | Kokoro |
|---|---|---|---|
| ~1 sentence (59 chars) | ~0.7s | ~1.4s | ~1.8s |
| ~200 chars | ~1.8s | ~3.7s | ~5.5s |

Real desktop CPU / WebGPU is meaningfully faster. **Key trick: chunk by sentence and stream playback** — start speaking sentence 1 while sentence 2 synthesizes, so time-to-first-audio is the short-line number, not the whole-paragraph number.

---

## Other models to consider

Kokoro and Supertonic are strong for plain narration but **neither clones voices or gives real emotion control** — which for a DM game is exactly what you'd want for distinct NPCs and dramatic vs. hushed delivery. The models below fill that gap. Grouped by what the game actually needs.

### Character voices via cloning — GPU host required
| Model | License | Notes |
|---|---|---|
| **Chatterbox** (Resemble AI) | MIT | Beat ElevenLabs in a blind test; first local model where cloned output stopped sounding synthetic. ~4–6GB VRAM, ~couple sec first-audio. MIT = commercially usable. |
| **Orpheus 3B** (Canopy Labs) | Apache 2.0 | Llama-backbone speech LLM; zero-shot cloning + guided emotion tags; low latency. Wants ~8–12GB VRAM — keep it fully on GPU or speed collapses. |
| **CosyVoice 2** | Apache-ish | Explicit inline emotion tags (happy/sad/angry/surprised) that genuinely change delivery; streaming. Best on Mandarin; English competent but flatter. ~8GB VRAM. |
| **Fish Audio S2 / Fish Speech** | check per-release | SOTA cross-lingual cloning, 80+ languages. GPU. |

### Character voices on-device (no GPU)
- **NeuTTS Air** (Neuphonic) — on-device TTS with **instant cloning from ~3s** of audio, 0.5B LLM backbone, shipped as GGUF/GGML so it runs on CPU (even Raspberry Pi) in real time. The only realistic "distinct voices without a GPU" option here. Newer / less battle-tested.

### Even lighter than Kokoro
- **Piper** — dozens of pre-trained voices, no cloning, ONNX, built for CPU-only / embedded. Good for **pre-baking deterministic lines** cheaply. `pip install piper-tts`.

### ⚠️ License trap
- **F5-TTS** — excellent fast zero-shot cloning (RTF ~0.15), MIT *code* — but released **weights are CC-BY-NC** (Emilia training set), i.e. **non-commercial** unless retrained on permissive data. Wrong license for DungeonGPT as-is.

### Managed realtime (beyond CF), if you outgrow Aura
- **Cartesia** (low-latency), **ElevenLabs** (easiest cloning, watch the bill), **Hume Octave** (emotional). CF's Aura already covers most of this niche natively, so only reach here for a specific voice/quality need.

### Architectural catch
None of the cloning models fit the current stack directly — too big for the Worker, too heavy for the CPU Hetzner box in real time, too large to ship to the browser. So character voices realistically mean either:
1. A **separate GPU host** (Hetzner GPU instance, or serverless: Replicate / Modal / RunPod), **or**
2. **Pre-generate a fixed set of NPC/character lines offline → cache to R2**, while dynamic LLM narration keeps using a fast model (Aura or client-side Kokoro).

Option 2 folds straight into the deterministic-vs-LLM caching split below: **pre-baked character voices for the repeatable stuff, fast lightweight TTS for the unique narration.**

---

## Where TTS can live (3 options mapped to the stack)

### ⚠️ Constraints first
- **Not in the Worker.** Isolates cap at 128MB memory with CPU-time limits and are ephemeral → loading an 80–160MB ONNX model per request = cold-load every time, likely OOM. Bad fit.
- **Hyperdrive is Postgres-only.** It's a DB connection accelerator/pooler. TTS audio never routes through it. Self-hosted TTS is a *separate* HTTPS endpoint the Worker/browser calls directly.

### Option A — Workers AI (managed, edge) ← recommended start
- Slots into the existing Worker. Add an `[ai]` binding, call `env.AI.run('@cf/deepgram/aura-1', { text })`.
- Returns a `ReadableStream` (MPEG audio) → pipe straight back to the browser.
- WebSocket support on the audio models → stream LLM tokens into TTS, stream audio out.
- Models available: Deepgram Aura-1 / Aura-2, MeloTTS, OpenAI TTS, Inworld, MiniMax.
- Neuron-based pricing, daily free allocation, per-character after.
- Tradeoff: not the open Kokoro/Supertonic voices — but Aura's context-aware prosody suits DM narration well.

### Option B — Client-side (browser) inference
- Worker streams narration **text** (already does this); browser synthesizes locally via `kokoro-js` / `onnxruntime-web`.
- Zero backend TTS cost, scales per-user, keeps the open-model choice.
- `TextSplitterStream` is purpose-built to consume an LLM stream sentence-by-sentence.
- Costs: one-time ~80–160MB model download (cached), run in a **Web Worker** so synthesis doesn't jank the render loop. Device-dependent; mobile weaker.

### Option C — Self-host on Hetzner
- Small FastAPI TTS microservice alongside the existing Postgres / FastAPI / Celery / Redis stack, running Kokoro or Supertonic ONNX.
- Worker or browser calls it over HTTPS (not Hyperdrive).
- Pro: uniform quality, full control, open models. Con: CPU per concurrent synthesis competes with the DB and other workloads → concurrency ceiling; more ops. Better for batch/pre-gen than hot-path at scale.

---

## The caching layer (ties it together)

The **deterministic vs LLM** split maps directly onto caching:

- **Deterministic / repeatable text** (combat resolutions, item descriptions, standard prompts, UI barks) → high cache-hit rate. Synthesize once, store audio in **R2** keyed by `hash(text + voice)`. Could even pre-bake offline.
- **Unique LLM narration** → low hit rate → this is where on-the-fly synthesis cost + latency actually lives.

R2 has **no egress fees** and lives natively in the CF stack → ideal audio cache/CDN.

**Flow:** `browser → Worker → check R2 → (miss) synthesize → write back to R2 → stream to browser`

---

## Pre-recorded authored text vs on-the-fly synthesis (the content mix)

The caching split above is really a special case of a bigger point: **a growing share of
DungeonGPT's text is *authored and fixed*, not generated per playthrough** — and fixed
text can be voiced **once, offline, at author/build time**, then shipped as a static audio
asset that never pays runtime TTS cost again.

**What is pre-recordable (authored, finite, reused across every player):**
- Campaign **openings** (already authored, 2026-07-07).
- **Scripted high-stakes beats** (quest completions, deaths, campaign completion) that
  #76 (engine-referees-narrates) is making engine-decided and scripted.
- Quest **intro / turn-in** text and NPC lines, especially as #77 pushes toward
  "ready-made quests, mostly pre-written".
- Boss intros, milestone scene text, tutorial / onboarding lines.

**Why pre-recording these is the highest-value move, not just a cost trick:**
- **Zero runtime cost/latency** for the *biggest, most dramatic* pieces of narration —
  exactly where quality matters most and where on-the-fly latency hurts most.
- **Best possible quality, no latency budget.** Offline, you can use the heavy models the
  hot path can't afford: the GPU cloning/emotion models above (Chatterbox, Orpheus,
  CosyVoice), or even **human voice actors** for flagship/premium campaigns. This is how
  the "distinct NPC voices + real emotion" gap gets solved — offline pre-gen sidesteps the
  "doesn't fit the stack" problem entirely.
- **Consistency:** an authored set-piece sounds identical every time (right for a
  fixed scene; wrong to re-synthesize per play).

**The two-track model (the "mix"):**

| Text kind | Source | Audio path | Cost | Quality lever |
|---|---|---|---|---|
| Authored / scripted / repeatable | build/author time | **pre-recorded static asset** (build-time synth or human VO), served from R2/CDN | none at runtime | highest (heavy models / VO) |
| Unique LLM narration | per playthrough | **on-the-fly TTS** (Aura → later `kokoro-js`), R2-cached by hash | pay per unique line | fast/light model |

**Strategic alignment worth calling out:** the more the game leans on pre-written content
(#76 scripted beats, #77 ready-made quests, authored openings), the **larger the
pre-recorded share and the smaller the runtime-TTS surface**. The content strategy and the
audio strategy reinforce each other: pushing text from "LLM-generated" toward "authored"
simultaneously improves narration control *and* shrinks the audio bill to just the truly
dynamic sentences.

**Pipeline:** an author/build step synthesizes authored text → audio keyed by a stable id
(template/milestone/beat id) + a **text hash**, so a line is regenerated only when its
authored text changes (hash mismatch). Mechanically this is the *same* R2 hash-cache as
the runtime path, just **populated at author time instead of first-play**. So Phase 1's
cache infrastructure serves both; pre-recording is "warm the cache offline for the
authored corpus".

**Practicalities:** pre-recorded campaign audio is heavy → lazy-load per campaign/scene,
serve from R2, and tier-gate premium campaigns' voice packs. Human-VO'd flagship
campaigns become a concrete **premium differentiator** that dynamic TTS can never match
(you cannot voice-act text that does not exist until runtime) — but only for roles whose
lines are *entirely* authored (see voice architecture below).

---

## Voice consistency & dramatic delivery (voice architecture)

Two constraints that shape everything above, and must be decided **early** because they
gate model choice.

### Consistency is required *per voice role*, not globally
Mixing pre-recorded and on-the-fly audio only sounds like "a mess" when **the same role**
switches voice mid-stream. The rule is **same model + same voice preset + same params**
*within a role*:

- The **DM narrator** interleaves authored and dynamic text every turn → that stream must
  be **one model + one voice** for both the pre-recorded and the on-the-fly lines. This is
  the piece the "use a heavier model / human VO offline" idea **cannot** apply to.
- **Self-contained authored blocks** (a campaign opening cinematic, a boss-intro card, a
  fully-authored NPC's lines) do *not* interleave sentence-by-sentence with dynamic
  narration, so they can use a **different, higher-quality voice** without seams. That is
  intentional casting (narrator vs character vs cinematic), not inconsistency.

**Hard constraint that falls out:** a role can be **human-VO'd or premium-model'd only if
every line in that role is authored**. The DM narrator generates fresh text each turn (#76
keeps narration dynamic), so it is **locked to the affordable runtime model** — it can
never be human-voiced. Openings, boss intros, scripted beats, and NPCs who *only* ever
speak authored lines can be.

### Can these models sound dramatic? Mostly not — the cheap ones are neutral
- **Kokoro / Supertonic / Aura / Piper** = clear, natural, *neutral* audiobook narration.
  Intelligible and pleasant, but essentially flat. No real emotion/drama control (Aura's
  context-aware prosody helps slightly; that is the ceiling for "runtime-affordable").
- **Dramatic / emotional delivery needs a tier up:** Orpheus 3B / CosyVoice 2 / Chatterbox
  (GPU, emotion tags), managed **ElevenLabs / Hume Octave** (easiest directable dramatic
  narrator, watch cost), or **human VO**. All too costly per dynamic sentence at scale;
  all fine for a finite pre-recorded set.

### Resolution (why this reinforces pre-recording)
The dramatic moments are the **authored** ones (openings, boss reveals, climaxes), which
are finite and pre-generated once. So:
- **Authored dramatic set-pieces** → premium dramatic voice (ElevenLabs / Orpheus / human
  VO), pre-recorded, one-time cost, maximum drama where it matters.
- **Moment-to-moment dynamic narration** → one consistent, affordable, neutral voice
  (Aura to start).
- The voice switch reads fine because a cinematic opening *is* a distinct context from
  turn-by-turn play (cutscene vs gameplay).
- If drama is wanted *everywhere*, the only options are: pick one dramatic-capable model
  and eat its cost/latency on every line, or ship a heavy emotion model client-side.

**Decision to make first:** the **voice-role map** — how many voice roles, and which model
each role uses. Everything else (which text is pre-recordable, what can be human-VO'd,
runtime cost) is downstream of it.

---

## Suggested phased path

1. **Phase 1:** Workers AI (Aura) from the Worker + R2 cache keyed by text hash. Minimal new surface area.
2. **Phase 1b (authored corpus):** offline pre-synthesis of the fixed authored text (openings, scripted beats, quest intros/turn-ins) into the *same* R2 hash-cache at build/author time — "warm the cache" for the highest-value narration so it never pays runtime cost. Uses Phase 1's cache infra; can use heavier/best-quality models (or human VO for flagship/premium campaigns) since there is no latency budget offline.
3. **Phase 2:** If per-use cost climbs or you want open-model control, move *dynamic* synthesis client-side (`kokoro-js`, quantized `q8`, streamed by sentence, in a Web Worker). Keep R2-cached deterministic + pre-recorded lines.
4. **Reserve:** Hetzner self-host for total control or to batch-generate a library of common lines offline.

---

## Gotchas checklist

- [ ] Chunk narration by sentence; stream playback to hide latency.
- [ ] Run any client-side inference in a **Web Worker** (protect the frame loop).
- [ ] Show first-load progress for the browser model download; rely on browser cache after.
- [ ] Handle **WebGPU-unavailable** → fall back to WASM (Chromium good; Firefox historically lagged).
- [ ] Cache deterministic lines in R2; only pay for unique LLM narration.
- [ ] Kokoro = English only. If multilingual matters, Supertonic (31 langs) or a Workers AI multilingual model.
- [ ] Watch quantization tradeoffs (`q8`/`q4`/`fp16`/`fp32`) for size vs quality on the client path.

---

## Reference links

- Benchmark repo: `github.com/gauravvij/kokoro-tts-vs-supertonic-3-tts`
- Kokoro (JS): `npm i kokoro-js` · models: `onnx-community/Kokoro-82M-v1.0-ONNX`
- Supertonic: `github.com/supertone-inc/supertonic` · `huggingface.co/Supertone/supertonic`
- Workers AI models: `developers.cloudflare.com/workers-ai/models/`
- Deepgram Aura on Workers AI: `@cf/deepgram/aura-1`, `@cf/deepgram/aura-2-en`
