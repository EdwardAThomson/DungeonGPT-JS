// WorkspaceSpike: the #84 map-as-stage prototype (docs/MAP_LAYOUT_PLAN.md, phase 2).
// Opening /workspace-debug starts a FIXED new game through the real launch pipeline
// (seeded world, The Goblin Threat, one ready-made hero), then hands it to the real Game
// page in its 'workspace' layout at /workspace-debug/play. Nothing is scripted: movement,
// encounters, towns, objectives, narration and saving all run as in a normal game; only
// the starting choices are fixed so every run sees the same world.
// Debug-only (mounted when debug routes are enabled; never in production).

import { useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsContext from '../contexts/SettingsContext';
import { storyTemplates } from '../data/storyTemplates';
import { PREGEN_HEROES, buildPregenHero } from '../data/pregenHeroes';
import { initializeHP } from '../utils/healthSystem';
import { launchCampaign, specFromTemplate } from '../game/campaignLauncher';

export const SPIKE_TEMPLATE_ID = 'heroic-fantasy-t1';
export const SPIKE_SEED = 90210;

const WorkspaceSpike = () => {
  const { setSettings } = useContext(SettingsContext);
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const template = storyTemplates.find((t) => t.id === SPIKE_TEMPLATE_ID);
    const hero = initializeHP(buildPregenHero(PREGEN_HEROES[0]));
    const launch = launchCampaign(specFromTemplate(template), { seed: SPIKE_SEED });
    localStorage.setItem('activeGameSessionId', launch.gameSessionId);
    try {
      sessionStorage.setItem(`dgpt:launchSettings:${launch.gameSessionId}`, JSON.stringify(launch.settings));
    } catch (e) { /* storage may be unavailable; settings still ride the context */ }
    setSettings(launch.settings);
    navigate('/workspace-debug/play', {
      replace: true,
      state: {
        selectedHeroes: [hero],
        generatedMap: launch.mapData,
        worldSeed: launch.worldSeed,
        gameSessionId: launch.gameSessionId,
        townMapsCache: launch.townMapsCache,
      },
    });
  }, [navigate, setSettings]);

  return <p style={{ padding: '2rem', fontFamily: 'var(--font-ui)' }}>Starting the workspace prototype...</p>;
};

export default WorkspaceSpike;
