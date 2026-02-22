import { BASE_ENCOUNTERS } from './baseEncounters';
import { TOWN_ENCOUNTERS } from './townEncounters';
import { WILDERNESS_ENCOUNTERS } from './wildernessEncounters';
import { CAVE_ENCOUNTERS } from './caveEncounters';
import { RUINS_ENCOUNTERS } from './ruinsEncounters';
import { GROVE_ENCOUNTERS } from './groveEncounters';
import { MOUNTAIN_ENCOUNTERS } from './mountainEncounters';
import { ENVIRONMENTAL_ENCOUNTERS } from './environmentalEncounters';

export { DIFFICULTY_DC } from './difficultyDc';

export const encounterTemplates = {
  ...BASE_ENCOUNTERS,
  ...TOWN_ENCOUNTERS,
  ...WILDERNESS_ENCOUNTERS,
  ...CAVE_ENCOUNTERS,
  ...RUINS_ENCOUNTERS,
  ...GROVE_ENCOUNTERS,
  ...MOUNTAIN_ENCOUNTERS,
  ...ENVIRONMENTAL_ENCOUNTERS
};
