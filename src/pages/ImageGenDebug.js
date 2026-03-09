import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import '../styles/debug.css';

const rawWorkerUrl = process.env.REACT_APP_CF_WORKER_URL || 'http://localhost:8787';
const DEFAULT_WORKER_URL = rawWorkerUrl.replace('https://localhost', 'http://localhost');

const MODES = { WORKER: 'worker', DIRECT: 'direct' };

const IMAGE_MODELS = [
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 Schnell (fast)', defaultSteps: 4 },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', defaultSteps: 20 },
  { id: '@cf/bytedance/stable-diffusion-xl-lightning', name: 'SDXL Lightning (fast)', defaultSteps: 4 },
];

// localStorage keys for persisting CF credentials
const LS_CF_ACCOUNT = 'imggen_cf_account_id';
const LS_CF_TOKEN = 'imggen_cf_api_token';

// All prompts from IMAGE_GENERATION_PROMPTS.md, organized by section
const PROMPT_SECTIONS = [
  {
    title: 'Heroic Fantasy — Tier 1 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'goblin_chieftain', prompt: 'A snarling goblin chieftain in crude iron crown and patchwork armor, standing atop a pile of stolen goods in a torch-lit cave. Green skin, red eyes, wielding a jagged scimitar. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'orc_warchief', prompt: 'A massive orc warchief in blood-spattered plate armor, roaring a battle cry on a burning battlefield. Tusked face scarred from countless fights, wielding a two-handed war axe. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'troll_bridge_guard', prompt: 'A hulking moss-covered troll blocking a narrow stone bridge over a misty gorge. Massive club in hand, tiny intelligent eyes glaring. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'bandit_king', prompt: 'A charismatic bandit king in a weathered leather longcoat, seated on a makeshift throne of stolen crates in a forest hideout. Scarred face, confident smirk, dual daggers at his belt. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Heroic Fantasy — Tier 2 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'shadow_overlord', prompt: 'A towering shadow overlord in ornate black armor wreathed in dark purple energy, standing in a ruined throne room. Glowing violet eyes beneath a horned crown, tendrils of shadow swirling around armored gauntlets. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'warlord', prompt: 'An iron warlord in battle-scarred full plate armor standing before a burning castle. Grizzled face, commanding presence, holding a massive greatsword planted point-down. Army banners in the background. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'dragon_wyrm', prompt: 'A fearsome red wyrm dragon coiled atop a mountain of gold in a vast cavern. Scales gleaming like molten iron, wings spread wide, breathing a torrent of flame. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'fallen_paladin', prompt: 'A fallen paladin in cracked and tarnished silver armor, corrupted holy symbols glowing sickly green. Standing in a desecrated chapel, broken stained glass behind. Eyes burning with unholy light. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Grimdark Survival — Tier 1 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'blightspawn', prompt: 'A grotesque blightspawn creature — a writhing mass of fungal growths and rotting flesh shambling through a diseased swamp. Glowing spores drift from its body. Dark fantasy digital painting, dramatic cinematic lighting, sickly green and brown palette. Landscape composition 16:9. No text or UI elements.' },
      { key: 'plague_rat_king', prompt: 'A massive plague rat king — an enormous diseased rat with matted fur and glowing yellow eyes, surrounded by a swarm of smaller rats in a flooded sewer tunnel. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'carrion_hag', prompt: 'A hunched carrion hag with long clawed fingers and tattered robes, stirring a bubbling cauldron in a bone-strewn forest clearing. Pale skin, hollow black eyes, necklace of small skulls. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'feral_ghoul', prompt: 'A feral ghoul crouched on a ruined stone wall at night, emaciated grey body with exposed muscle, jaw unhinged in a silent scream. Moonlit graveyard behind. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Grimdark Survival — Tier 2 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'rot_heart', prompt: 'The Rot-Heart — a massive pulsating organic mass of corrupted flesh and vines in the center of a dead forest. Beating like a giant heart, dark ichor oozing from cracks, roots spreading corruption outward. Dark fantasy digital painting, dramatic cinematic lighting, sickly palette. Landscape composition 16:9. No text or UI elements.' },
      { key: 'lich', prompt: 'A bone tyrant lich in tattered royal robes, sitting on a throne of fused skeletons in a frozen crypt. Glowing blue eyes in a crowned skull, spectral energy crackling between skeletal fingers. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements.' },
      { key: 'plague_lord', prompt: 'A plague lord in corroded armor dripping with toxic slime, standing in a field of dead crops. Bloated body, a cloud of buzzing flies, wielding a massive rusted flail. Dark fantasy digital painting, dramatic cinematic lighting, sickly green palette. Landscape composition 16:9. No text or UI elements.' },
      { key: 'blood_wendigo', prompt: 'A blood wendigo — a towering gaunt creature with antlers made of bone, blood-streaked white fur, standing in a blizzard-swept dead forest. Hollow eyes glowing red, elongated claws. Dark fantasy digital painting, dramatic cinematic lighting, cold blue and crimson palette. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Arcane Renaissance — Tier 1 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'rogue_automaton', prompt: 'A rogue automaton — a malfunctioning clockwork humanoid with exposed gears and sparking wires, rampaging through a Renaissance-style workshop. Brass and copper body, one eye flickering. Dark fantasy digital painting with steampunk elements, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'clockwork_spider', prompt: 'A giant clockwork spider with brass legs and a crystal core, descending from the ceiling of an arcane laboratory. Gears whirring, magical energy crackling between legs. Dark fantasy digital painting with steampunk elements, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'rune_golem', prompt: 'A massive rune golem made of carved stone blocks covered in glowing blue arcane runes, standing guard in a ruined magical academy. Cracks leaking magical energy. Dark fantasy digital painting, dramatic cinematic lighting, blue magical glow. Landscape composition 16:9. No text or UI elements.' },
      { key: 'mad_alchemist', prompt: 'A mad alchemist in a stained leather apron surrounded by bubbling apparatus in a chaotic laboratory. Wild eyes behind cracked goggles, holding a volatile glowing flask. Explosions of color. Dark fantasy digital painting with Renaissance elements, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Arcane Renaissance — Tier 2 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'old_god_herald', prompt: 'The Herald of the Old Gods — a towering mechanical angel made of brass and crystal, hovering above a ruined city. Wings of interlocking gears, face a featureless golden mask, arcane energy pouring from its chest. Dark fantasy digital painting, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'arcane_colossus', prompt: 'An arcane colossus — a building-sized construct of stone and metal animated by swirling magical energy, striding through a city of towers. Rune-covered body, glowing eyes, crushing buildings underfoot. Dark fantasy digital painting, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'leyline_dragon', prompt: 'A leyline dragon — a serpentine dragon made partially of crystallized magical energy, coiled around an arcane spire. Translucent scales revealing veins of pure mana, eyes like stars. Dark fantasy digital painting, dramatic cinematic lighting, vibrant magical colors. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Eldritch Horror — Tier 1 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'cult_leader', prompt: 'The Hooded Priest — a robed cultist leader performing a ritual in a candlelit underground chamber. Face hidden in shadow beneath a deep hood, hands raised over a glowing eldritch sigil on the floor. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'deep_one_scout', prompt: 'A deep one scout — a fish-human hybrid creature emerging from dark ocean water onto a moonlit rocky shore. Scales glistening, bulging black eyes, webbed claws gripping barnacle-covered rocks. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'shadow_stalker', prompt: 'A shadow stalker — a barely-visible humanoid shape made of living darkness, slipping between the pillars of a fog-shrouded alley. Only glowing white eyes visible, tendrils of shadow reaching outward. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'worm_that_walks', prompt: 'The Worm That Walks — a vaguely humanoid shape composed entirely of thousands of writhing worms and maggots, wearing a tattered robe in a decrepit library. Dark fantasy digital painting, Lovecraftian atmosphere, body horror, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Eldritch Horror — Tier 2 Bosses',
    outputDir: 'encounters/bosses',
    prompts: [
      { key: 'great_dreamer', prompt: 'The Great Dreamer — a colossal tentacled entity slumbering beneath a dark ocean, visible through fractured reality. Mountainous body, countless tendrils, one enormous eye half-open. Tiny ships on the surface for scale. Dark fantasy digital painting, cosmic horror, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'void_leviathan', prompt: 'A void leviathan — an impossibly large serpentine creature swimming through a starfield of warped space. Body covered in eyes that see into other dimensions, reality bending around it. Dark fantasy digital painting, cosmic horror, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
      { key: 'psionic_devourer', prompt: 'A psionic devourer — an elegant tentacle-faced humanoid in ornate purple robes, hovering in a chamber of psychic crystals. Tentacles writhing, psionic energy radiating from its oversized cranium. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements.' },
    ],
  },
  {
    title: 'Template Adventure Cards — Tier 1',
    outputDir: 'templates',
    prompts: [
      { key: 'heroic-fantasy-t1', prompt: 'A small band of adventurers approaching a goblin-infested village at sunset. Smoke rising from thatched roofs, distant green figures on the walls. Rolling green hills, warm golden light. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich color palette, painterly style. No text, no UI, no borders.' },
      { key: 'grimdark-survival-t1', prompt: 'A desolate blighted village with withered crops and dying trees under an overcast grey sky. A lone figure walking a muddy road toward crumbling buildings. Crows circling overhead, sickly mist. Epic dark fantasy illustration, sweeping landscape. Wide cinematic composition 16:9. Muted desaturated palette, painterly style. No text, no UI, no borders.' },
      { key: 'arcane-renaissance-t1', prompt: 'A Renaissance-style city with brass spires and clockwork towers, a malfunctioning automaton sparking in the town square. Citizens fleeing, gears scattered. Warm amber and copper tones. Epic fantasy illustration with steampunk elements, sweeping cityscape. Wide cinematic composition 16:9. Rich color palette, painterly style. No text, no UI, no borders.' },
      { key: 'eldritch-horror-t1', prompt: 'A fog-shrouded coastal village at night with hooded figures gathering around a bonfire on the beach. Strange symbols drawn in the sand, an unnatural green glow from the waves. Epic dark fantasy illustration, Lovecraftian atmosphere. Wide cinematic composition 16:9. Dark moody palette, painterly style. No text, no UI, no borders.' },
    ],
  },
  {
    title: 'Template Adventure Cards — Tier 2',
    outputDir: 'templates',
    prompts: [
      { key: 'heroic-fantasy-t2', prompt: 'An epic vista of a dark fortress atop a craggy mountain, lightning striking its towers. An army with golden banners marching up the winding path. Dramatic sunset sky in orange and purple. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich vibrant palette, painterly style. No text, no UI, no borders.' },
      { key: 'grimdark-survival-t2', prompt: 'A massive pulsating organic growth consuming a dead forest, dark tendrils spreading across the land. A small party of grim warriors at the edge, looking in. Sickly red sky. Epic dark fantasy illustration, sweeping landscape. Wide cinematic composition 16:9. Dark desaturated palette with sickly accents, painterly style. No text, no UI, no borders.' },
      { key: 'arcane-renaissance-t2', prompt: 'A towering mechanical angel hovering above a sprawling Renaissance city, arcane energy raining down. Citizens looking up in awe and terror. Grand architecture, magical auroras in the sky. Epic fantasy illustration with arcane elements, sweeping cityscape. Wide cinematic composition 16:9. Rich magical palette, painterly style. No text, no UI, no borders.' },
      { key: 'eldritch-horror-t2', prompt: 'A vast dark ocean under alien stars, the silhouette of an impossibly large tentacled entity rising from the depths. Tiny ships capsizing in the waves. Unnatural purple and green aurora. Epic cosmic horror illustration, sweeping seascape. Wide cinematic composition 16:9. Dark palette with eldritch glows, painterly style. No text, no UI, no borders.' },
    ],
  },
  {
    title: 'Template Adventure Cards — Tier 3',
    outputDir: 'templates',
    prompts: [
      { key: 'heroic-fantasy-t3', prompt: 'A shattered throne room floating in a void between dimensions, broken columns and cracked marble suspended in space. A lone hero silhouetted against a rift of golden light. Epic fantasy illustration, surreal otherworldly landscape. Wide cinematic composition 16:9. Rich dramatic palette, painterly style. No text, no UI, no borders.' },
      { key: 'grimdark-survival-t3', prompt: 'An endless frozen wasteland under a dying red sun, skeletal ruins of a civilization buried in ice. A small group of survivors trudging through deep snow, their breath visible. Epic dark fantasy illustration, desolate landscape. Wide cinematic composition 16:9. Cold blue and crimson palette, painterly style. No text, no UI, no borders.' },
      { key: 'arcane-renaissance-t3', prompt: 'A colossal clockwork god — a mountain-sized mechanical deity — rising from the earth, gears the size of buildings turning. A city crumbling at its feet, magical lightning arcing from its body. Epic fantasy illustration, apocalyptic scale. Wide cinematic composition 16:9. Dramatic palette, painterly style. No text, no UI, no borders.' },
      { key: 'eldritch-horror-t3', prompt: 'A drowned city rising from a black ocean, impossible non-Euclidean architecture glistening with brine. Tentacles coiling between spires, a sickly green light from below. Ships caught in the geometry. Epic cosmic horror illustration, nightmarish seascape. Wide cinematic composition 16:9. Dark eldritch palette, painterly style. No text, no UI, no borders.' },
    ],
  },
];

const totalPromptCount = PROMPT_SECTIONS.reduce((sum, s) => sum + s.prompts.length, 0);

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No active Supabase session. Please sign in first.');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
};

const ImageGenDebug = () => {
  const [workerUrl, setWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [selectedModel, setSelectedModel] = useState(IMAGE_MODELS[0].id);
  const [selected, setSelected] = useState(() => new Set());
  const [results, setResults] = useState({});  // key -> { image, error, loading }
  const [generating, setGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customKey, setCustomKey] = useState('custom_test');
  const [batchDelay, setBatchDelay] = useState(1000);
  const abortRef = useRef(false);

  const toggleSelect = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectSection = (section) => {
    setSelected(prev => {
      const next = new Set(prev);
      const keys = section.prompts.map(p => p.key);
      const allSelected = keys.every(k => next.has(k));
      keys.forEach(k => allSelected ? next.delete(k) : next.add(k));
      return next;
    });
  };

  const selectAll = () => {
    setSelected(prev => {
      if (prev.size === totalPromptCount) return new Set();
      const all = new Set();
      PROMPT_SECTIONS.forEach(s => s.prompts.forEach(p => all.add(p.key)));
      return all;
    });
  };

  const generateSingle = useCallback(async (prompt, key) => {
    setResults(prev => ({ ...prev, [key]: { loading: true } }));

    try {
      const headers = await getAuthHeaders();
      const modelInfo = IMAGE_MODELS.find(m => m.id === selectedModel);
      const res = await fetch(`${workerUrl}/api/image/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          width: 1024,
          height: 576,  // 16:9-ish
          steps: modelInfo?.defaultSteps,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResults(prev => ({
        ...prev,
        [key]: { image: `data:image/png;base64,${data.image}`, model: data.modelName },
      }));
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [key]: { error: err.message },
      }));
    }
  }, [workerUrl, selectedModel]);

  const generateSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setGenerating(true);
    abortRef.current = false;

    const queue = [];
    PROMPT_SECTIONS.forEach(section => {
      section.prompts.forEach(p => {
        if (selected.has(p.key)) queue.push(p);
      });
    });

    for (let i = 0; i < queue.length; i++) {
      if (abortRef.current) break;
      const item = queue[i];
      await generateSingle(item.prompt, item.key);
      // Delay between requests to avoid rate limiting
      if (i < queue.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, batchDelay));
      }
    }

    setGenerating(false);
  }, [selected, generateSingle, batchDelay]);

  const stopGeneration = () => {
    abortRef.current = true;
  };

  const generateCustom = async () => {
    if (!customPrompt.trim()) return;
    await generateSingle(customPrompt, customKey);
  };

  const downloadImage = (key) => {
    const result = results[key];
    if (!result?.image) return;
    const a = document.createElement('a');
    a.href = result.image;
    a.download = `${key}.png`;
    a.click();
  };

  const downloadAll = () => {
    Object.entries(results).forEach(([key, result]) => {
      if (result?.image) {
        setTimeout(() => downloadImage(key), 100);
      }
    });
  };

  const completedCount = Object.values(results).filter(r => r.image).length;
  const errorCount = Object.values(results).filter(r => r.error).length;
  const loadingCount = Object.values(results).filter(r => r.loading).length;

  return (
    <div className="page-container debug-page">
      <div className="page-header">
        <h1>Image Generation</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '10px' }}>
          Generate game art via CF Workers AI — {totalPromptCount} prompts loaded
        </p>
      </div>

      {/* Config */}
      <div className="debug-section">
        <h3>Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div className="form-group">
            <label>Worker URL:</label>
            <input
              type="text"
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Model:</label>
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {IMAGE_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Batch delay (ms between requests):</label>
          <input
            type="number"
            value={batchDelay}
            onChange={(e) => setBatchDelay(Number(e.target.value))}
            min="0"
            max="10000"
            step="500"
            style={{ width: '120px' }}
          />
        </div>
      </div>

      {/* Custom prompt */}
      <div className="debug-section">
        <h3>Custom Prompt</h3>
        <div className="form-group">
          <label>Output key:</label>
          <input
            type="text"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            style={{ width: '300px' }}
          />
        </div>
        <div className="form-group">
          <label>Prompt:</label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={3}
            placeholder="Enter a custom image prompt..."
          />
        </div>
        <button
          onClick={generateCustom}
          disabled={generating || !customPrompt.trim()}
          className="primary-button"
        >
          Generate Custom
        </button>
        {results[customKey] && (
          <div style={{ marginTop: '15px' }}>
            <ResultCard itemKey={customKey} result={results[customKey]} onDownload={downloadImage} />
          </div>
        )}
      </div>

      {/* Batch controls */}
      <div className="debug-section">
        <h3>Batch Generation</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '15px' }}>
          <button onClick={selectAll} className="primary-button" disabled={generating}>
            {selected.size === totalPromptCount ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={generateSelected}
            disabled={generating || selected.size === 0}
            className="primary-button"
            style={{ background: 'var(--state-success)', borderColor: 'var(--state-success)' }}
          >
            Generate {selected.size} Selected
          </button>
          {generating && (
            <button onClick={stopGeneration} className="primary-button" style={{ background: 'var(--state-danger)', borderColor: 'var(--state-danger)' }}>
              Stop
            </button>
          )}
          {completedCount > 0 && (
            <button onClick={downloadAll} className="primary-button">
              Download All ({completedCount})
            </button>
          )}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
            {selected.size} selected
            {generating && ` | ${loadingCount} in progress`}
            {completedCount > 0 && ` | ${completedCount} done`}
            {errorCount > 0 && ` | ${errorCount} failed`}
          </span>
        </div>
      </div>

      {/* Prompt sections */}
      {PROMPT_SECTIONS.map((section) => {
        const sectionKeys = section.prompts.map(p => p.key);
        const allSectionSelected = sectionKeys.every(k => selected.has(k));
        return (
          <div key={section.title} className="debug-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>{section.title}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                  {section.outputDir}/
                </span>
                <button
                  onClick={() => selectSection(section)}
                  disabled={generating}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                  }}
                >
                  {allSectionSelected ? 'Deselect' : 'Select'} Section
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {section.prompts.map((item) => (
                <PromptCard
                  key={item.key}
                  item={item}
                  isSelected={selected.has(item.key)}
                  onToggle={() => toggleSelect(item.key)}
                  result={results[item.key]}
                  onGenerate={() => generateSingle(item.prompt, item.key)}
                  onDownload={() => downloadImage(item.key)}
                  generating={generating}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PromptCard = ({ item, isSelected, onToggle, result, onGenerate, onDownload, generating }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'var(--surface)',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Image preview */}
      {result?.image && (
        <img
          src={result.image}
          alt={item.key}
          style={{ width: '100%', display: 'block', cursor: 'pointer' }}
          onClick={onDownload}
          title="Click to download"
        />
      )}
      {result?.loading && (
        <div style={{
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-secondary)',
          color: 'var(--primary)',
        }}>
          Generating...
        </div>
      )}
      {result?.error && (
        <div style={{
          padding: '8px',
          background: 'rgba(255,0,0,0.1)',
          color: 'var(--state-danger)',
          fontSize: '0.8em',
        }}>
          {result.error}
        </div>
      )}

      <div style={{ padding: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9em' }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              disabled={generating}
            />
            {item.key}
          </label>
          <button
            onClick={onGenerate}
            disabled={generating || result?.loading}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8em',
            }}
          >
            Gen
          </button>
        </div>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            fontSize: '0.78em',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            overflow: 'hidden',
            maxHeight: expanded ? 'none' : '2.4em',
            lineHeight: '1.2em',
          }}
          title="Click to expand/collapse"
        >
          {item.prompt}
        </div>
        {result?.model && (
          <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginTop: '4px' }}>
            via {result.model}
          </div>
        )}
      </div>
    </div>
  );
};

const ResultCard = ({ itemKey, result, onDownload }) => {
  if (result.loading) {
    return <div style={{ color: 'var(--primary)' }}>Generating...</div>;
  }
  if (result.error) {
    return <div style={{ color: 'var(--state-danger)' }}>{result.error}</div>;
  }
  if (result.image) {
    return (
      <div>
        <img
          src={result.image}
          alt={itemKey}
          style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }}
          onClick={() => onDownload(itemKey)}
          title="Click to download"
        />
        <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: '4px' }}>
          via {result.model} — click image to download
        </div>
      </div>
    );
  }
  return null;
};

export default ImageGenDebug;
