import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeroContext from "../contexts/HeroContext";
import SettingsContext from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";
import { generateMapData, findStartingTown } from "../utils/mapGenerator";
import { generateTownMap } from "../utils/townMapGenerator";
import { populateTown } from "../utils/npcGenerator";
import WorldMapDisplay from "../components/WorldMapDisplay";
import { storyTemplates } from "../data/storyTemplates";
import { spawnWorldMapEntities, injectQuestBuildings } from "../game/milestoneSpawner";
import { getMilestoneLocationNames } from "../game/milestoneEngine";
import { llmService } from "../services/llmService";
import { createLogger } from "../utils/logger";
import { QUEST_ENEMIES, getEnemiesByTierAndTheme } from "../data/questEnemies";
import { QUEST_BUILDINGS, NPC_ROLES, SEARCHABLE_ITEMS, POI_TYPES, THEME_DEFAULTS, THEME_NAMES } from "../data/questPickerData";

const logger = createLogger('new-game');

// Merge milestone location names into customNames so the map generator places them
const mergeLocationNames = (customNames, milestones) => {
    const milestoneNames = getMilestoneLocationNames(milestones);
    const towns = [...(customNames?.towns || [])];
    const mountains = [...(customNames?.mountains || [])];

    for (const name of milestoneNames.towns) {
        if (!towns.some(t => t.toLowerCase() === name.toLowerCase())) towns.push(name);
    }
    for (const name of milestoneNames.mountains) {
        if (!mountains.some(m => m.toLowerCase() === name.toLowerCase())) mountains.push(name);
    }

    return { towns, mountains };
};

// Resolve milestone location names to map coordinates by matching town and mountain names
const resolveMilestoneCoords = (milestones, mapData) => {
  if (!milestones || !mapData) return milestones;

  // Build a lookup of named locations -> coordinates from the map
  const locationLookup = {};
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      const tile = mapData[y][x];
      if (tile.poi === 'town' && tile.townName) {
        locationLookup[tile.townName.toLowerCase()] = { x, y };
      }
      // For mountains, store the first tile found for each range name
      if (tile.poi === 'mountain' && tile.mountainName) {
        const key = tile.mountainName.toLowerCase();
        if (!locationLookup[key]) {
          locationLookup[key] = { x, y };
        }
      }
    }
  }

  return milestones
    .filter(m => m.text && m.text.trim())
    .map(m => {
      const resolved = { ...m };
      if (m.location) {
        const coords = locationLookup[m.location.toLowerCase()];
        if (coords) {
          resolved.mapX = coords.x;
          resolved.mapY = coords.y;
        }
      }
      return resolved;
    });
};

