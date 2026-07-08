// Pure builder for docs/CAMPAIGN_MILESTONES.md.
//
// Templates in -> markdown string out. No I/O, no Date/random, no imports that pull
// in React/DOM/network, so it is safe to (a) esbuild-bundle for the generator script
// (scripts/gen-campaign-milestones.mjs) and (b) import directly under Jest for the
// drift test (src/data/campaignMilestonesDoc.test.js). Keep it deterministic: given
// the same storyTemplates it must always emit byte-identical markdown.
//
// The tier-label logic mirrors src/game/entitlements.js (isTemplatePremium /
// canUseTemplate): a template with no premium signal is `free`; `premium: true` OR a
// premium world biome (settings.theme in PREMIUM_THEMES) gates at `member`; an explicit
// `minTier` wins over both. Reimplemented here (rather than imported) so this module
// stays free of entitlements' network-adjacent imports and the bundle stays pure.

import { storyTemplates } from './storyTemplates';

// Mirror of entitlements.PREMIUM_THEMES.
const PREMIUM_THEMES = ['desert', 'snow'];

const GENERATED_HEADER =
    '> Generated from `src/data/storyTemplates.js` by `scripts/gen-campaign-milestones.mjs`; ' +
    'do not edit by hand, run `npm run docs:campaigns` to regenerate.';

// ── Small derivations ──────────────────────────────────────────────────────────

/** Milestones of a template, or [] for card-face / comingSoon / teaser stubs. */
function milestonesOf(t) {
    return (t && t.settings && Array.isArray(t.settings.milestones)) ? t.settings.milestones : [];
}

/** A template is playable (documented in full) when it carries milestones. */
function isPlayable(t) {
    return milestonesOf(t).length > 0;
}

/** Is a world-biome theme id a paid unlock? Mirrors entitlements.isThemePremium. */
function isThemePremium(themeId) {
    return PREMIUM_THEMES.includes(themeId);
}

/**
 * Effective access tier for a template: the ladder rung a player needs to start it.
 * minTier wins; else premium flag / premium biome gates at 'member'; else 'free'.
 */
function accessTier(t) {
    if (t && t.minTier) return t.minTier;
    if (t && t.premium === true) return 'member';
    if (t && isThemePremium(t.settings && t.settings.theme)) return 'member';
    return 'free';
}

/** Genre-level access descriptor for the section heading. */
function genreAccessLabel(chapters) {
    const anyPremiumBiome = chapters.some((t) => isThemePremium(t.settings && t.settings.theme));
    const anyPremium = chapters.some((t) => t.premium === true || accessTier(t) !== 'free');
    if (anyPremiumBiome) return 'member / premium biome';
    if (anyPremium) return 'member / premium';
    return 'free';
}

/** World biome for a chapter: settings.theme, else the genre default. */
function biomeLabel(t) {
    const theme = t.settings && t.settings.theme;
    return theme ? theme : `default (${t.theme})`;
}

/** Town entries -> array of { name, size }. Entries may be plain strings or {name,size}. */
function townEntries(t) {
    const towns = (t.customNames && t.customNames.towns) || [];
    return towns.map((e) => (e && typeof e === 'object') ? { name: e.name, size: e.size } : { name: e, size: null });
}

/** Mountain range names for a chapter. */
function mountainNames(t) {
    return (t.customNames && t.customNames.mountains) || [];
}

/** "Willowdale, Briarwood" with size tags "Hearthmere (village)". */
function townsInline(t) {
    return townEntries(t).map((e) => (e.size ? `${e.name} (${e.size})` : e.name)).join(', ');
}

/** "Town, Town (+ Mountain)". */
function townsWithMountains(t) {
    const towns = townsInline(t);
    const mts = mountainNames(t);
    return mts.length ? `${towns} (+ ${mts.join(', ')})` : towns;
}

/** Set of lowercased town names (for same-world sequel detection). */
function townNameSet(t) {
    return new Set(townEntries(t).map((e) => String(e.name).toLowerCase()));
}

function sameTowns(a, b) {
    if (a.size !== b.size) return false;
    for (const n of a) if (!b.has(n)) return false;
    return true;
}

// ── Cell formatters ─────────────────────────────────────────────────────────────

function requiresCell(m) {
    const reqs = Array.isArray(m.requires) ? m.requires : [];
    return reqs.length ? reqs.join(', ') : '-';
}

