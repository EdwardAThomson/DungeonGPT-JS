# Arc Cards & Overarching Narrative Plan (#73)

Status: **DRAFT design proposal, 2026-07-07. No code yet; design before code.**
Related: `OUTSTANDING_ISSUES.md` #73 (this), #72 (tiered New Game discovery, the state
this plan reshapes), #40 (server-delivered premium content channel, live),
`src/game/templateSections.js` (current section grouping), `src/game/campaignChain.js`
(in-save continuation: the arc already exists mechanically),
`docs/CAMPAIGN_MILESTONE_SYSTEM.md`, `docs/QUEST_CHAINING_PLAN.md`.

Terminology guard: this doc says **chapter** for a campaign's tier rung (t1/t2/t3) and
**account tier** for the entitlement ladder (free/member/premium/elite), because "tier"
alone is ambiguous across those two systems.

## 0. Decisions needed (maintainer calls)

1. **Arc card content** (your "all milestones or just the first?" question): approve
   option C in §3: chapter TITLES + level bands + one-line teases on the card, never
   milestones; the detail modal shows the milestone structure of only the chapter you
   would start. (Recommended: C.)
2. **Commitment model**: approve "the arc card is presentation, not a new save type":
   clicking an arc starts its first playable chapter as a normal New Game; later
   chapters continue in-save via the existing chain. (Recommended: yes, §4.)
3. **Later-chapter direct start**: keep the current Seasoned/Legendary sections'
   purpose (a Lv 4 roster starting a t2 fresh) by putting a chapter picker inside the
   arc detail modal, and REMOVE the Seasoned/Legendary sections. (Recommended: yes, §5.)
4. **comingSoon chapters on the ladder**: list them as greyed "coming soon" rows on the
   arc card (restores visibility the current Legendary section drops entirely).
   (Recommended: yes, §5.)
5. **Meta-narrative framing**: pick one of the three candidates in §7
   (A "The Stirring", B "The Age After the Sundering", C "The Last Tide").
   (Recommended: B as the spine, with A's sleeping power as the capstone's engine.)
