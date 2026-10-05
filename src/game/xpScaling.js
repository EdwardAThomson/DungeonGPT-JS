// xpScaling: campaign-tier XP multipliers (2026-10-05 balance pass).
//
// The level curve is steep (300 / 900 / 2700 / 6500 XP for levels 2-5) while rewards were
// flat, so a main-path-only player finished a tier-1 campaign at level 1 (~225 XP) and a
// tier-2 one at level 3, far below the next chapter's starting level. Two knobs, applied
// where XP is GRANTED (and wherever it is previewed) rather than by editing every
// campaign's numbers, so they also cover saves in progress and server-delivered content:
//
//   MILESTONE: main-campaign milestones and their boss fights.
//   WORLD:     random/site encounters and side quests, so exploring keeps paying later.
//
// Targets (tier 1): main path alone ~ level 2; main + side quests + exploring ~ level 3,
// the tier-2 start. (Tier 2): main alone ~ level 4; a thorough run ~ level 5.

export const MILESTONE_XP_MULTIPLIER = { 1: 2, 2: 3, 3: 3 };
export const WORLD_XP_MULTIPLIER = { 1: 1, 2: 1.5, 3: 2 };

/** Campaign tier from game settings (or a template); older saves without one are tier 1. */
export const campaignTier = (settingsOrTemplate) => {
  const t = Number(settingsOrTemplate?.tier) || 1;
  return Math.max(1, Math.min(3, Math.floor(t)));
};

const mult = (table, source) => table[campaignTier(source)] || 1;

export const scaleMilestoneXP = (xp, source) => Math.round((xp || 0) * mult(MILESTONE_XP_MULTIPLIER, source));
export const scaleWorldXP = (xp, source) => Math.round((xp || 0) * mult(WORLD_XP_MULTIPLIER, source));

const withXp = (rewards, xp) => (rewards ? { ...rewards, xp } : rewards);

export const scaleMilestoneRewards = (rewards, source) => withXp(rewards, scaleMilestoneXP(rewards?.xp, source));
export const scaleWorldRewards = (rewards, source) => withXp(rewards, scaleWorldXP(rewards?.xp, source));

/**
 * An encounter with its XP scaled for the campaign: a milestone boss uses the milestone
 * multiplier, anything else the world one. Marked so a re-opened encounter is never
 * scaled twice.
 */
export const scaleEncounterXP = (encounter, source) => {
  if (!encounter || encounter.xpScaled || !encounter.rewards) return encounter;
  const isMilestone = !!(encounter.isMilestoneBoss || encounter.milestoneId != null);
  const scale = isMilestone ? scaleMilestoneRewards : scaleWorldRewards;
  return { ...encounter, rewards: scale(encounter.rewards, source), xpScaled: true };
};