function spawnCell(m) {
    const s = m.spawn;
    if (!s) return '-';
    if (s.type === 'item') return `item: ${s.name}`;
    if (s.type === 'poi') return `poi: ${s.name}`;
    if (s.type === 'npc') return s.role ? `npc: ${s.name} (${s.role})` : `npc: ${s.name}`;
    if (s.type === 'enemy') {
        const enc = m.encounter || {};
        const bits = [];
        if (enc.enemyHP != null) bits.push(`HP ${enc.enemyHP}`);
        if (enc.difficulty) bits.push(enc.difficulty);
        if (enc.dc != null) bits.push(`DC ${enc.dc}`);
        return bits.length ? `enemy: ${s.name} (${bits.join(', ')})` : `enemy: ${s.name}`;
    }
    return '-';
}

function buildingCell(m) {
    const b = m.building;
    if (!b || !(b.type || b.name || b.location)) return '-';
    const inner = [b.type, b.location].filter(Boolean).join(', ');
    return inner ? `${b.name} (${inner})` : (b.name || '-');
}

function rewardsText(r) {
    if (!r) return '-';
    const parts = [];
    if (r.xp != null) parts.push(`${r.xp} XP`);
    if (r.gold != null) parts.push(String(r.gold));
    const head = parts.join(' / ');
    const items = Array.isArray(r.items) ? r.items : [];
    return items.length ? `${head} / ${items.join(', ')}` : head;
}

function rewardsCell(m) {
    // Combat rows show the boss loot (the notable drop) leading, with the XP/gold in
    // parens; the flat completion XP is omitted, matching the doc's stated convention.
    if (m.type === 'combat' && m.encounter && m.encounter.rewards) {
        const r = m.encounter.rewards;
        const items = (Array.isArray(r.items) ? r.items : []).join(', ') || '(no drop)';
        const xpGold = [r.xp != null ? `${r.xp} XP` : null, r.gold != null ? String(r.gold) : null]
            .filter(Boolean).join(' / ');
        return xpGold ? `boss loot: ${items} (${xpGold})` : `boss loot: ${items}`;
    }
    return rewardsText(m.rewards);
}

/** Number of milestones co-active at the start (M1 plus any other with empty requires). */
function coActiveCount(milestones) {
    let count = 0;
    milestones.forEach((m, i) => {
        const reqs = Array.isArray(m.requires) ? m.requires : [];
        if (i === 0 || reqs.length === 0) count += 1;
    });
    return count;
}

/** "M1, M2" list of the co-active openers. */
function coActiveList(milestones) {
    const ids = [];
    milestones.forEach((m, i) => {
        const reqs = Array.isArray(m.requires) ? m.requires : [];
        if (i === 0 || reqs.length === 0) ids.push(`M${m.id}`);
    });
    return ids.join(', ');
}

// ── Section builders ────────────────────────────────────────────────────────────

function milestoneTable(milestones) {
    const lines = [
        '| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |',
        '|---|---|---|---|---|---|---|',
    ];
    for (const m of milestones) {
        lines.push(
            `| ${m.id} | ${m.type} | ${m.text} | ${requiresCell(m)} | ${spawnCell(m)} | ${buildingCell(m)} | ${rewardsCell(m)} |`
        );
    }
    return lines.join('\n');
}

function parallelismNote(milestones) {
    const openers = milestones.filter((m, i) => {
        const reqs = Array.isArray(m.requires) ? m.requires : [];
        return i === 0 || reqs.length === 0;
    });
    const openerPhrases = openers.map((m) => `M${m.id} (${m.type})`);
    let openerSentence;
    if (openerPhrases.length === 1) {
        openerSentence = `${openerPhrases[0]} opens immediately.`;
    } else if (openerPhrases.length === 2) {
        openerSentence = `${openerPhrases[0]} and ${openerPhrases[1]} open immediately.`;
    } else {
        const head = openerPhrases.slice(0, -1).join(', ');
        openerSentence = `${head}, and ${openerPhrases[openerPhrases.length - 1]} open immediately.`;
    }

    const openerIds = new Set(openers.map((m) => m.id));
    const chain = milestones
        .filter((m) => !openerIds.has(m.id))
        .map((m) => `M${m.id} requires [${(m.requires || []).join(', ')}]`)
        .join('; ');

    const n = openers.length;
    const summary = `${n} parallel opener${n === 1 ? '' : 's'}, then a chain.`;
    const chainSentence = chain ? `${chain}. ` : '';
    return `**Parallelism:** ${openerSentence} ${chainSentence}${summary}`;
}