6. **Capstone campaign**: confirm as FUTURE authoring in the private content repo
   (post-arc convergence, premium or elite, server-delivered). This plan only reserves
   the narrative slot; it does not write the story. (Recommended: confirm, tier call
   deferred until #6 billing exists.)

## 1. Problem

The Ready-Made tab now renders roughly 16-19 cards depending on account tier and
delivery state: 7 tier-1 starters (3 free + 4 premium), 7 tier-2 sequels, and the
tier-3 layer (The Shattered Throne when delivered, The Drowned Bells teaser), split
across five headed sections (free starters, Premium Adventures, Seasoned Parties,
premium sub-groups, Legendary Campaigns). Every new theme adds 2-3 more cards. The
maintainer's read (2026-07-07): the page is overwhelming, and the same story is being
sold three times. "Perhaps rather than individual tier campaigns, we have cards for
the whole campaign arc."

The catalog is already arc-shaped. Grouping the live `storyTemplates` array by `theme`
yields exactly **7 arcs**:

| Arc (theme id) | Chapters today | Entitlement span |
|---|---|---|
| Heroic Fantasy (`heroic-fantasy`) | Ch 1 The Goblin Threat, Ch 2 Crown of Sunfire, Ch 3 The Shattered Throne (server-delivered) | Ch 1-2 free, Ch 3 member |
| Grimdark Survival (`grimdark-survival`) | Ch 1 The Blighted Village, Ch 2 The Rot-Heart, Ch 3 The Last Winter (comingSoon) | free (Ch 3 gate TBD) |
| Arcane Renaissance (`arcane-renaissance`) | Ch 1 The Rogue Automaton, Ch 2 Herald of the Old Gods, Ch 3 The Clockwork God (comingSoon) | free (Ch 3 gate TBD) |
| Eldritch Horror (`eldritch-horror`) | Ch 1 The Blackwood Cult, Ch 2 The Great Dreamer, Ch 3 The Drowned City (comingSoon) | member (since 2026-07-06) |
| Desert Expedition (`desert-expedition`) | Ch 1 The Sunscorched Road, Ch 2 The Waking Sands | member |
| Frozen Frontier (`frozen-frontier`) | Ch 1 The Deepening Frost, Ch 2 The Hungering Thaw | member |
| Tidewater (`tidewater`) | Ch 1 The Backward Tide, Ch 2 The First Bell, Ch 3 The Drowned Bells (all server-delivered, shop-window stubs) | premium |

Two visibility bugs the current sections carry, which arc cards fix for free:

- The Legendary section excludes `comingSoon`, so grimdark/arcane/eldritch t3 render
  NOWHERE on New Game today; the player cannot see those arcs have a planned finale.
- The heroic-fantasy-t3 shop-window stub never registers for guests: the built-in
  `comingSoon` entry already claims the id, so `SHOP_WINDOW_STUBS`' guard skips it and
  guests cannot see The Shattered Throne exists (signed-in members get it by delivery).
  With arc ladders, the chapter row shows regardless of which entry holds the id.

## 2. Core stance

**The arc already EXISTS mechanically; arc cards only surface it on day one.**
`campaignChain.js` recommends the same theme's next chapter when a campaign completes
(`recommended: template.theme === genre && template.tier === currentTier + 1`) and
continues it INSIDE the same save (same world, same journal, `currentChapter` counter,
chapter-divider prologue via `prologueComposer.js`). This plan changes New Game
PRESENTATION only: no new save type, no engine change, no settings schema change, no
entitlement change. `canUseTemplate` stays the gate at chapter granularity;
`launchCampaign` stays the only way a campaign starts.

## 3. Arc card content (the milestones question)

Three options considered for what an arc card carries:

- **A. All chapters' milestones.** Rejected: 8-13 milestone rows per card, and
  milestones are structural spoilers (they literally name the final boss of every
  chapter: "Defeat the Shadow Overlord", "Slay the Dune Wyrm"). Reading chapter 3's
  milestone list before starting chapter 1 kills the reveal the chain prologue is
  built around.
- **B. First chapter's milestones only.** Rejected as the card face: better, but it
  under-sells the arc (the point of the card is "this is a three-chapter legend"), and
  four milestone rows still make a 7-card grid tall and samey.
- **C. Chapter titles + level bands + one-line teases (RECOMMENDED).** The card shows:
  arc name + icon + art, an authored one-line arc tagline (§6), and a chapter ladder:
  one row per chapter with its subtitle, level band, and lock/status chip. The
  existing per-template `description` strings are exactly one-line teases and serve as
  the ladder rows' hover/secondary text. No milestone ever appears on a card.

**The detail modal shows the CURRENT chapter's structure only**: opening an arc's
details shows the full milestone list, goal, tone tags, and rewards summary of the
chapter the player would start (default chapter 1; whichever chapter is selected in
the picker, §5). That is today's `renderTemplateModal` body unchanged, fed one
template. Later chapters stay teases until selected, and selecting a later chapter is
a deliberate act (the player has chosen to see chapter 2's structure, which is the
same information they would get today from the Seasoned section card).

This answers the maintainer's either/or with "neither on the card, first-selected in
the modal": milestones remain one click away exactly where they are today, without
letting 19 cards' worth of milestone rows onto the page.

## 4. Commitment model

**Recommendation: the arc card starts chapter 1; chapters continue in-save via the
existing chain; "committing to the arc" is narrative framing, not a data structure.**

- Clicking an arc card = `applyTemplate(chapter1Template)`, the same flow as today's
  t1 cards. Submit runs the unchanged `launchCampaign`.
- Finishing a chapter surfaces the existing continue-legend picker, whose same-theme
  `recommended` option IS the arc's next chapter, continued in the same world
  (geography-compatible by authoring). Nothing here changes; the arc card is the
  promise, the chain is the fulfillment.
- Multiple paths stay open exactly as now: the picker still offers other campaigns,
  and a player can always start a different arc as a new save. No lock-in is added.
- No `arcProgress` field, no cross-save arc tracking. The save already carries
  `completedCampaigns` + `currentChapter`; New Game does not read saves and should not
  start (the merged local/cloud saved-games list makes "which chapter are YOU on"
  ambiguous at the account level; a future "your legends" strip could revisit this,
  out of scope here).

## 5. Page layout

**7 arc cards, one grid, entitlement-grouped; Custom and Freeform tabs unchanged.**

- **Sections**: "Begin your legend" (free arcs: Heroic Fantasy, Grimdark Survival,
  Arcane Renaissance), "✨ Members' arcs" (Eldritch Horror, Desert Expedition, Frozen
  Frontier), "🔱 Premium arcs" (Tidewater). Same gold treatment the premium sections
  use today; grouping by ARC entry gate keeps the free grid to exactly three cards.
- **Card badge** = the arc's ENTRY gate (chapter 1's `canUseTemplate` requirement):
  free arcs carry no lock, member arcs the MEMBERS badge, tidewater the PREMIUM badge.
  Locked-arc cards keep the current locked-card treatment (dim + gold lock, click
  explains) since chapter 1 itself is locked.
