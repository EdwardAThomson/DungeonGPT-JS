# Dev Log

## 2026-06-19

A busy day centered on turning Henry's playtest feedback into concrete fixes, plus a security hardening pass on the local dev tooling. The feedback was first triaged into a list of outstanding issues, then several items were worked through. The headline fix addressed the "missing workshop on some maps" bug (#22): the world map was placing a random 2–4 towns with no awareness of how many *named* towns a campaign actually needs, so campaigns like Arcane Renaissance (which require Tinker-Row, Brasswick, Gear-End) could silently drop milestone towns and their quest buildings/items — leaving the quest uncompletable. Map generation now guarantees at least as many towns as the campaign's `customNames` list, relaxing town spacing on crowded maps rather than skipping required towns, and the spawner now warns loudly when a quest building targets a town that isn't on the map. Two smaller UX fixes from the same feedback: hero selection cards no longer stretch to fill a row when only a few heroes are present (grid track capped at 360px and centered), and the Arcane Renaissance setting text now points at the Tinker-Row workshop instead of misdirecting players to Cogsworth. Separately, the local-dev CLI task runner (`src/llm/runner`), which spawns agentic CLI tools, got a defense-in-depth hardening pass.

**Decisions & notes:** The runner was already safe from shell injection (`spawn` with `shell:false`), but several gaps were closed anyway: bind the dev server to 127.0.0.1 by default (LAN exposure now requires explicitly setting `HOST`), stop trusting a client-supplied `cwd` (always use `process.cwd()`), pass an env allowlist to children instead of the full `process.env`, add per-task timeouts and a max-concurrent cap, cap prompt length, and add a `--` terminator before the codex positional prompt. New tests cover the map-placement guarantee across seeds, the runner behavior, and request validation; the promptComposer milestone assertion was also updated to the current format.

## 2026-05-31

Added `ROADMAP.md` in the canonical ProjectShelf format to track planned work.