function genreIntro(genre, chapters) {
    const access = genreAccessLabel(chapters);
    const first = chapters[0];
    const biome = first.settings && first.settings.theme;
    const biomeNote = biome ? `, world biome \`${biome}\`` : '';

    // Same-world vs fresh-world sequel: do all playable chapters share the town set?
    const sets = chapters.map((t) => townNameSet(t));
    const shared = sets.length > 1 && sets.slice(1).every((s) => sameTowns(sets[0], s));

    let geo;
    if (shared) {
        const townList = townsInline(first);
        const mts = mountainNames(first);
        geo = `Shared geography across all chapters: towns **${townList}**` +
            (mts.length ? `; mountains **${mts.join(', ')}**.` : '.') +
            ' The higher-tier chapters are same-world sequels (in-save continuation).';
    } else {
        const per = chapters.map((t) => `${t.id}: ${townsWithMountains(t)}`).join('; ');
        geo = `Chapters do not share geography (fresh-world sequels). ${per}.`;
    }

    return `Genre \`${genre}\`${biomeNote}. Access: ${access}. ${geo}`;
}

function chapterSection(t) {
    const milestones = milestonesOf(t);
    const header = [
        `### ${t.id}: "${t.subtitle}"`,
        '',
        `- Access: ${accessTier(t)} | Difficulty tier ${t.tier} | Levels ${t.levelRange[0]}-${t.levelRange[1]} | Biome: ${biomeLabel(t)}`,
        `- Towns: ${townsWithMountains(t)}`,
        '',
        milestoneTable(milestones),
        '',
        parallelismNote(milestones),
    ];
    return header.join('\n');
}

// ── Summary + teaser tables ─────────────────────────────────────────────────────

function summaryTable(playable) {
    const lines = [
        '| Campaign (id) | Access | Diff. tier | Level | Milestones | Co-active at start | Shape |',
        '|---|---|---|---|---|---|---|',
    ];
    for (const t of playable) {
        const ms = milestonesOf(t);
        const co = coActiveCount(ms);
        const list = coActiveList(ms);
        const shape = `${co} parallel then chain`;
        lines.push(
            `| ${t.id} | ${accessTier(t)} | ${t.tier} | ${t.levelRange[0]}-${t.levelRange[1]} | ` +
            `${ms.length} | ${co} (${list}) | ${shape} |`
        );
    }
    return lines.join('\n');
}

function outlierNote(playable) {
    const coCounts = playable.map((t) => coActiveCount(milestonesOf(t)));
    const msCounts = playable.map((t) => milestonesOf(t).length);

    // Modal co-active count.
    const freq = new Map();
    for (const c of coCounts) freq.set(c, (freq.get(c) || 0) + 1);
    let modeCo = coCounts[0];
    for (const [val, n] of freq) if (n > (freq.get(modeCo) || 0)) modeCo = val;

    const coOutliers = playable.filter((t) => coActiveCount(milestonesOf(t)) !== modeCo);

    const maxMs = Math.max(...msCounts);
    const minMs = Math.min(...msCounts);
    const longMs = playable.filter((t) => milestonesOf(t).length === maxMs);

    const parts = [];
    if (coOutliers.length === 0) {
        parts.push(
            `**Uniform openers:** every campaign opens with exactly **${modeCo}** co-active ` +
            `milestones (M1 plus ${modeCo - 1} more with \`requires: []\`).`
        );
    } else {
        const names = coOutliers.map((t) => `\`${t.id}\` (${coActiveCount(milestonesOf(t))})`).join(', ');
        parts.push(
            `**Odd ones out (co-active openers):** ${names} differ from the usual **${modeCo}**.`
        );
    }
    if (maxMs !== minMs && longMs.length) {
        const names = longMs.map((t) => `\`${t.id}\``).join(', ');
        parts.push(
            ` ${names} ${longMs.length === 1 ? 'is' : 'are'} the only campaign${longMs.length === 1 ? '' : 's'} ` +
            `with **${maxMs}** milestones (an extra gathering beat) rather than ${minMs}.`
        );
    }
    return parts.join('');
}

function teaserTable(templates) {
    const stubs = templates.filter((t) => !isPlayable(t) && (t.teaser === true || t.comingSoon === true));
    const lines = [
        '| id | Name / subtitle | Kind | Access (minTier) | Level |',
        '|---|---|---|---|---|',
    ];
    for (const t of stubs) {
        const kind = t.teaser === true ? 'teaser' : 'comingSoon';
        const name = `${t.name} - ${t.subtitle}`;
        const level = `${t.levelRange[0]}-${t.levelRange[1]}`;
        lines.push(`| ${t.id} | ${name} | ${kind} | ${accessTier(t)} | ${level} |`);
    }
    return lines.join('\n');
}