- **Chapter ladder chips** carry the per-chapter truth when an arc SPANS account
  tiers. Heroic Fantasy for a free user reads: Ch 1 ✓ startable, Ch 2 startable,
  Ch 3 "🔒 Members". This is the deliberate upsell surface: one authored line renders
  under the ladder when the entry chapter is playable but a later chapter is gated,
  e.g. "Chapters 1-2 free; the finale comes with Membership." A member sees the same
  card with the line gone. comingSoon chapters render as greyed "coming soon" rows
  (decision 4); teaser stubs (entitled but delivery not landed this session) render
  with the existing "loads with your account content at sign-in" affordance at
  chapter granularity.
- **Server-delivered chapters and shop-window stubs need no special casing**: arcs
  are derived from the LIVE `storyTemplates` array every render (same rationale as
  the current `getTemplateSections` call), so a delivery that replaces a stub or a
  comingSoon entry updates its ladder row in place, and a delivered template with a
  brand-new theme forms a new derived arc card automatically. The shop-window model
  ("the bundle is everything you may SEE, the database is everything you may PLAY")
  is preserved untouched.
- **Seasoned Parties / Legendary Campaigns sections are ABSORBED** (decision 3).
  Their purpose (a returning player with a seasoned roster starting a t2/t3 fresh,
  #72) moves into the arc detail modal: a chapter picker (the ladder rows are
  selectable where startable) lets the player start chapter 2 or 3 directly as a
  fresh world, exactly what selecting a Seasoned card does today. The honest
  level-fit notes come along unchanged (`isOpeningAccessible`, `getLevelFitNotice`,
  the `higherTierNote` copy). Mid-arc saves are unaffected either way: continuation
  lives in the Journal's continue picker, not on New Game.
- **Custom and Freeform** stay as the other two tabs, untouched. The Ready-Made tab
  intro copy shifts from "starter tales / higher-tier campaigns further down" to
  "each card is a full campaign arc; chapters unlock as your legend grows".

Net card count on the Ready-Made tab: 19-ish becomes **7**, constant as chapters are
added (a new tidewater chapter is a ladder row, not a card).

## 6. Data model

**Derive everything derivable; author only what derivation cannot produce.**

New pure helper (suggest `src/game/storyArcs.js`, sibling of `templateSections.js`,
same testability rationale):

```
getStoryArcs(templates = storyTemplates) -> [{
  id,            // the theme id ('heroic-fantasy', ...)
  name,          // derived: shared template.name ('Heroic Fantasy')
  icon,          // derived: first chapter's icon
  entryTemplate, // derived: lowest-tier chapter (what the card click applies)
  chapters: [{ template, tier, subtitle, levelRange, description,
               locked (canUseTemplate), comingSoon, teaser }],
  minTierToEnter,   // derived: entry chapter's gate (card badge)
  spansTiers,       // derived: chapters disagree on gate (upsell line trigger)
}]
```

