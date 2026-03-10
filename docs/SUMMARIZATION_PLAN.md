# Summarization System Redesign

## Current State

**Single summary field** (`summary TEXT` in conversations table) serves double duty:
- Displayed on the Saved Games page as a story recap
- Fed into every AI prompt as `[SUMMARY]` context

**Updated after:** player chat exchanges only (handleSubmit, handleStartAdventure).
**NOT updated after:** movement narratives, post-encounter narratives, town enter/leave.

**Prompt:** "Combine old summary + recent exchange into 2-4 sentences capturing key events, locations, character actions."

### Problems
1. Movement/encounter events never get summarized — the AI loses track of what happened between chats
2. Summary is mostly redundant — it restates party names, location, quest goal, and buildings that are already provided in the `[CONTEXT]` block
3. The only *useful* content in a typical summary is narrative-level information: player decisions, NPC interactions, plot developments, consequences
4. 2-4 sentences is tight but might be fine if we stop wasting them on facts the game already knows

### Key Insight
The game state already provides: party composition, current location, nearby buildings, campaign goal, milestones. The summary should NOT repeat any of this. It should only capture what the game engine *can't* derive from state — the narrative thread.

---

## Proposed Design: Two-Layer Summary (No DB Changes)

### Layer 1: Narrative Summary (existing `summary` field)
**Purpose:** Capture the story thread — decisions, interactions, discoveries, consequences.
**Displayed:** On Saved Games page as story recap.
**Updated:** After every AI response (chat, movement, encounter).
**Length:** 3-5 sentences.

The summarization prompt explicitly tells the AI what NOT to include (since it's already in game context), and what TO include (since only the summary preserves it):

```
Summarize ONLY the narrative thread from this exchange.

DO NOT include (these are already tracked by the game):
- Party member names or classes
- Current location or nearby buildings
- Campaign goal or milestone status
- Setting description or mood

DO include:
- Player decisions and stated intentions
- NPC interactions (who they met, what was said/learned)
- Plot developments and discoveries
- Consequences of player actions
- Unresolved questions or threats

Combine with the old summary into 3-5 sentences. Output ONLY the summary.
```

### Layer 2: Recent Context Window (new, in-memory only)
**Purpose:** Short-term context so the AI knows what just happened.
**Storage:** In-memory state only (not persisted to DB). Rebuilt from conversation on load.
**Implementation:** Last N AI messages (3-5), truncated to ~150 chars each.

This already partially exists in `promptComposer.js` (`buildRecentAiContext`) but is only used for movement prompts. We'd reuse it in `handleSubmit` too.

### No DB Changes Required
- `summary` field already exists and continues to hold the narrative summary
- Recent context is derived from the conversation array (already persisted)
- No new tables or columns needed

---

## Implementation Plan

### Phase 1: Fix Summary Prompt + Gaps
**Files:** useGameInteraction.js, Game.js

1. **Rewrite the summarization prompt** to focus on narrative thread only (see above). This is the highest-value change — stops the summary from being 90% redundant facts.
2. **Expose `summarizeConversation`** from useGameInteraction hook return.
3. **Call it after movement narratives** in Game.js — currently movement AI responses are never summarized, so events that happen during travel are lost.
4. **Call it after post-encounter narratives** in Game.js — same gap.
5. **Filter what gets sent to the summarizer** — for movement/encounter AI responses, only pass the AI narrative text, not system messages like "You have entered Frostwood" (those are game state, not story).

### Phase 2: Add Recent Context to Chat Prompts
**Files:** useGameInteraction.js

1. Import or replicate `buildRecentAiContext` from promptComposer.js
2. Include the last 3-5 AI messages as `[RECENT EVENTS]` in handleSubmit prompts
3. This gives the AI short-term memory without inflating the summary

The prompt structure becomes:
```
[CONTEXT]
{game context + location — factual state}

[SUMMARY]
{3-5 sentence narrative thread — decisions, NPCs, discoveries}

[RECENT EVENTS]
{last 3-5 AI messages, truncated — what just happened}

[PLAYER ACTION]
{user input}

[NARRATE]
```

---

## What This Does NOT Do (Future Considerations)

### Location Journal
A log of places visited with timestamps. Could be useful but adds DB complexity.
For now, the summary prompt instructions + location context should be sufficient.

### Town-Level vs World-Level Summaries
Separate summaries per scope. Elegant but adds significant complexity (tracking scope transitions, merging on scope change). The two-layer approach (long-term summary + recent context window) handles this more simply — the recent context naturally reflects whatever scope the player is in.

### Vector Database / Semantic Search
Full RAG over conversation history. Maximum recall but heavy infrastructure.
Not justified unless campaigns regularly exceed hundreds of exchanges.
The structured summary + recent context window should cover most use cases.

### Per-Town Memory
Remember what happened in each town. Would need a map from town name -> events.
Could be approximated by the summary retaining key town events, or by a simple
in-memory object (not persisted). Defer unless players report "the AI forgot what
happened in Town X."

---

## Token Budget Estimate

| Component | Approx Tokens |
|-----------|--------------|
| DM_PROTOCOL | ~300 |
| Game context + location | ~100-200 |
| Narrative summary (3-5 sentences) | ~60-100 |
| Recent context (3-5 messages) | ~200-400 |
| Player action | varies |
| **Total prompt overhead** | **~700-1000** |

This is well within budget for any frontier model. The recent context window is the largest addition but provides the most value for coherence.
