# Side-Quest Pool — expansion plan

A big pool to select from (the game picks a few that fit each map). Builds on the quest
system in src/game/questEngine.js + src/data/sideQuests.js.

## Authoring rules (so every quest stays completable)
- **Objective kinds:** `item` (find), `combat` (slay), `location` (reach), each optionally
  with `count` (gather/defeat N).
- **Site-bound** (cave/ruins) objectives are *injected* into the site, so a **specific**
  item/boss/room only works when site-bound. Overworld objectives must be **count-of-any**
  (`enemy: 'any'`) or **gather a catalog item** the player can actually loot.
- Every quest ends in a **turn-in** (return to giver building, or courier to another).
- Selection only offers a quest if its **giver building**, **site**, and **turn-in
  building** all exist on the map (isQuestEligible) — so prefer common givers (inn, tavern,
  shop, temple/shrine, alchemist, mill, market, blacksmith) for breadth; city-only givers
  (magetower, library, guild, bank, jail, harbormaster) give rarer, richer quests.
- Gather items should be ones that actually drop: `spider_silk`, `raw_gems`,
  `exposed_minerals`, `cave_mushrooms`, `glowing_fungi`, `poison_vial`, `rare_herb`,
  `healing_herbs`, `spirit_essence`, `pearl`, `salvaged_goods`.

Legend: 🟢 overworld (any map) · 🕳️ cave · 🏛️ ruins · ➜ turn-in target.

## Pool (≈28)

### Tavern / Inn — patrons & rumours
1. **The Lost Heirloom** 🕳️ item(silver_locket) ➜ inn. *(have)*
2. **Prove Your Mettle** 🟢 combat any×3 ➜ inn. *(have)*
3. **A Letter for the Magistrate** 🟢 courier ➜ townhall. *(have)*
4. **The Bard's Lost Lute** 🏛️ item(silver_lute) ➜ inn. *Mercy.*
5. **A Round of Tales** 🕳️ location(echo_hollow) ➜ inn — "see the singing cavern." *Whimsy.*

### Temple / Shrine — the faithful
6. **Menace in the Ruins** 🏛️ combat(wraith_lord boss) ➜ temple. *(have, regive to temple)*
7. **Consecrated Relic** 🏛️ item(holy_relic) ➜ temple. *Duty.*
8. **Tend the Sick** 🟢 gather(healing_herbs×3) ➜ temple. *Mercy.*
9. **Lay the Dead to Rest** 🏛️ location(burial_vault) ➜ shrine. *Solemn.*

### Library / Archives — scholars
10. **The Scholar's Relic** 🏛️ item(ancient_relic) ➜ library. *(have)*
11. **The Sealed Vault** 🏛️ location(sealed_vault) ➜ library. *(have)*
12. **The Lost Codex** 🕳️ item(lost_codex) ➜ archives. *Curiosity.*
13. **Field Samples** 🕳️ gather(raw_gems×3) ➜ library. *Research.*

### Mage tower — arcane (city)
14. **Arcane Reagents** 🟢 gather(spirit_essence×3) ➜ magetower.
15. **The Unstable Rift** 🏛️ combat(arcane_horror boss) ➜ magetower. *Danger.*

### Alchemist / Apothecary
16. **Reagents for the Apothecary** 🟢 gather(spider_silk×3) ➜ alchemist. *(have)*
17. **Antidote Ingredients** 🟢 gather(rare_herb×3) ➜ apothecary.
18. **The Cursed Patient** 🕳️ item(cure_root) ➜ apothecary. *Race against time.*

### Blacksmith
19. **Rare Ore** 🕳️ gather(exposed_minerals×3) ➜ blacksmith.
20. **The Stolen Blade** 🏛️ item(stolen_blade) ➜ blacksmith. *Pride.*

### Market / Shop — merchants
21. **Overdue Delivery** 🟢 courier ➜ inn (deliver goods). *Errand.*
22. **Refund in Blood** 🟢 combat any×3 ➜ shop (bandits robbed the caravan).

### Mill / Stables — rural
23. **The Missing Miners** 🕳️ location(deep_gallery) ➜ mill. *(have)*
24. **Vermin in the Stores** 🟢 combat any×3 ➜ mill.
25. **The Spooked Mare** 🕳️ location(cave_mouth) ➜ stables — track the bolted horse. *Gentle.*

### Town hall / Bank / Jail — civic (town/city)
26. **Clear the Roads** 🟢 combat any×5 ➜ townhall (bounty).
27. **The Stolen Ledger** 🏛️ item(stolen_ledger) ➜ bank.
28. **Catch the Cutpurse** 🕳️ combat(fugitive boss) ➜ jail.

### Harbormaster — coastal (when a port town exists)
29. **Lost Cargo** 🕳️ item(lost_cargo) ➜ harbormaster.

## Open choices
- **D-A — author all now, or curate first?** It's pure data (validated by tests + the
  eligibility check), so I can add the lot, or a chosen subset.
- **D-B — level tiers?** Add an optional `minLevel` per quest so early game offers easy
  ones (gather/courier) and tougher boss quests appear later. Small engine tweak
  (selection + the existing milestone level-gate).
- **D-C — multiple per giver?** A giver building could offer 1 of several quests (variety);
  selection already de-dups by pick, but we could weight by giver.
- **D-D — count of selected quests:** currently 2 per campaign. With a big pool, maybe 2–4,
  or scale to map size / number of towns.
