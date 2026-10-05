// WorkspaceSpike: the #84 map-as-stage prototype (docs/MAP_LAYOUT_PLAN.md, phase 2).
// /workspace-debug shows a campaign picker; /workspace-debug?template=<id>&seed=<n>
// starts that campaign as a new game through the real launch pipeline (seeded world, one
// ready-made hero at the campaign's starting level), then hands it to the real Game page
// in its 'workspace' layout at /workspace-debug/play. Nothing is scripted: movement,
// encounters, towns, objectives, narration and saving all run as in a normal game; only
// the starting choices are fixed, so the same URL always gives the same world.
// Debug-only (mounted when debug routes are enabled; never in production).

import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SettingsContext from '../contexts/SettingsContext';
import { storyTemplates } from '../data/storyTemplates';
import { PREGEN_HEROES, buildPregenHero } from '../data/pregenHeroes';
import { initializeHP } from '../utils/healthSystem';
import { awardXP, XP_THRESHOLDS } from '../utils/progressionSystem';
import { launchCampaign, specFromTemplate } from '../game/campaignLauncher';
import { isTemplatePremium, PREMIUM_DEV_OVERRIDE_KEY } from '../game/entitlements';
import '../styles/redesign.css';

export const SPIKE_TEMPLATE_ID = 'heroic-fantasy-t1';
export const SPIKE_SEED = 90210;

// A ready-made hero at the campaign's starting level, so a tier-2/3 campaign is not
// tested with a level-1 party.
const buildSpikeHero = (template, heroIndex = 0) => {
  let hero = initializeHP(buildPregenHero(PREGEN_HEROES[heroIndex] || PREGEN_HEROES[0]));
  const level = template.levelRange?.[0] || 1;
  if (level > 1) {
    const { character } = awardXP({ ...hero, xp: 0, level: 1 }, XP_THRESHOLDS[level - 1] || 0);
    hero = { ...character, heroLevel: character.level };
  }
  return hero;
};

const readOverride = () => {
  try { return localStorage.getItem(PREMIUM_DEV_OVERRIDE_KEY) === 'true'; } catch (e) { return false; }
};

const Picker = ({ error }) => {
  const navigate = useNavigate();
  const [seed, setSeed] = useState(String(SPIKE_SEED));
  const [premium, setPremium] = useState(readOverride);
  const togglePremium = (on) => {
    setPremium(on);
    try {
      if (on) localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
      else localStorage.removeItem(PREMIUM_DEV_OVERRIDE_KEY);
    } catch (e) { /* storage blocked: premium campaigns stay locked */ }
  };
  // Playable built-in campaigns only: server-delivered premium ones are listed locally as
  // stubs without `settings` (their content loads per session), so they can't start here.
  // De-duplicated by id in case a template is registered twice.
  const templates = storyTemplates.filter((t, i, all) => t.settings && all.findIndex((o) => o.id === t.id) === i);
  const start = (id) => navigate(`/workspace-debug?template=${encodeURIComponent(id)}&seed=${encodeURIComponent(seed || SPIKE_SEED)}`);

  return (
    <div className="rd-page rd-app ws-picker">
      <section className="page-header app-header">
        <div className="wrap">
          <p className="eyebrow">Debug · #84 workspace</p>
          <h1>Pick a campaign</h1>
          <p className="lede">Starts a new game in the workspace layout with one ready-made hero at the campaign's starting level. The same campaign and seed always give the same world.</p>
          {error && <p className="ws-picker-error" role="alert">{error}</p>}
          <div className="ws-picker-controls">
            <label>World seed <input type="text" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} /></label>
            <button type="button" className="btn btn-ghost" onClick={() => setSeed(String(Math.floor(Math.random() * 1000000)))}>Random seed</button>
            <label className="ws-picker-check"><input type="checkbox" checked={premium} onChange={(e) => togglePremium(e.target.checked)} /> Dev premium override (unlocks premium campaigns and water towns)</label>
          </div>
        </div>
      </section>
      <section className="band">
        <div className="wrap">
          <ul className="ws-picker-list">
            {templates.map((t) => {
              const locked = isTemplatePremium(t) && !premium;
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => start(t.id)} disabled={locked} title={locked ? 'Turn on the dev premium override to start this one' : undefined}>
                    <span className="ws-picker-icon" aria-hidden="true">{t.icon || '📜'}</span>
                    <span className="ws-picker-name">{t.name}{t.subtitle ? `: ${t.subtitle}` : ''}</span>
                    <span className="ws-picker-meta">
                      Tier {t.tier || 1} · level {(t.levelRange || [1])[0]}{isTemplatePremium(t) ? ' · premium' : ''} · {t.id}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
};

const WorkspaceSpike = () => {
  const { setSettings } = useContext(SettingsContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const templateId = params.get('template');
  const seed = Number(params.get('seed')) || SPIKE_SEED;
  const startedRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!templateId || startedRef.current === location.search) return;
    startedRef.current = location.search;
    setError(null);
    const template = storyTemplates.find((t) => t.id === templateId);
    if (!template) { setError(`Unknown campaign "${templateId}".`); navigate('/workspace-debug', { replace: true }); return; }
    let launch;
    try {
      launch = launchCampaign(specFromTemplate(template), { seed });
    } catch (e) {
      setError(e.message || 'Could not start that campaign.');
      navigate('/workspace-debug', { replace: true });
      return;
    }
    const hero = buildSpikeHero(template);
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
  }, [templateId, seed, location.search, navigate, setSettings]);

  if (templateId && !error) {
    return <p style={{ padding: '2rem', fontFamily: 'var(--font-ui)' }}>Starting the workspace prototype...</p>;
  }
  return <Picker error={error} />;
};

export default WorkspaceSpike;