const NewGame = () => {

  // characters should be saved in Context
  const { heroes } = useContext(HeroContext);
  // Get settings, provider, and model state from context
  const { settings, setSettings, selectedProvider, selectedModel } = useContext(SettingsContext);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Clear any stale session ID when starting a new game
  useEffect(() => {
    localStorage.removeItem('activeGameSessionId');
  }, []);

  // Existing state
  const [shortDescription, setShortDescription] = useState(settings?.shortDescription || '');
  const [grimnessLevel, setGrimnessLevel] = useState(settings?.grimnessLevel || '');
  const [darknessLevel, setDarknessLevel] = useState(settings?.darknessLevel || '');

  // New state for additional settings
  const [magicLevel, setMagicLevel] = useState(settings?.magicLevel || 'Low Magic'); // Default example
  const [technologyLevel, setTechnologyLevel] = useState(settings?.technologyLevel || 'Medieval'); // Default example
  const [responseVerbosity, setResponseVerbosity] = useState(settings?.responseVerbosity || 'Moderate'); // Default example
  const [campaignGoal, setCampaignGoal] = useState(settings?.campaignGoal || '');
  const [milestones, setMilestones] = useState(() => {
    if (!settings?.milestones || settings.milestones.length === 0) return [];
    if (typeof settings.milestones[0] === 'object') return settings.milestones;
    return settings.milestones.map(text => ({ text, location: null }));
  });

  // State for validation error message
  const [formError, setFormError] = useState('');

  // State for generated map
  const [generatedMap, setGeneratedMap] = useState(null);
  const [worldSeed, setWorldSeed] = useState(settings?.worldSeed || null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customNames, setCustomNames] = useState({ towns: [], mountains: [] });

  // AI Generation state
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [rawAiResponse, setRawAiResponse] = useState('');
  const [showStoryDebug, setShowStoryDebug] = useState(false);



  // Possible options
  const grimnessOptions = ['Noble', 'Neutral', 'Bleak', 'Grim'];
  const darknessOptions = ['Bright', 'Neutral', 'Grey', 'Dark'];

  const magicOptions = ['No Magic', 'Low Magic', 'High Magic', 'Arcane Tech'];
  const technologyOptions = ['Ancient', 'Medieval', 'Renaissance', 'Industrial']; // Excluded 'Futuristic'
  const verbosityOptions = ['Concise', 'Moderate', 'Descriptive'];

  const { setIsSettingsModalOpen } = useContext(SettingsContext);

  const applyTemplate = (template) => {
    setSelectedTemplate(template.id);
    setShortDescription(template.settings.shortDescription);
    setGrimnessLevel(template.settings.grimnessLevel);
    setDarknessLevel(template.settings.darknessLevel);
    setMagicLevel(template.settings.magicLevel);
    setTechnologyLevel(template.settings.technologyLevel);
    setResponseVerbosity(template.settings.responseVerbosity);
    setCampaignGoal(template.settings.campaignGoal || '');
    setMilestones(template.settings.milestones || []);
    setCustomNames(template.customNames || { towns: [], mountains: [] });
  };

  const handleAiGenerateStory = async () => {
    setIsAiGenerating(true);
    setAiError('');
    setSelectedTemplate('ai');

    const prompt = `You are a world-class RPG campaign designer. Create a unique, compelling story preset for a tabletop-style RPG.
    Provide the output in STRICT JSON format with the following keys:
    - shortDescription: A 2-sentence overview of the world and the conflict.
    - campaignGoal: The ultimate objective of the campaign (1 sentence).
    - milestones: An array of 3 objects, each with "text" (the objective) and "location" (one of the town or mountain names where it takes place, or null if it's an unknown location).
    - grimnessLevel: Choose one [Noble, Neutral, Bleak, Grim].
    - darknessLevel: Choose one [Bright, Neutral, Grey, Dark].
    - magicLevel: Choose one [No Magic, Low Magic, High Magic, Arcane Tech].
    - technologyLevel: Choose one [Ancient, Medieval, Renaissance, Industrial].
    - responseVerbosity: Choose one [Concise, Moderate, Descriptive].
    - customNames: An object with two arrays: "towns" (4 thematic town names, first should be the capital) and "mountains" (1 thematic mountain range name).

    Make it creative and atmospheric. Do not include any text other than the JSON object.`;

    try {
      const response = await llmService.generateUnified({
        provider: selectedProvider,
        model: selectedModel,
        prompt: prompt,
        maxTokens: 1000,
        temperature: 0.9
      });

      setRawAiResponse(response);

      // Improved JSON extraction and sanitization
      const extractAndParseJson = (str) => {
        // 1. Find the actual JSON object bounds
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("AI failed to provide a valid JSON object.");

        let json = str.substring(start, end + 1);

        // 2. Sanitize literal control characters (like newlines) inside strings
        // JSON.parse fails on literal newlines in strings, but LLMs often include them.
        let sanitized = '';
        let inString = false;
        let escaped = false;
        for (let i = 0; i < json.length; i++) {
          const char = json[i];
          if (char === '"' && !escaped) inString = !inString;

          if (inString && (char === '\n' || char === '\r')) {
            sanitized += '\\n';
          } else {
            sanitized += char;
          }
          escaped = (char === '\\' && !escaped);
        }

        return JSON.parse(sanitized);
      };

      const data = extractAndParseJson(response);

      // Apply the generated data
      setShortDescription(data.shortDescription || '');
      setCampaignGoal(data.campaignGoal || '');
      setMilestones((data.milestones || []).map(m => {
        if (typeof m === 'object' && m.text) return { text: m.text, location: m.location || null };
        return { text: String(m), location: null };
      }));
      setGrimnessLevel(data.grimnessLevel || 'Neutral');
      setDarknessLevel(data.darknessLevel || 'Neutral');
      setMagicLevel(data.magicLevel || 'Low Magic');
      setTechnologyLevel(data.technologyLevel || 'Medieval');
      setResponseVerbosity(data.responseVerbosity || 'Moderate');
      // Normalize customNames: support both structured object and legacy flat array
      const rawNames = data.customNames || [];
      if (Array.isArray(rawNames)) {
        setCustomNames({ towns: rawNames, mountains: [] });
      } else {
        setCustomNames({ towns: rawNames.towns || [], mountains: rawNames.mountains || [] });
      }

    } catch (error) {
      logger.error("AI Story Generation failed:", error);
      setAiError(error.message);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSubmit = () => {
    // Custom tab: validate slots and auto-generate description if needed
    if (activeTab === 'custom') {
      const slotError = validateCustomSlots();
      if (slotError) {
        setFormError(slotError);
        return;
      }

      // Auto-generate shortDescription from slot selections if empty
      if (!shortDescription.trim()) {
        const themeName = THEME_DEFAULTS[customTheme]?.name || 'Fantasy';
        const parts = [];
        if (slot1Item) {
          const item = SEARCHABLE_ITEMS.find(i => i.id === slot1Item);
          if (item) parts.push(`seek the ${item.name}`);
        }
        if (slot4Enemy) {
          const enemy = QUEST_ENEMIES[slot4Enemy];
          if (enemy) parts.push(`defeat ${enemy.name}`);
        }
        const desc = parts.length > 0
          ? `A ${themeName.toLowerCase()} adventure where heroes ${parts.join(' and ')}.`
          : `A custom ${themeName.toLowerCase()} adventure.`;
        setShortDescription(desc);
      }
    }

    // Shared validation
    if (!shortDescription.trim() && activeTab !== 'custom') {
      setFormError('Please enter a story description.');
      return;
    }
    if (!grimnessLevel) {
      setFormError('Please select a Grimness level.');
      return;
    }
    if (!darknessLevel) {
      setFormError('Please select a Darkness level.');
      return;
    }
    if (!generatedMap) {
      setFormError('Please generate a world map before proceeding.');
      return;
    }

    setFormError('');

    const templateName = selectedTemplate === 'ai' ? 'AI Generated World' :
      selectedTemplate === 'custom' || !selectedTemplate ? 'Custom Tale' :
        storyTemplates.find(t => t.id === selectedTemplate)?.name || 'Unknown Template';

    // Derive campaignGoal from the final milestone if not explicitly set
    const derivedGoal = campaignGoal || (milestones.length > 0
      ? milestones[milestones.length - 1].text
      : '');

    // For custom tab, use the auto-generated description if it was just set
    const finalDescription = shortDescription.trim() ||
      `A custom ${(THEME_DEFAULTS[customTheme]?.name || 'fantasy').toLowerCase()} adventure.`;

    // Spawn milestone entities onto the world map before resolving coords
    const spawnResult = spawnWorldMapEntities(generatedMap, milestones);

    // Pre-generate all town maps so saves are never affected by generator changes
    const townMapsCache = {};
    for (let y = 0; y < generatedMap.length; y++) {
      for (let x = 0; x < generatedMap[y].length; x++) {
        const tile = generatedMap[y][x];
        if (tile.poi === 'town' && tile.townName) {
          const townSize = tile.townSize || tile.poiType || 'village';
          const seed = parseInt(worldSeed) + (x * 1000) + (y * 10000);
          const townMapData = generateTownMap(townSize, tile.townName, 'south', seed, tile.hasRiver, tile.riverDirection);

          // Inject quest buildings if needed
          if (spawnResult.requiredBuildings?.[tile.townName]) {
            injectQuestBuildings(townMapData, spawnResult.requiredBuildings[tile.townName]);
          }

          // Populate town with NPCs
          const npcs = populateTown(townMapData, seed);
          townMapData.npcs = npcs;

          townMapsCache[tile.townName] = townMapData;
          logger.debug(`Pre-generated town map: ${tile.townName} (${townSize})`);
        }
      }
    }

    // Resolve tier and level range from template or custom settings
    const templateData = selectedTemplate && selectedTemplate !== 'custom' && selectedTemplate !== 'ai'
      ? storyTemplates.find(t => t.id === selectedTemplate)
      : null;
    const campaignTier = templateData?.tier || customTier || 1;
    const campaignLevelRange = templateData?.levelRange || (campaignTier === 1 ? [1, 2] : [3, 5]);

    const settingsData = {
      shortDescription: finalDescription,
      grimnessLevel,
      darknessLevel,
      magicLevel,
      technologyLevel,
      responseVerbosity,
      campaignGoal: derivedGoal,
      milestones: resolveMilestoneCoords(milestones, generatedMap),
      worldSeed,
      templateName,
      tier: campaignTier,
      levelRange: campaignLevelRange,
      requiredBuildings: spawnResult.requiredBuildings,
      enemySpawns: spawnResult.enemySpawns,
      itemSpawns: spawnResult.itemSpawns
    };

    // Generate a fresh game session ID for this new game
    const gameSessionId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('activeGameSessionId', gameSessionId);

    setSettings(settingsData);
    navigate('/hero-selection', { state: { heroes, generatedMap, worldSeed, gameSessionId, townMapsCache } });
  };

  // Tab state
  const [activeTab, setActiveTab] = useState('templates');

  // Template detail modal
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Party max level for level warnings on templates
  const partyMaxLevel = heroes.length > 0
    ? Math.max(...heroes.map(h => h.heroLevel || 1))
    : 0;

  const milestoneTypeIcon = {
    item: '📦',
    combat: '⚔️',
    location: '📍',
    narrative: '💬',
  };

  const tierColors = { 1: '#4caf50', 2: '#ff9800', 3: '#f44336' };

  const tierBadge = (tier, levelRange) => (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '10px',
      fontSize: '0.7rem',
      fontWeight: 'bold',
      color: '#fff',
      background: tierColors[tier] || '#888',
    }}>
      Tier {tier} (Lv {levelRange[0]}-{levelRange[1]})
    </span>
  );

  const renderTemplateModal = () => {
    if (!previewTemplate) return null;
    const t = previewTemplate;
    const ms = t.settings.milestones || [];
    const isSelected = selectedTemplate === t.id;

    return (
      <div className="modal-overlay" onClick={() => setPreviewTemplate(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
          maxWidth: '600px', width: '90%', maxHeight: '85vh', padding: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', borderRadius: '12px',
        }}>
          {/* Header image */}
          <div style={{
            height: '180px',
            background: `url(/assets/templates/${t.id}.webp) center/cover no-repeat, linear-gradient(135deg, var(--surface), var(--bg))`,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
              padding: '40px 20px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>
                    {t.icon} {t.name}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#fff', fontFamily: 'var(--header-font)' }}>
                    {t.subtitle}
                  </div>
                </div>
                {tierBadge(t.tier, t.levelRange)}
              </div>
            </div>
            <button
              onClick={() => setPreviewTemplate(null)}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                fontSize: '0.85rem', lineHeight: 1, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >x</button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5 }}>
              {t.settings.shortDescription}
            </p>

            <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 700 }}>Campaign Goal</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontStyle: 'italic' }}>{t.settings.campaignGoal}</div>
            </div>

            {/* Milestones */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 700 }}>
                Quest Milestones ({ms.length})
              </div>
              {ms.map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px',
                  padding: '8px 10px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{milestoneTypeIcon[m.type] || '?'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{m.text}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {m.type}{m.location ? ` \u2022 ${m.location}` : ''}
                      {m.requires?.length > 0 ? ` \u2022 needs #${m.requires.join(', #')}` : ''}
                      {m.rewards ? ` \u2022 ${m.rewards.xp} XP, ${m.rewards.gold} gold` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total rewards summary */}
            {ms.length > 0 && (() => {
              let totalXp = 0;
              for (const m of ms) {
                if (m.rewards?.xp) totalXp += m.rewards.xp;
                if (m.encounter?.rewards?.xp) totalXp += m.encounter.rewards.xp;
              }
              return totalXp > 0 ? (
                <div style={{
                  fontSize: '0.75rem', color: 'var(--text-secondary)',
                  marginBottom: '16px', padding: '6px 10px',
                  background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)',
                  display: 'flex', gap: '12px',
                }}>
                  <span><strong>Total XP:</strong> {totalXp}</span>
                  <span><strong>Milestones:</strong> {ms.length}</span>
                  <span><strong>Boss fights:</strong> {ms.filter(m => m.type === 'combat').length}</span>
                </div>
              ) : null;
            })()}

            {/* Tone Tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {[
                { label: 'Grimness', value: t.settings.grimnessLevel },
                { label: 'Darkness', value: t.settings.darknessLevel },
                { label: 'Magic', value: t.settings.magicLevel },
                { label: 'Technology', value: t.settings.technologyLevel },
                { label: 'Narration', value: t.settings.responseVerbosity },
              ].map((tag, i) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem',
                  background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                }}>
                  <strong>{tag.label}:</strong> {tag.value}
                </span>
              ))}
            </div>
          </div>

          {/* Level warning */}
          {partyMaxLevel > 0 && t.levelRange && partyMaxLevel < t.levelRange[0] && (
            <div style={{
              margin: '0 20px 0', padding: '10px 14px',
              background: 'rgba(255, 152, 0, 0.15)', border: '1px solid #ff9800',
              borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text)',
            }}>
              <strong style={{ color: '#ff9800' }}>Level Warning:</strong> Your highest hero is level {partyMaxLevel}, but this adventure requires level {t.levelRange[0]}+.
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: '14px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: '10px',
          }}>
            <button
              onClick={() => setPreviewTemplate(null)}
              style={{
                padding: '8px 20px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text)', cursor: 'pointer', fontSize: '0.9rem',
              }}
            >{isSelected ? 'Back' : 'Cancel'}</button>
            {isSelected ? (
              <button
                onClick={() => {
                  setPreviewTemplate(null);
                  if (generatedMap) {
                    // Map already exists — submit directly
                    setTimeout(() => handleSubmit(), 100);
                  } else {
                    // Scroll to map section so user can generate first
                    setTimeout(() => {
                      document.querySelector('.map-generation-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }
                }}
                style={{
                  padding: '8px 24px',
                  background: 'var(--primary)',
                  border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 'bold',
                }}
              >
                {generatedMap ? 'Continue to Hero Selection' : 'Generate World Map'}
              </button>
            ) : (
              <button
                onClick={() => {
                  applyTemplate(t);
                  setPreviewTemplate(null);
                }}
                style={{
                  padding: '8px 24px',
                  background: 'var(--primary)',
                  border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 'bold',
                }}
              >
                Select Adventure
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Group templates by theme for section display
  const templatesByTheme = storyTemplates.reduce((acc, t) => {
    if (!acc[t.theme]) acc[t.theme] = [];
    acc[t.theme].push(t);
    return acc;
  }, {});

  const renderTemplateCard = (template) => {
    const isSelected = selectedTemplate === template.id;
    const isLocked = template.comingSoon;
    return (
      <div
        key={template.id}
        onClick={isLocked ? undefined : () => applyTemplate(template)}
        style={{
          background: 'var(--surface)',
          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          cursor: isLocked ? 'default' : 'pointer',
          transition: 'all 0.2s',
          boxShadow: isSelected ? '0 0 0 1px var(--primary), 0 4px 12px var(--shadow)' : 'none',
          opacity: isLocked ? 0.5 : 1,
          filter: isLocked ? 'grayscale(0.6)' : 'none',
        }}
      >
        {/* Card image */}
        <div style={{
          height: '120px',
          background: `url(/assets/templates/${template.id}.webp) center/cover no-repeat, linear-gradient(135deg, var(--surface), var(--bg))`,
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            {tierBadge(template.tier, template.levelRange)}
          </div>
          {isSelected && (
            <div style={{
              position: 'absolute', top: 8, left: 8,
              background: 'var(--primary)', color: '#fff',
              padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold',
            }}>SELECTED</div>
          )}
          {isLocked && (
            <div style={{
              position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
              fontSize: '0.7rem', fontWeight: 'bold', color: '#fff',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>COMING SOON</div>
          )}
        </div>
        {/* Card text */}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', fontFamily: 'var(--header-font)', color: 'var(--text)' }}>
              {template.subtitle}
            </div>
            {!isLocked && (
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template); }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '0.7rem', padding: '2px 0', whiteSpace: 'nowrap',
                  textDecoration: 'underline', flexShrink: 0,
                }}
              >details</button>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
            {template.description}
          </div>
          {!isLocked && partyMaxLevel > 0 && template.levelRange && partyMaxLevel < template.levelRange[0] && (
            <div style={{ fontSize: '0.7rem', color: '#ff9800', marginTop: '6px', fontWeight: 600 }}>
              ⚠ Requires Lv {template.levelRange[0]}+ (your highest: Lv {partyMaxLevel})
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTemplateTab = () => (
    <div className="form-section story-settings-section">
      <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Pick a pre-built adventure. Click a card for details.
      </p>

      {Object.entries(templatesByTheme).map(([theme, templates]) => (
        <div key={theme} style={{ marginBottom: '28px' }}>
          <h3 style={{
            margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text)',
            fontFamily: 'var(--header-font)',
            paddingBottom: '8px', borderBottom: '1px solid var(--border)',
          }}>
            {templates[0].icon} {templates[0].name}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
            {templates.map(renderTemplateCard)}
          </div>
        </div>
      ))}
    </div>
  );

  // Shared tone settings grid used by both Custom and Freeform tabs
  const renderToneSettings = () => (
    <div className="settings-grid">
      <div className="settings-group">
        <label htmlFor="grimness">Grimness</label>
        <select id="grimness" value={grimnessLevel} onChange={(e) => setGrimnessLevel(e.target.value)} className="settings-select">
          <option value="">Select...</option>
          {grimnessOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="darkness">Darkness</label>
        <select id="darkness" value={darknessLevel} onChange={(e) => setDarknessLevel(e.target.value)} className="settings-select">
          <option value="">Select...</option>
          {darknessOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="magic">Magic Level</label>
        <select id="magic" value={magicLevel} onChange={(e) => setMagicLevel(e.target.value)} className="settings-select">
          {magicOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="tech">Technology</label>
        <select id="tech" value={technologyLevel} onChange={(e) => setTechnologyLevel(e.target.value)} className="settings-select">
          {technologyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="verbosity">Narrative Style</label>
        <select id="verbosity" value={responseVerbosity} onChange={(e) => setResponseVerbosity(e.target.value)} className="settings-select">
          {verbosityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    </div>
  );

  // State for custom configurator
  const [customTheme, setCustomTheme] = useState('heroic-fantasy');
  const [customTier, setCustomTier] = useState(1);

  // Slot state: what the player picks for each of the 4 milestone slots
  const [slot1Item, setSlot1Item] = useState('');
  const [slot1Building, setSlot1Building] = useState('');
  const [slot1Town, setSlot1Town] = useState('');
  const [slot2Role, setSlot2Role] = useState('');
  const [slot2Building, setSlot2Building] = useState('');
  const [slot2Town, setSlot2Town] = useState('');
  const [slot3Poi, setSlot3Poi] = useState('');
  const [slot3Mountain, setSlot3Mountain] = useState('');
  const [slot4Enemy, setSlot4Enemy] = useState('');

  // Build milestones from slot selections
  const buildMilestonesFromSlots = () => {
    const town1 = slot1Town || 'Town A';
    const town2 = slot2Town || 'Town B';
    const wildLoc = slot3Mountain || 'The Wilds';

    const itemData = SEARCHABLE_ITEMS.find(i => i.id === slot1Item);
    const buildingData = QUEST_BUILDINGS.find(b => b.id === slot1Building);
    const roleData = NPC_ROLES.find(r => r.id === slot2Role);
    const building2Data = QUEST_BUILDINGS.find(b => b.id === slot2Building);
    const poiData = POI_TYPES.find(p => p.id === slot3Poi);
    const enemyData = slot4Enemy ? QUEST_ENEMIES[slot4Enemy] : null;

    const builtMilestones = [];

    if (itemData && buildingData) {
      builtMilestones.push({
        id: 1,
        text: `Find the ${itemData.name} in the ${buildingData.name.toLowerCase()} at ${town1}`,
        location: town1,
        type: 'item',
        requires: [],
        trigger: { item: slot1Item, action: 'acquire' },
        spawn: { type: 'item', id: slot1Item, name: itemData.name, location: town1 },
        building: { type: slot1Building, name: buildingData.name, location: town1 },
        rewards: { xp: customTier === 1 ? 25 : 100, gold: customTier === 1 ? '1d6' : '2d10', items: [] },
        minLevel: null,
      });
    }

    if (roleData && building2Data) {
      builtMilestones.push({
        id: 2,
        text: `Speak with the ${roleData.name.toLowerCase()} at ${town2}`,
        location: town2,
        type: 'narrative',
        requires: [],
        trigger: null,
        spawn: { type: 'npc', id: `quest_npc_${slot2Role.toLowerCase()}`, name: roleData.name, location: town2, role: slot2Role },
        building: { type: slot2Building, name: building2Data.name, location: town2 },
        rewards: { xp: customTier === 1 ? 25 : 150, gold: customTier === 1 ? '1d6' : '1d20', items: [] },
        minLevel: null,
      });
    }

    if (poiData) {
      builtMilestones.push({
        id: 3,
        text: `Reach the ${poiData.name} in the ${wildLoc}`,
        location: wildLoc,
        type: 'location',
        requires: builtMilestones.length >= 2 ? [1, 2] : builtMilestones.length === 1 ? [1] : [],
        trigger: { location: `quest_poi_${slot3Poi}`, action: 'visit' },
        spawn: { type: 'poi', id: `quest_poi_${slot3Poi}`, name: poiData.name, location: wildLoc },
        building: null,
        rewards: { xp: customTier === 1 ? 50 : 200, gold: customTier === 1 ? '1d10' : '3d20', items: [] },
        minLevel: customTier === 1 ? null : customTier + 1,
      });
    }

    if (enemyData) {
      builtMilestones.push({
        id: 4,
        text: `Defeat ${enemyData.name}`,
        location: wildLoc,
        type: 'combat',
        requires: builtMilestones.length >= 3 ? [3] : [],
        trigger: { enemy: slot4Enemy, action: 'defeat' },
        spawn: { type: 'enemy', id: slot4Enemy, name: enemyData.name, location: wildLoc },
        building: null,
        encounter: { ...enemyData },
        rewards: { xp: customTier === 1 ? 50 : 300, gold: customTier === 1 ? '1d10' : '3d20', items: [] },
        minLevel: customTier === 1 ? 2 : customTier + 2,
      });
    }

    return builtMilestones;
  };

  // Apply theme defaults when theme changes
  const applyThemeDefaults = (theme) => {
    const defaults = THEME_DEFAULTS[theme];
    if (defaults) {
      setGrimnessLevel(defaults.grimnessLevel);
      setDarknessLevel(defaults.darknessLevel);
      setMagicLevel(defaults.magicLevel);
      setTechnologyLevel(defaults.technologyLevel);
      setResponseVerbosity(defaults.responseVerbosity);
    }
  };

  // Validate Custom tab slots — returns error string or null if valid
  const validateCustomSlots = () => {
    const slotErrors = [];

    // Slot 1: Item Search — needs item + building + town
    const s1HasAny = slot1Item || slot1Building || slot1Town;
    const s1Complete = slot1Item && slot1Building && slot1Town;
    if (s1HasAny && !s1Complete) {
      const missing = [];
      if (!slot1Item) missing.push('item');
      if (!slot1Building) missing.push('building');
      if (!slot1Town) missing.push('town');
      slotErrors.push(`Slot 1 (Find Quest Item): missing ${missing.join(', ')}`);
    }

    // Slot 2: NPC Conversation — needs role + building + town
    const s2HasAny = slot2Role || slot2Building || slot2Town;
    const s2Complete = slot2Role && slot2Building && slot2Town;
    if (s2HasAny && !s2Complete) {
      const missing = [];
      if (!slot2Role) missing.push('NPC role');
      if (!slot2Building) missing.push('building');
      if (!slot2Town) missing.push('town');
      slotErrors.push(`Slot 2 (NPC Conversation): missing ${missing.join(', ')}`);
    }

    // Slot 3: Location — needs POI + mountain/region
    const s3HasAny = slot3Poi || slot3Mountain;
    const s3Complete = slot3Poi && slot3Mountain;
    if (s3HasAny && !s3Complete) {
      const missing = [];
      if (!slot3Poi) missing.push('point of interest');
      if (!slot3Mountain) missing.push('region');
      slotErrors.push(`Slot 3 (Explore Location): missing ${missing.join(', ')}`);
    }

    // Slot 4: Boss Fight — needs enemy
    // (single field, so it's either complete or empty — no partial state)

    // Check that at least one slot is fully complete
    const anyComplete = s1Complete || s2Complete || s3Complete || slot4Enemy;
    if (!anyComplete) {
      return 'Please complete at least one milestone slot to create a campaign.';
    }

    if (slotErrors.length > 0) {
      return `Some milestone slots are incomplete:\n${slotErrors.join('\n')}`;
    }

    return null; // valid
  };

  // Sync customNames from selected town/mountain names so map gen picks them up
  useEffect(() => {
    if (activeTab !== 'custom') return;
    const towns = [slot1Town, slot2Town].filter(Boolean);
    const mountains = [slot3Mountain].filter(Boolean);
    // Only update if there are selections — avoid clearing template-set names
    if (towns.length > 0 || mountains.length > 0) {
      setCustomNames({ towns, mountains });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot1Town, slot2Town, slot3Mountain, activeTab]);

  // Sync milestones whenever slot selections change
  useEffect(() => {
    if (activeTab !== 'custom') return;
    const built = buildMilestonesFromSlots();
    if (built.length > 0) {
      setMilestones(built);
      setSelectedTemplate('custom');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot1Item, slot1Building, slot1Town, slot2Role, slot2Building, slot2Town, slot3Poi, slot3Mountain, slot4Enemy, customTier, customTheme, activeTab]);

  const selectStyle = {
    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: '0.8rem', width: '100%',
    boxSizing: 'border-box',
  };

  const slotLabelStyle = {
    fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600,
    display: 'block', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.03em',
  };

  const slotCardStyle = {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px',
    padding: '14px', marginBottom: '10px',
  };

  const availableEnemies = getEnemiesByTierAndTheme(customTier, customTheme);

  const renderCustomTab = () => (
    <div className="form-section story-settings-section">
      <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Configure your adventure by selecting ingredients for each quest stage.
      </p>

      {/* Theme + Tier selection */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={slotLabelStyle}>Theme</label>
          <select
            value={customTheme}
            onChange={(e) => {
              const theme = e.target.value;
              setCustomTheme(theme);
              applyThemeDefaults(theme);
              setSlot4Enemy(''); // Reset enemy when theme changes
              // Auto-populate town/mountain pickers with first names from theme pool
              const names = THEME_NAMES[theme];
              if (names) {
                setSlot1Town(names.towns[0] || '');
                setSlot2Town(names.towns[1] || '');
                setSlot3Mountain(names.mountains[0] || '');
              }
            }}
            style={selectStyle}
          >
            {Object.entries(THEME_DEFAULTS).map(([id, t]) => (
              <option key={id} value={id}>{t.icon} {t.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <label style={slotLabelStyle}>Tier</label>
          <select
            value={customTier}
            onChange={(e) => {
              setCustomTier(Number(e.target.value));
              setSlot4Enemy(''); // Reset enemy when tier changes
            }}
            style={selectStyle}
          >
            <option value={1}>Tier 1 (Lv 1-2)</option>
            <option value={2}>Tier 2 (Lv 3-4)</option>
          </select>
        </div>
      </div>

      {/* Slot 1: Item Search */}
      <div style={slotCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{
            background: 'var(--primary)', color: '#fff', width: 24, height: 24,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 'bold',
          }}>1</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>📦 Find a Quest Item</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={slotLabelStyle}>Item</label>
            <select value={slot1Item} onChange={(e) => setSlot1Item(e.target.value)} style={selectStyle}>
              <option value="">Select item...</option>
              {SEARCHABLE_ITEMS.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({item.rarity})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={slotLabelStyle}>Found in</label>
            <select value={slot1Building} onChange={(e) => setSlot1Building(e.target.value)} style={selectStyle}>
              <option value="">Select building...</option>
              {QUEST_BUILDINGS.map(b => (
                <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={slotLabelStyle}>Town</label>
            <select value={slot1Town} onChange={(e) => setSlot1Town(e.target.value)} style={selectStyle}>
              <option value="">Select town...</option>
              {(THEME_NAMES[customTheme]?.towns || []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
        {slot1Item && slot1Building && slot1Town && (
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Find the {SEARCHABLE_ITEMS.find(i => i.id === slot1Item)?.name} in the {QUEST_BUILDINGS.find(b => b.id === slot1Building)?.name.toLowerCase()} at {slot1Town}
          </div>
        )}
      </div>

      {/* Slot 2: NPC Conversation */}
      <div style={slotCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{
            background: 'var(--primary)', color: '#fff', width: 24, height: 24,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 'bold',
          }}>2</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>💬 Meet an NPC</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={slotLabelStyle}>NPC Role</label>
            <select value={slot2Role} onChange={(e) => setSlot2Role(e.target.value)} style={selectStyle}>
              <option value="">Select role...</option>
              {NPC_ROLES.map(r => (
                <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={slotLabelStyle}>Building</label>
            <select value={slot2Building} onChange={(e) => setSlot2Building(e.target.value)} style={selectStyle}>
              <option value="">Select building...</option>
              {QUEST_BUILDINGS.map(b => (
                <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={slotLabelStyle}>Town</label>
            <select value={slot2Town} onChange={(e) => setSlot2Town(e.target.value)} style={selectStyle}>
              <option value="">Select town...</option>
              {(THEME_NAMES[customTheme]?.towns || []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
        {slot2Role && slot2Building && slot2Town && (
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Speak with the {NPC_ROLES.find(r => r.id === slot2Role)?.name.toLowerCase()} at the {QUEST_BUILDINGS.find(b => b.id === slot2Building)?.name.toLowerCase()} in {slot2Town}
          </div>
        )}
      </div>

      {/* Slot 3: Location / POI */}
      <div style={slotCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{
            background: 'var(--primary)', color: '#fff', width: 24, height: 24,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 'bold',
          }}>3</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>📍 Reach a Location</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>Requires #1 + #2</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={slotLabelStyle}>Point of Interest</label>
            <select value={slot3Poi} onChange={(e) => setSlot3Poi(e.target.value)} style={selectStyle}>
              <option value="">Select POI...</option>
              {POI_TYPES.map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={slotLabelStyle}>Region</label>
            <select value={slot3Mountain} onChange={(e) => setSlot3Mountain(e.target.value)} style={selectStyle}>
              <option value="">Select region...</option>
              {(THEME_NAMES[customTheme]?.mountains || []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
        {slot3Poi && slot3Mountain && (
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Reach the {POI_TYPES.find(p => p.id === slot3Poi)?.name} in {slot3Mountain}
          </div>
        )}
      </div>

      {/* Slot 4: Boss Fight */}
      <div style={slotCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{
            background: 'var(--primary)', color: '#fff', width: 24, height: 24,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 'bold',
          }}>4</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>⚔️ Boss Fight</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>Requires #3</span>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={slotLabelStyle}>Enemy (Tier {customTier})</label>
          <select value={slot4Enemy} onChange={(e) => setSlot4Enemy(e.target.value)} style={selectStyle}>
            <option value="">Select boss...</option>
            {availableEnemies.map(e => (
              <option key={e.id} value={e.id}>{e.icon} {e.name} ({e.enemyHP} HP)</option>
            ))}
          </select>
        </div>
        {slot4Enemy && QUEST_ENEMIES[slot4Enemy] && (
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Defeat {QUEST_ENEMIES[slot4Enemy].name} at the {POI_TYPES.find(p => p.id === slot3Poi)?.name || 'location'} in {slot3Mountain || 'The Wilds'}
          </div>
        )}
      </div>

      {/* Generated milestone summary */}
      {milestones.length > 0 && activeTab === 'custom' && (
        <div style={{
          padding: '12px', background: 'var(--surface)', borderRadius: '8px',
          border: '1px solid var(--border)', marginBottom: '16px',
        }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700 }}>
            Quest Chain Preview
          </div>
          {milestones.map((m, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text)', marginBottom: '3px' }}>
              {milestoneTypeIcon[m.type] || '?'} <strong>#{m.id}</strong> {m.text}
              {m.requires?.length > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}> (after #{m.requires.join(', #')})</span>}
            </div>
          ))}
        </div>
      )}

      {renderToneSettings()}
    </div>
  );

  const renderFreeformTab = () => (
    <div className="form-section story-settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Open-ended storytelling. The AI drives the narrative — no structured quest tracking.
        </p>
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleAiGenerateStory}
            disabled={isAiGenerating || !user}
            className={`ai-generate-button ${isAiGenerating ? 'loading' : ''}`}
            title={!user ? 'Sign in to use AI generation' : ''}
            style={{
              background: !user ? 'var(--text-secondary)' : 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              cursor: !user ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: !user ? 'none' : '0 4px 15px rgba(108, 92, 231, 0.3)',
              transition: 'all 0.3s ease',
              opacity: !user ? 0.6 : 1
            }}
          >
            {isAiGenerating ? '✨ Spawning World...' : '✨ Generate with AI'}
          </button>
          {!user && (
            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '4px' }}>
              Sign in required
            </span>
          )}
        </div>
      </div>
      {aiError && <p className="error-message" style={{ marginBottom: '15px' }}>{aiError}</p>}

      <div style={{ marginBottom: '15px' }}>
        <button
          type="button"
          onClick={() => setShowStoryDebug(!showStoryDebug)}
          style={{ background: 'none', border: 'none', color: 'var(--state-muted-strong)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          {showStoryDebug ? 'Hide AI Debug' : 'Show AI Debug Info'}
        </button>

        {showStoryDebug && (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <h5 style={{ margin: '0 0 5px 0', color: 'var(--text)' }}>Raw AI Response:</h5>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', maxHeight: '200px', overflowY: 'auto' }}>
              {rawAiResponse || 'No data yet. Generate a story to see output.'}
            </pre>
          </div>
        )}
      </div>

      <div className="settings-row">
        <div className="settings-group full-width">
          <label htmlFor="shortDescription">Adventure Description</label>
          <textarea
            id="shortDescription"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            placeholder="e.g., A group of mercenaries investigating a haunted mine..."
            className="settings-textarea"
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-group full-width">
          <label htmlFor="campaignGoal">Campaign Goal</label>
          <textarea
            id="campaignGoal"
            value={campaignGoal}
            onChange={(e) => setCampaignGoal(e.target.value)}
            placeholder="e.g., Defeat the dragon terrorizing the kingdom..."
            className="settings-textarea"
            style={{ minHeight: '60px' }}
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-group full-width">
          <label htmlFor="milestones">Story Milestones (one per line)</label>
          <textarea
            id="milestones"
            value={milestones.map(m => typeof m === 'object' ? m.text : m).join('\n')}
            onChange={(e) => {
              const lines = e.target.value.split('\n');
              setMilestones(lines.map((line, i) => {
                const existing = milestones[i];
                if (existing && typeof existing === 'object' && existing.text === line) return existing;
                return { text: line, location: (existing && typeof existing === 'object') ? existing.location : null };
              }));
            }}
            placeholder="e.g., Find the ancient key&#10;Bribe the castle guard..."
            className="settings-textarea"
            style={{ minHeight: '80px' }}
          />
        </div>
      </div>

      {renderToneSettings()}
    </div>
  );

  return (
    <div className="page-container new-game-page">
      <h1>New Game Setup</h1>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '24px',
        borderBottom: '2px solid var(--border)',
      }}>
        {[
          { id: 'templates', label: 'Templates', icon: '📜' },
          { id: 'custom', label: 'Custom', icon: '🛠️' },
          { id: 'freeform', label: 'Freeform', icon: '✍️' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'custom' && selectedTemplate && selectedTemplate !== 'custom') {
                setSelectedTemplate('custom');
              } else if (tab.id === 'freeform' && selectedTemplate && selectedTemplate !== 'ai' && selectedTemplate !== 'freeform') {
                setSelectedTemplate('freeform');
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              padding: '10px 20px',
              fontSize: '0.95rem',
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-2px',
              fontFamily: 'var(--header-font)',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'templates' && renderTemplateTab()}
      {activeTab === 'custom' && renderCustomTab()}
      {activeTab === 'freeform' && renderFreeformTab()}

      {/* Template Detail Modal */}
      {renderTemplateModal()}

      {/* World Map Generation Section */}
      <div className="form-section map-generation-section">
        <h2>World Map</h2>
        <p>Generate a random world map for your adventure. Each map is unique with forests, mountains, and towns.</p>

        <div className="map-generation-controls">
          <div className="seed-input-group" style={{ marginBottom: '15px' }}>
            <label htmlFor="worldSeed" style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>World Seed:</label>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
              <input
                id="worldSeed"
                type="number"
                value={worldSeed || ''}
                onChange={(e) => setWorldSeed(e.target.value)}
                placeholder="Leave empty for random"
                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-soft)', width: '180px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setWorldSeed(Math.floor(Math.random() * 1000000))}
                className="settings-submit-button"
                style={{ padding: '8px 14px', fontSize: '0.9rem', boxSizing: 'border-box', letterSpacing: 'normal', textTransform: 'none', boxShadow: 'none', border: '1px solid var(--primary)' }}
              >
                🎲 Randomize
              </button>
            </div>
          </div>
          <button
            onClick={() => {
              const seedToUse = worldSeed || Math.floor(Math.random() * 1000000);
              if (!worldSeed) setWorldSeed(seedToUse);
              const newMap = generateMapData(10, 10, seedToUse, mergeLocationNames(customNames, milestones));
              setGeneratedMap(newMap);
              setShowMapPreview(true);
            }}
            className="generate-map-button"
            type="button"
            style={{ width: '100%', maxWidth: '300px' }}
          >
            {generatedMap ? '🔄 Build Map from Seed' : '🗺️ Generate World Map'}
          </button>

          {generatedMap && (
            <span className="map-status">✓ Map generated!</span>
          )}
        </div>

        {showMapPreview && generatedMap && (
          <div className="map-preview-container">
            <h3>Map Preview</h3>
            <p className="map-preview-hint">
              <strong>Towns:</strong> 🛖 Hamlet | 🏡 Village | 🏘️ Town | 🏰 City<br />
              <strong>Features:</strong> 🌲 Forest | ⛰️ Mountain
            </p>
            <WorldMapDisplay
              mapData={generatedMap}
              playerPosition={(() => {
                try {
                  return findStartingTown(generatedMap);
                } catch (error) {
                  logger.error('Error finding starting town in preview:', error);
                  // Find any town as fallback for preview
                  for (let y = 0; y < generatedMap.length; y++) {
                    for (let x = 0; x < generatedMap[y].length; x++) {
                      if (generatedMap[y][x].poi === 'town') {
                        return { x, y };
                      }
                    }
                  }
                  return { x: 0, y: 0 }; // Last resort
                }
              })()}
              onTileClick={() => { }} // No interaction in preview
              firstHero={null} // No player marker in preview
            />
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: '40px', marginBottom: '40px', padding: '20px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 12px var(--shadow)' }}>
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>🤖 Global AI Configuration</h4>
        <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--text)' }}>Current: <strong>{selectedProvider}</strong> / <strong>{selectedModel}</strong></p>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          style={{ padding: '8px 20px', background: 'transparent', color: 'var(--primary)', border: '2px solid var(--primary)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
        >
          ⚙️ Technical AI Settings
        </button>
      </div>

      {/* Action Button & Error Message */}
      <div className="form-actions">
        {formError && <p className="error-message">{formError}</p>}
        <button onClick={handleSubmit} className="settings-submit-button">
          Next: Select Heroes
        </button>
      </div>
    </div>
  );
};

export default NewGame;


// const { state } = useLocation();
// const settingsData = state?.settingsData;

/*
const [shortDescription, setShortDescription] = useState(settingsData?.shortDescription || '');
const [grimnessLevel, setGrimnessLevel] = useState(settingsData?.grimnessLevel || '');
const [darknessLevel, setDarknessLevel] = useState(settingsData?.darknessLevel || '');
const [magicLevel, setMagicLevel] = useState(settingsData?.magicLevel || 'Low Magic');
const [technologyLevel, setTechnologyLevel] = useState(settingsData?.technologyLevel || 'Medieval');
const [responseVerbosity, setResponseVerbosity] = useState(settingsData?.responseVerbosity || 'Moderate');
*/
