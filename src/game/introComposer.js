// introComposer.js
// Local, templated adventure intro for guest play (no AI). Built from the chosen
// story settings + party so a guest's adventure still opens with real flavour text
// instead of a blank screen or an AI call they can't make.

import { formatPartyInfo } from './promptComposer';

export const composeIntro = (settings = {}, selectedHeroes = [], currentTile = null) => {
  const party = formatPartyInfo(selectedHeroes) || 'Your party';
  const setting = (settings.shortDescription || '').trim();
  const place =
    currentTile?.poi === 'town' && currentTile?.townName
      ? `at the edge of ${currentTile.townName}`
      : `in the ${currentTile?.biome || 'wilds'}`;

  const milestones = Array.isArray(settings.milestones) ? settings.milestones : [];
  const firstStep = milestones.length
    ? (typeof milestones[0] === 'object' ? milestones[0].text : milestones[0])
    : null;

  const lines = [];
  if (setting) lines.push(setting);
  lines.push(`${party} stand ready ${place}, at the threshold of the journey ahead.`);
  if (settings.campaignGoal) lines.push(`**Goal:** ${settings.campaignGoal}`);
  if (firstStep) lines.push(`**First steps:** ${firstStep}`);
  lines.push(
    `*Explore the map, face what you find, and forge your path. Sign in any time to wake the AI Dungeon Master for full narration and free-form actions.*`
  );

  return lines.join('\n\n');
};
