# Quests, Sites & Sub-Quests — design plan

How wilderness sites (caves/ruins) connect to the quest system, and how to add
discoverable sub-quests. Builds on WILDERNESS_SITES_PLAN.md (sites Phases 1-3).

## Where we are
- Sites (caves/ruins) are explorable in-game with encounters + loot (Phase 3a/3b).
- A milestone objective can be *injected* into a site (`injectSiteObjective`: item /
  combat-boss / reach-room) and completes through the normal milestone path (Phase 3c).
- **Not yet wired:** any campaign actually puts an objective in a site, and sites are
  always visible regardless of whether a quest needs them.

## Key simplification
There is ~**one cave and one ruin per world map**. So a quest does NOT need to name or
identify a specific site — it binds to the site **by type** ("explore the cave" /
"search the ruins"). This removes the whole named-milestone-site / identity problem.

---

## Part A — Bind a quest to a site (the immediate "others")

1. **Story-template schema.** A milestone may carry a `site` objective instead of a town
   `building`:
   ```
   site: { type: 'cave' | 'ruins', objectiveType: 'item' | 'combat' | 'location',
           id, name, description? }
   ```
2. **Spawn channel.** At world-gen, collect site objectives into `requiredSiteObjectives`
   keyed by type (`{ cave: {...}, ruins: {...} }`), saved in `game_settings` — exactly
   like `requiredBuildings` for towns.
3. **Inject on entry.** In `handleEnterLocation`, after generate + populate, if there's a
   `requiredSiteObjectives[poiType]` for an **active** milestone, call
   `injectSiteObjective`. (Completion already works via Phase 3c.)

## Part B — Visibility: hidden until the quest is picked up
Solves "what if the player ventures there before the quest" cleanly: the site simply
isn't there to enter yet.

- Reuse the milestone-POI visibility mechanism (`visibleMilestonePois`) but extend it to
  caves/ruins: a quest-relevant site's world-map POI is **hidden until the milestone that
  needs it is active** (prerequisites met / quest picked up), then revealed.
- **Decision needed (D1):** do *generic* (non-quest) caves/ruins still appear for free
  exploration (always visible, random encounters/loot), or are sites **only** quest-gated
  (no site appears until a quest sends you)? The latter makes sites purely quest-driven
  and avoids a player clearing a site before its quest exists.

## Part C — Sub-quests (the bigger piece)
Today a campaign = one fixed milestone chain chosen at start; there's no way to *discover*
optional quests mid-play. Sub-quests add that, and are the natural mechanism that "picks
up" a quest which then reveals a site.

Pieces:
1. **Quest model.** A side quest = a small milestone chain with its own id/title/steps/
   rewards and `active`/`completed` state, tracked separately from the main campaign
   (e.g. `settings.sideQuests: [{ id, title, milestones:[...], status }]`). The existing
   milestone engine functions can run per-chain.
2. **Pickup / discovery.** How a side quest becomes active. Options (D2):
   - **NPC quest-giver** (tavern rumor, a townsperson) — most classic.
   - **Found item / note** (loot a "torn map" in a site or chest).
   - **Region/location trigger** (entering an area surfaces a rumor).
3. **Concurrency.** Track + check multiple active chains at once (main + side). The engine
   currently assumes one `milestones` array — generalise to iterate all active chains.
4. **Quest log UI.** Show active main quest + side quests + step progress. (New modal /
   panel.)
5. **Rewards** per step + on completion (reuses milestone rewards).

How it ties together: a side quest's step can be a **site objective** (Part A), and
accepting the side quest **reveals** its site (Part B). So sub-quests + sites + visibility
are one connected system.

---

## Suggested phasing
- **P1 (small, no sub-quests yet):** Part A + Part B using the **main campaign** — let a
  main-campaign milestone target the cave/ruin, hidden until that milestone is active.
  Proves the full loop end-to-end with the systems we already have.
- **P2:** Sub-quest model + a single pickup mechanism (recommend NPC quest-giver) +
  quest-log UI.
- **P3:** Richer pickups (found notes in sites), multiple concurrent side quests, balancing.

## Decisions
- **D1 (resolved)** — **Quest-gated, but cleared sites stay.** A cave/ruin appears on the
  world map when a quest reveals it, and remains explorable afterward (revisit a cleared
  dungeon). So: hidden until its quest is active → revealed (sticky) → keeps its
  consumed/loot state.
- **Sequencing (resolved)** — **Jump to sub-quests (P2).** Build the side-quest system,
  then bind sites to it (a side quest reveals + sends you to a site).
- **D2 (resolved)** — **NPC quest-giver.** A townsperson/tavern NPC offers a rumour/task;
  accepting it activates the side quest. Towns already generate titled NPCs to hang quests
  on.
- **D3 (proposed)** — Parallel `settings.sideQuests` chains (each its own milestone-shaped
  array), not a merged list. Keeps the main campaign untouched and lets the engine iterate
  chains. (Recommended unless you prefer otherwise.)