Derivation rules: group by `theme`, sort chapters by `tier`, tolerate gaps (desert has
no t3), tolerate single-chapter arcs, tolerate unknown future themes (derived fallback
card: name from the templates, tagline from the first chapter's `description`). All of
it is recomputed per render like today so runtime registration keeps working.

Authored-only metadata, one small map (`ARC_META`, keyed by theme, lives beside the
helper; entries optional with derived fallbacks):

- `tagline`: one arc-level line for the card face. The per-template `description`
  strings are per-chapter pitches; the arc needs one sentence that sells the whole
  ride ("From a goblin raid to the succession war for a shattered throne."). Seven
  short lines to write, and in phase 3 these become the meta-narrative's main carrier.
- `art` (optional): arc card art path; default falls back to the entry chapter's
  existing `/assets/templates/{id}.webp`, so phase 1 ships with zero new art and
  bespoke arc art is a later art-queue item.
- `mythosLine` (optional, phase 3): one framing sentence per arc tying it into the
  chosen world story (§7), consumed by prologue/intro composition and the detail
  modal, never by milestones.

No template schema change. No new persisted field anywhere.

## 7. The meta-narrative

Constraint: **retrofit via framing copy only.** No authored campaign is rewritten; no
milestone, boss, reward, or geography changes. The binding lives in arc taglines,
`mythosLine` strings, one deterministic framing line in `introComposer`/
`prologueComposer` output, and a naming convention for future authoring. Public-repo
copy stays spoiler-light about server-delivered content: nothing beyond what the
shop-window stubs already say.

Motif inventory already in the authored catalog (load-bearing candidates):

- **Bells and the wrong-way tide** (tidewater: The Backward Tide, The First Bell, The
  Drowned Bells, the bell_of_the_last_tide artifact).
- **A shattered old realm** (heroic: the Crown of Sunfire as "the old realm's symbol
  of unity", The Shattered Throne; grimdark: "the empire has fallen to the rot";
  desert: the Sun-Kings' records and their Sunken Spire).
- **Cults feeding something behind the veil** (eldritch: Blackwood Cult, the Great
  Dreamer, the Abyssal Breach; desert: the sandstorm cult "feeding [the storms] to
  something asleep beneath the sands").
- **A buried past coming back up** (snow: "the retreating ice is uncovering things the
  old winters buried", the Famine Barrow; desert: the wyrm under the dunes; eldritch:
  the Barrows, a drowned city risen from the sea; tidewater: Vespermere "built above
  its own drowned first quarter").
- **Progress waking the old powers** (arcane: "the old gods are not pleased with the
  noise of progress", Herald of the Old Gods, The Clockwork God).

Three candidate framings:

- **A. The Stirring (one sleeper, many symptoms).** Something vast has begun to turn
  over in its sleep beneath the world, and every arc's evil is a local symptom: the
  Dune Wyrm stirring under the sands, the Pale Hunger unsealed by the thaw, the Great
  Dreamer pressing at the veil, the Old Gods rattled awake by industry, the rot as its
  breath in the ground, the drowned bells tolling as it moves. Strongest fit with the
  authored villains (five arcs already ARE a sleeping-thing-wakes story); weakest link
  is heroic's political finale, patchable with one framing line (thrones crack when
  the world shifts). Capstone: descend to what is doing the waking.
- **B. The Age After the Sundering (shared history, not shared villain).
  RECOMMENDED.** One first realm (the Sun-Kings of the desert, the old empire rotting
  in the grimdark ruins, the realm the Crown of Sunfire once united, the drowned first
  city beneath Vespermere) fell in a single ancient calamity, the Sundering, and each
  arc confronts what that fall left buried in a different land. This is the
  lightest-touch retrofit: it asserts a shared PAST, so no villain needs a shared
  master and nothing authored is contradicted; every arc already digs up a buried
  legacy. It also gives future authoring a proper-noun toolkit (the Sundering, the
  First Realm, Sundered Age) without obligating any plot. Capstone: the cause of the
  Sundering is still down there, which lets candidate A's sleeper nest inside B as
  the capstone reveal rather than a claim every arc must carry.
- **C. The Last Tide (bell-ward eschatology).** An old order once bound the deep
  powers behind bell-wards; the wards are failing one by one, and each arc's evil is
  one failed ward. The tidewater arc becomes the keystone that names the system,
  answering the bell_of_the_last_tide artifact directly. Strong premium synergy (the
  premium arc explains the world) but that is also the risk: free arcs would lean on
  lore a free player cannot play, so free-facing copy would have to stay oblique, and
  it retrofits a mechanism (wards) rather than a history, which brushes closer to
  contradicting authored causes (the arcane Herald is angry at progress, not escaping
  a ward).

Recommendation: **B as the spine now (phase 3 copy), holding A's sleeper in reserve as
the capstone's engine.** Concretely: 7 taglines + 7 mythosLines written against the
Sundering framing, one shared line pattern in the intro/prologue composers ("in the
lands the Sundering left behind..."), and a private-repo naming note so future
chapters (and the capstone) use the same proper nouns.

**Capstone campaign (future, flagged only):** a post-arc convergence campaign,
premium or elite, authored in the private content repo and server-delivered like the
other flagships (#40 channel already supports per-template `minTier`). Narrative
payoff: the Sundering's cause, with completed-arc saves as its natural audience (the
chain picker's `completedCampaigns` record is already in the save; how much it gates
vs merely flavors is capstone-design scope). Nothing in this plan writes its story,
geography, or milestones; it only ensures the phase 3 copy leaves the door open.

## 8. Migration & compatibility

- **Zero save impact.** This is New Game presentation plus copy. Saves, the chain
  flow, `launchCampaign`, entitlements, and the worker are untouched in phases 1-2.
  Phase 3 touches composer output (new saves' intro text only; deterministic
  composers, existing conversations never rewritten).
- **Older bundles / cached sessions**: arcs derive at render time from whatever the
  live array holds, so a stale sessionStorage delivery cache or an old bundle simply
  renders the ladder it knows about. Unknown themes form derived fallback cards
  (never a crash); single-chapter arcs render a one-row ladder.
- **Tests**: `storyArcs.test.js` sibling of `templateSections.test.js` (grouping,
  gap tolerance, runtime-registered theme, lock derivation, spansTiers), plus
  updating the #72 section tests to the new layout. The e2e new-game smoke keeps
  passing because card click -> applyTemplate -> submit is unchanged.
- **Rollback**: `templateSections.js` is kept until the arc layout has soaked; the
  old sections are one import swap away.

## 9. Phasing & effort

| Phase | What | Size | Depends on |
|---|---|---|---|
| 1 | Derived arc grouping UI: `getStoryArcs()`, 7 arc cards + chapter ladder chips, detail modal chapter picker (absorbs Seasoned/Legendary + their honest level notes), derived taglines as fallback, tests | M | decisions 1-4 |
| 2 | Authored arc metadata: `ARC_META` taglines, spans-tiers upsell line copy, optional bespoke arc card art (art queue) | S | 1 |
| 3 | Meta-narrative retrofit: mythos naming note (public doc + private-repo note), 7 taglines/mythosLines rewritten against the chosen framing, one framing line in intro/prologue composers, spoiler-light audit | S | 2, decision 5 |
| 4 | Capstone campaign: private-repo authoring, server delivery, convergence surfacing in the continue picker | L (future, not scheduled) | 3, decision 6 |

Phase 1 is the smallest shippable and delivers the whole "7 cards instead of 19"
win by itself; phases 2-3 are copywriting-heavy and safe to trail.
