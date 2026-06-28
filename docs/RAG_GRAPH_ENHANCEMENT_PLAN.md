# RAG Graph-Enhancement Plan

> **STATUS: PROPOSED (May 2026).** Not started. This doc captures a design sketch for evolving the existing flat-vector RAG system (see `LOCAL_RAG_PLAN.md`) toward a hybrid pattern that uses entity tags as a lightweight graph layer and injects structured game state directly into prompts.
>
> **Source of idea:** Daulet Amirkhanov, "Architectural patterns for graph-enhanced RAG: Moving beyond vector search in production," VentureBeat, 17 May 2026. The article advocates pairing vector search with a graph DB (Neo4j) to handle multi-hop questions and stale-fact problems in enterprise data. This plan adapts the *pattern* (hybrid retrieval, structural truth, stale-edge mitigation) to DungeonGPT's constraints — single-player, on-device, IndexedDB — without taking on graph-DB infrastructure.
>
> **Prerequisite:** `LOCAL_RAG_PLAN.md` Phases 0–3 (shipped). This plan extends that system. The original design record now lives at `docs/archive/LOCAL_RAG_PLAN.md` (archived after it shipped).

## Problem

The current RAG system is what the article calls **Flat RAG**: each AI narrative is embedded as opaque text and retrieved by cosine similarity alone. This works for "what's tonally similar?" but fails for "what happened *involving this entity*?"

Specific failure modes observed (or expected) in DungeonGPT:

1. **Entity recall misses.** Re-entering a town surfaces tonally-similar swamp scenes rather than the party's prior visits to that town.
2. **Stale facts.** The DM confidently references NPCs the party has killed or items the party has consumed, because old narrative chunks still mention them as present.
3. **Lost relationships.** "Talk to the merchant we met last week" has no structural hook — the vector index doesn't know which past event involves "merchant."
4. **No structural truth in prompts.** The DM has to *infer* state (party HP, current location's history, completed milestones near here) from narrative recall, even though the game engine already has it as authoritative state.

The article's pattern addresses #1–#3 by adding a graph layer. We can capture most of the same benefit by:
- Treating the existing-but-unused `tags: string[]` field on RAG entries as a lightweight relationship layer.
- Threading current game state into prompts directly, alongside RAG context.

## Design Principles

1. **Reuse what's there.** The `tags` field is already on every IndexedDB row ([ragStore.js:35](../src/services/ragStore.js#L35)). No schema migration.
2. **No new infrastructure.** No Neo4j, no new CF Worker endpoints, no LLM-based extraction at ingest.
3. **Use the registry we already have.** Game state already holds named entities (heroes, towns, milestones, encounters, items). Tagging is deterministic string-match against that registry, not NER.
4. **Degrade gracefully.** Untagged legacy entries continue to work via cosine alone. Tag overlap is a *boost*, not a hard filter (except where strict filtering is explicitly chosen).
5. **Cache-friendly prompt layout.** Structured state goes early (deterministic, stable, cacheable); RAG context stays at the end (volatile). Preserves the prompt-cache wins from the current design.

## The asymmetry vs. the article's enterprise scenario

The VentureBeat article's pain point is that supply-chain relationships exist *only* in unstructured text — the LLM must extract them via NER at ingest. DungeonGPT is the inverse: the engine *authors* the relationships first (worldMap, milestones, party, encounters), and the narrative text is downstream of that structure.

Practically: at four of the five embed call sites, the relevant entity IDs are already in scope. We do not need an LLM to extract them.

| Ingest site | Entities in scope at call time |
|---|---|
| [useGameInteraction.js:356](../src/hooks/useGameInteraction.js#L356) (adventure start) | `selectedHeroes`, `currentTile`, `playerPosition`, `settings.milestones` |
| [useGameInteraction.js:496](../src/hooks/useGameInteraction.js#L496) (player action) | All above, plus `userMessage.content` |
| [Game.js:446](../src/pages/Game.js#L446) (movement narrative) | `targetTile`, `coords`, `selectedHeroes` |
| [Game.js:504](../src/pages/Game.js#L504) (encounter resolve) | `encounter.name`, `enemyId`, `result.rewards.items`, `heroName` |
| [Game.js:555](../src/pages/Game.js#L555) (post-encounter narrative) | `tile`, `coords`, `updatedParty` |

The only entity class we'd routinely need to extract from AI text is named NPCs that the AI invented — and even that can be a bounded string-match against `selectedHeroes` plus any state-tracked NPCs.

## Tag schema

Reuse `tags: string[]` with `type:id` string format. No IndexedDB change.

```
['hero:elaria', 'town:brightwater', 'milestone:slay_dragon',
 'enemy:goblin_chief', 'item:silver_sword', 'biome:swamp',
 'poi:ruined_tower', 'coord:34,12']
```

Tag types seeded from current state:

| Type | Source |
|---|---|
| `hero:` | `selectedHeroes[].characterName` |
| `town:` | `worldMap[].townName` |
| `milestone:` | `settings.milestones[].id` (or normalized text) |
| `enemy:` | `encounter.enemyId`, encounter milestone metadata |
| `item:` | `result.rewards.items`, `milestone.spawnRequirements.items` |
| `biome:` | `tile.biome` |
| `poi:` | `tile.poi` |
| `coord:` | `coord:${x},${y}` — spatial recall |
| `npc:` (optional) | Only if NPCs are tracked in state (TBD — see open questions) |

---

## Phase A — Entity tagging at ingest

### New module: `src/game/entityTagger.js`

Pure functions, no async, no state.

```javascript
// Build a per-session registry from current state. Called once per ingest.
buildEntityRegistry({ selectedHeroes, settings, worldMap, currentTile, encounter })
  → { byTag: Map<tagId, EntityRecord>, nameIndex: Map<lowerName, tagId> }

// Tags we know from context (no text scan needed).
directTags(registry, contextHints)
  → string[]

// Whole-word, case-insensitive scan of text against registry.nameIndex.
extractTagsFromText(text, registry)
  → string[]

// Convenience wrapper: combines both, dedupes.
tagsForIngest(state, contextHints, text)
  → string[]
```

### Call-site wiring

One added helper call per ingest site (~3 lines each). Example, encounter resolve at [Game.js:504](../src/pages/Game.js#L504):

```javascript
const tags = tagsForIngest(
  {
    selectedHeroes: updatedParty,
    settings,
    worldMap: mapHook.worldMap,
    currentTile: getTile(mapHook.worldMap, playerPosition.x, playerPosition.y),
    encounter: activeEncounter,
  },
  {
    encounter: activeEncounter,
    items: result?.rewards?.items,
    heroes: [heroName],
  },
  encounterContent
);
embedAndStore(sessionId, encounterContent, {
  msgIndex: updated.length - 1,
  tags,
});
```

`embedAndStore` already accepts `metadata.tags` ([ragEngine.js:37](../src/game/ragEngine.js#L37)); no engine signature change.

### Why string-match instead of LLM tagging

- Registry is small: tens to low hundreds of names per session.
- Tagging is sub-millisecond, deterministic, free, offline.
- Article's NER step exists because enterprise corpora reference entities not in any registry. We have a registry.

---

## Phase B — Tag-aware retrieval

### Modify `ragEngine.query()`

Extend [ragEngine.js:54](../src/game/ragEngine.js#L54) with new options:

```javascript
export const query = async (sessionId, queryText, options = {}) => {
  const {
    maxResults = 3,
    minSimilarity = 0.5,
    queryTags = [],           // NEW
    tagBoost = 0.15,          // NEW — additive bonus per matching tag
    requireTagMatch = false,  // NEW — strict-filter mode
  } = options;

  // ... embed query ...
  const entries = await ragStore.getBySession(sessionId);

  let scored = entries.map(entry => {
    const sim = cosineSimilarity(queryVector, entry.vector);
    const overlap = entry.tags?.filter(t => queryTags.includes(t)).length || 0;
    const boost = Math.min(0.3, overlap * tagBoost);
    return {
      text: entry.text,
      similarity: sim + boost,
      rawSimilarity: sim,
      tagOverlap: overlap,
      msgIndex: entry.msgIndex,
      tags: entry.tags || [],
    };
  });

  if (requireTagMatch && queryTags.length > 0) {
    const tagged = scored.filter(r => r.tagOverlap > 0);
    if (tagged.length > 0) scored = tagged; // graceful fallback
  }

  return scored
    .filter(r => r.rawSimilarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
};
```

### Two retrieval modes

- **Soft boost (default).** Tag overlap adds a small score bump. Preserves current behaviour as a floor — old untagged entries still surface. Right for **player-action queries**, where the user's input may or may not name a known entity.
- **Strict filter (`requireTagMatch: true`).** Returns only entries that share a tag, falling back to soft-boost if zero results. Right for **movement narratives** — re-entering a known town should surface that town's prior events, not tonally similar misfires.

### Caller changes

```javascript
// useGameInteraction.js:407 (player action) — soft boost
const queryTags = tagsForIngest(state, contextHints, userMessage.content);
const ragResults = await ragQuery(sessionId, userMessage.content, { queryTags });

// Game.js:404 (movement) — strict filter
const queryTags = directTags(registry, { tile: targetTile });
const ragResults = await ragQuery(sessionId, tileDesc, {
  queryTags,
  requireTagMatch: true,
});
```

---

## Phase C — Structured state injection in promptComposer

Currently [promptComposer.js:83](../src/game/promptComposer.js#L83) hand-builds context: setting, mood, goal, milestones, location, party. The party line is just `name (class)`. The location line is one sentence. The DM gets minimal structural truth.

Add a `[LOCATION MEMORY]` block (and consider `[PARTY STATE]`) that pulls deterministically from current state:

```javascript
// New helper in promptComposer.js
const formatLocationMemory = ({ currentTile, settings, worldMap }) => {
  // Output example:
  // [LOCATION MEMORY]
  // Brightwater — town, visited 3 times.
  // Active milestones here: "Find the missing merchant".
  // Completed here: "Recruit the swordsmith".
};
```

### Prompt layout

```
[CONTEXT] (existing — setting, mood, goal, party summary)
[LOCATION MEMORY] (NEW — structured, deterministic)
[PARTY STATE] (NEW — HP, inventory if tracked)
[SUMMARY] (existing)
[PLAYER ACTION] (existing)
[NARRATE]
[RECALLED MEMORIES] (existing — at end for cache-friendliness)
```

Rationale: structured state is **stable across the turn** and benefits from prompt caching; RAG context is **volatile per query** and stays at the tail. This preserves the cache wins documented in `LOCAL_RAG_PLAN.md`.

### What's worth threading through

To be decided empirically — the right fields are those the DM most often hallucinates today. Candidates:
- Location: visit count, completed milestones tied here, named NPCs encountered (if tracked).
- Party: current HP fraction, inventory (if tracked), recent status changes, defeated flag.
- Active encounters / pending decisions.
- Faction standing (if state tracks it).

---

## Phase D — Stale-fact handling (the "stale edge" mitigation)

The article's stale-edge problem maps directly: a RAG entry that says *"the merchant Hilda gave you the silver sword"* is stale if Hilda is now dead or the sword has been consumed.

### Approach

1. **Compute a `staleEntities: Set<tagId>` from current state at query time.** Defeated heroes (`hero:`), consumed items (`item:`), confirmed-dead enemies (`enemy:`). No new storage.
2. **Drop or down-rank entries whose tags intersect `staleEntities`.** Cheap, runs inside the same query pass as the tag overlap calculation.

### Caveat

Less important here than in finance/healthcare — a DM hallucinating a dead NPC is annoying, not a compliance event. Ship last, once we have observed examples.

---

## Migration & compatibility

- Existing IndexedDB entries have `tags: []`. With soft-boost retrieval they continue to work; they just never receive the boost. Graceful degradation.
- The backfill flow at [ragEngine.js:88](../src/game/ragEngine.js#L88) is the natural place to retroactively tag old entries: when re-embedding, also run `extractTagsFromText` against a registry assembled from the current save state. Optional — Phase A alone delivers value on new entries.
- Schema unchanged: `tags: string[]` already exists on every row.
- A memory of a now-dead NPC will still match on `hero:hilda` after backfill — desired for retrieval; the Phase D stale-filter is the separate concern.

---

## Tradeoffs

### Benefits

- Multi-hop-ish queries work: "talk to the blacksmith" while in Brightwater pulls Brightwater entries first.
- Past-encounter recall works: re-entering a town surfaces that town's history, not tonally similar misfires elsewhere.
- DM stops referencing dead NPCs (Phase D).
- No Neo4j, no new deps, no new CF Worker endpoints, no schema migration.

### Costs

- Per ingest: build registry (small map) + one substring scan, ~1 ms. Negligible.
- Per query: tag-overlap counting per entry. Linear in session size — same complexity class as the existing cosine pass.
- ~150–250 lines of new code (entityTagger module + query options + call-site wiring + promptComposer block).
- Tag accuracy depends on the entity-name registry being complete — needs care when new entity types are added.

### What this is NOT

- Not a graph database. No nodes-and-edges traversal at retrieval time.
- Not semantic caching (cosine > 0.85 → serve cached). Hit rate near zero in single-player single-session use; skip.
- Not LLM-based relationship extraction. Game state already encodes relationships.

---

## Open questions

Before implementation, answer:

1. **Are there named NPCs in state, or are they purely AI-generated?** Determines whether `npc:` tags can come from `directTags` or must come from `extractTagsFromText`. Audit needed in `HeroContext.js`, encounter/building data shapes.
2. **Is party inventory tracked in state?** If yes, `item:` tags are deterministic; if no (items are narrative-only), heuristic extraction needed.
3. **Does any town/location track "NPCs encountered there"?** That's the natural relationship edge to surface in `[LOCATION MEMORY]`.
4. **Which structured facts is the DM *most often* hallucinating today?** Drives Phase C's `[LOCATION MEMORY]` / `[PARTY STATE]` content.

---

## Suggested order of work

1. **Phase A in isolation.** Tag at ingest, no query changes. Smallest possible diff. Inspect tagged entries via [RagTest.js](../src/pages/RagTest.js) to verify tag quality.
2. **Phase B soft-boost only.** Verify retrieval quality on the benchmark queries from `LOCAL_RAG_PLAN.md`.
3. **Phase C structured injection.** Independent of A/B. Likely the biggest *felt* quality improvement to the DM regardless of RAG changes — can ship in parallel.
4. **Phase B strict-filter for movement.** Once tag quality is trusted.
5. **Phase D stale-fact filter.** Last, once real failure-mode examples exist.

---

## Open work tracking

- [ ] Audit state for NPC / inventory / location-NPC tracking (open questions 1–3).
- [ ] Implement `src/game/entityTagger.js` + tests.
- [ ] Wire Phase A at five ingest sites.
- [ ] Extend `ragEngine.query()` with `queryTags` / `tagBoost` / `requireTagMatch`.
- [ ] Update player-action and movement callers to pass `queryTags`.
- [ ] Design `[LOCATION MEMORY]` block in `promptComposer.js`.
- [ ] Stale-entity computation for Phase D.
- [ ] Optional: extend backfill to retroactively tag legacy entries.
