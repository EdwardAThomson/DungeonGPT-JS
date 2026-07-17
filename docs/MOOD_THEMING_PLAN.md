# Mood Theming Plan: Grimdark & Eldritch Map Visuals

Status: **Brainstorm / proposed** (2026-07-16). No code yet. Tracks
`OUTSTANDING_ISSUES.md` #80. Extends the themed-tileset work (#64, desert/snow) and the
ambient-effects idea in [GAME_FEEL_PLAN.md](GAME_FEEL_PLAN.md) (#78). Pure view layer,
mechanics untouched.

Goal: give the **grimdark-survival** and **eldritch-horror** campaigns a visual identity
on the map (darker tiles, signs of plague/decay, evil spirits / wrongness), the way
desert and snow campaigns already re-skin the world. Today those horror campaigns render
on the **default temperate tiles** despite carrying their own enemies, names, and tone.

---

## 1. The key distinction: biome vs mood

Two different "theme" concepts exist in the codebase, and this idea sits on the second:

- **Biome themes** (`entitlements.PREMIUM_THEMES = ['desert', 'snow']`): a *climate*.
  They swap the ground + building palette per biome in `townTileArt.js`
  (`THEME_MATERIALS`, `themeGroundFill`) and `worldTileArt.js` (biome palettes). Keyed off
  `settings.theme`.
- **Campaign-genre themes** (`questPickerData.THEME_DEFAULTS`): `heroic-fantasy`,
  `grimdark-survival`, `arcane-renaissance`, `eldritch-horror`. These carry tone dials,
  name pools, and quest enemies, but **no tile art**. They are *moods*, and they are
  currently **free** (all genre ids `isThemePremium === false`).

Grimdark/horror are moods, not climates: a grimdark campaign can be set in any biome. So
the right mechanism is **not** a new biome like snow. It is a **mood layer applied on top
of whatever biome is underneath** (desaturate/darken the existing palette + add decay /
spirit motifs), so it composes with temperate, desert, snow, forest, etc.

---

## 2. The hook that makes it retroactive & free (BC-safe)

Every save already carries `grimnessLevel` and `darknessLevel` (set by the genre and
editable on the tone chips). The horror genres pin them dark:

| genre | grimness | darkness |
|---|---|---|
| grimdark-survival 💀 | Grim | Dark |
| eldritch-horror 🐙 | Bleak | Dark |
| heroic-fantasy ⚔️ | Noble | Bright |
| arcane-renaissance 🔮 | Neutral | Grey |

A mood skin keyed off these existing fields (e.g. darkness `Dark`/grimness `Grim`/`Bleak`
→ apply the mood layer) **re-skins every existing grimdark/horror save with no data
migration**, exactly like map-compatibility rule 1 (art changes are retroactive and safe).
No new save field required. Alternative/looser hook: a dedicated `mood` field or the
genre id; decide during design (the dials are the cheapest, most retroactive option).

---

## 3. Two moods, two flavors (keep them distinct)

Not one "grimdark/horror" bucket. The two genres want different dressing:

- **Grimdark-survival (💀 decay & plague):** muted, desaturated, grimy palette; withered
  brown grass, bare/dead trees, ash and mud; motifs of gallows, plague pits, bone piles,
  ravens, guttering braziers, tattered banners. Blood-red accents. Reads as *the world is
  dying*.
- **Eldritch-horror (🐙 wrongness & spirits):** sickly green/violet tints, unnatural
  light; twisted/warped trees, faintly glowing runes, tentacle/eye motifs, drifting
  spectral wisps, miasma. Reads as *something is wrong with reality*.

Both share a darker base palette; the motifs and tint direction differ.

---

## 4. Two implementation levers

### A. Per-tile mood dressing (baked, like biomes — the #64 seam)
Extend the existing tile-art architecture: a mood modifier that (a) shifts the biome
palette darker/desaturated and (b) adds deterministic, seeded decorative motifs to
`worldTileArt.js` (world) and `townTileArt.js` (towns), the same way desert grains and
snow drifts are drawn. Memoized, deterministic per coordinate, unknown-mood → temperate
fallback (renderers already tolerate missing fields). Re-skins existing saves for free.

### B. Ambient overlay layer (new; the atmospheric lever — ties to #78)
There is **no overlay layer today** (all current effects are baked into per-tile SVG). A
map-level overlay over `WorldMapDisplay` / `TownMapDisplay` could add a darkening
vignette, drifting fog/miasma, and the occasional spectral wisp, and it can be *animated*
(this is where "evil spirits" really land). This is the bigger, more atmospheric win but
is new architecture, and it overlaps the ambient-effects bucket in #78. Respect
`prefers-reduced-motion`.

Recommended: start with A (cheap, retroactive, matches #64); treat B as the premium
atmospheric upgrade shared with #78's ambient work.

---

## 5. Gating (open decision)

Tension to resolve: desert/snow *biome* tilesets are Members+ (#64), but grimdark/eldritch
*genres* are currently **free**. Paywalling the visual mood of a free campaign genre may
feel bad. Proposed split (open):

- **Base per-tile mood dressing (A): free**, so a free grimdark campaign actually looks
  grimdark (parity of *identity*, not a locked upgrade).
- **Animated ambient overlay (B): Members+**, as the premium atmospheric flourish
  (consistent with music/particles being premium in #78).

Decide alongside #78's free/premium split.

---

## 6. Phasing

1. Palette-darkening + a first pass of grimdark motifs (dead trees, ravens, withered
   ground) in `worldTileArt.js`, keyed off the darkness/grimness dials. World map first.
2. Town-level grimdark dressing in `townTileArt.js` (grimy materials, banners, braziers),
   mirroring the #64 `THEME_MATERIALS` approach.
3. Eldritch-horror variant (sickly tints, warped trees, runes) as a second mood.
4. Ambient overlay layer (B): vignette + fog, then animated wisps (premium; with #78).
5. Preview/iterate on `/debug/world-map-art` and `/debug/tileset` before touching live
   displays (per the map-art workflow).

---

## 7. Open questions

- Hook: reuse `grimnessLevel`/`darknessLevel` (most retroactive) vs a dedicated `mood`
  field vs the genre id.
- How the mood layer composes with a biome (grimdark desert? grimdark snow?) — the
  palette shift must stack, not replace.
- Free vs premium split (§5).
- How far to push "wrongness" before it hurts readability of the map (tiles must still be
  parseable: water vs land vs POI).
- Does combat/encounter art get a mood pass too, or maps only (start: maps only).