// ── Top-level builder ────────────────────────────────────────────────────────────

const INTRO = `This is a generated, at-a-glance overview of every campaign's milestone
structure, built from \`src/data/storyTemplates.js\` (the single source of truth). Its
purpose is to let the maintainer see each campaign's shape without reading the data file,
and in particular to evaluate **parallelism**: which milestones are co-active (open at the
same time) versus strictly sequenced.

Campaign content integrity (every referenced item/NPC/POI/building/reward actually wiring
up) is enforced separately by the content audit: run \`npm run audit\`, see
\`docs/CONTENT_AUDIT.md\`. This document is regenerated from the data, so it never drifts; a
Jest drift test (\`src/data/campaignMilestonesDoc.test.js\`) fails CI if the committed file
falls out of sync with the templates.

Notes on reading this doc:

- **Co-active at start** = the number of milestones whose \`requires\` is empty (\`[]\`).
  Milestone 1 always opens immediately; any *other* milestone with an empty \`requires\` is
  co-active with it from turn one. Higher counts mean more of the campaign is open in
  parallel rather than gated in a chain.
- **Access / tier label** reflects the access gate, not the difficulty tier (t1/t2):
  templates with no premium signal are **free**; \`premium: true\` (or a premium world
  biome, desert/snow) gates at **member**; an explicit \`minTier\` wins over both. The
  ladder is free < member < premium < elite (see \`src/game/entitlements.js\`).
- **Type** is one of item / combat / location / talk / narrative. item/combat/location/talk
  are engine-detected (mechanical); narrative is AI-judged via \`[COMPLETE_MILESTONE]\`.
- Combat rows show the boss \`encounter.rewards\` (the loot drop) in the Rewards column,
  since that is the notable item; the flat completion XP/gold is omitted there for brevity.`;

/**
 * Build the full CAMPAIGN_MILESTONES.md markdown from a storyTemplates array.
 * Pure and deterministic.
 * @param {Array<object>} templates
 * @returns {string} markdown (ends with a trailing newline)
 */
export function buildCampaignMilestonesMarkdown(templates) {
    const all = Array.isArray(templates) ? templates : [];
    const playable = all.filter(isPlayable);

    // Group playable chapters by genre (theme), preserving first-seen order.
    const genreOrder = [];
    const byGenre = new Map();
    for (const t of playable) {
        if (!byGenre.has(t.theme)) {
            byGenre.set(t.theme, []);
            genreOrder.push(t.theme);
        }
        byGenre.get(t.theme).push(t);
    }

    const out = [];
    out.push('# Campaign Milestones Overview');
    out.push('');
    out.push(GENERATED_HEADER);
    out.push('');
    out.push(INTRO);
    out.push('');
    out.push('## Summary: parallelism at a glance');
    out.push('');
    out.push(summaryTable(playable));
    out.push('');
    out.push(outlierNote(playable));
    out.push('');
    out.push('Teaser / coming-soon stubs (no milestones authored in the public bundle) are');
    out.push('listed at the end.');
    out.push('');
    out.push('---');

    for (const genre of genreOrder) {
        const chapters = byGenre.get(genre);
        const title = chapters[0].name;
        out.push('');
        out.push(`## ${title} (${genreAccessLabel(chapters)})`);
        out.push('');
        out.push(genreIntro(genre, chapters));
        for (const t of chapters) {
            out.push('');
            out.push(chapterSection(t));
        }
        out.push('');
        out.push('---');
    }

    out.push('');
    out.push('## Teaser / coming-soon stubs (no milestones)');
    out.push('');
    out.push('These templates ship as card faces only: the public bundle carries their id,');
    out.push('names, tier, level band, blurb and art, but **no `milestones`, `customNames`,');
    out.push('NPCs, or rewards**. Teaser stubs (`teaser: true`) receive their playable content');
    out.push('by server delivery at sign-in; `comingSoon` entries are placeholders with no');
    out.push('delivery yet. None are startable from the public data alone, so there is no');
    out.push('milestone structure to document here.');
    out.push('');
    out.push(teaserTable(all));
    out.push('');

    return out.join('\n');
}

/** Convenience: render the doc from the live storyTemplates array. */
export function renderCampaignMilestonesDoc() {
    return buildCampaignMilestonesMarkdown(storyTemplates);
}

export default buildCampaignMilestonesMarkdown;
