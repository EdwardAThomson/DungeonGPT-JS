/**
 * GameSettingsPage — new game setup: story, world params, map generation.
 *
 * Ported from src/pages/GameSettings.js (573 lines).
 * Broken into sub-components: StoryTemplateGrid, WorldSettingsGrid.
 * Uses Zustand (replacing SettingsContext).
 * Uses TanStack Query useGenerateAI (replacing llmService).
 * Uses TanStack Router (replacing React Router).
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import type { StoryTemplate } from "@/data/story-templates";
import type { WorldMap } from "@/game/maps/world-generator";
import type {
  DarknessLevel,
  GameSettings,
  GrimnessLevel,
  MagicLevel,
  Milestone,
  ResponseVerbosity,
  TechnologyLevel,
} from "@dungeongpt/shared";

import { useGenerateAI } from "@/api/client";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { findStartingTown, generateMapData } from "@/game/maps/world-generator";
import { cn } from "@/lib/utils";
import { WorldMapDisplay } from "@/pages/game/components/world-map-display";
import { StoryTemplateGrid } from "@/pages/game/settings/story-template-grid";
import { WorldSettingsGrid } from "@/pages/game/settings/world-settings-grid";
import { MainNav } from "@/pages/home/main-nav";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";


const textareaStyle = cn(
  "w-full p-3 mb-5",
  "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  "rounded-[4px] box-border",
  "font-[family-name:var(--font-ui)] text-base",
  "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
  "disabled:opacity-70 disabled:cursor-not-allowed",
);

const labelStyle = cn(
  "block mb-2 font-semibold",
  "font-[family-name:var(--font-header)] text-[0.85rem]",
  "tracking-[0.05em] text-[var(--text-secondary)]",
);

const lockedStyle = "opacity-70 cursor-not-allowed";

/** Resolve milestone locations to map coordinates. Ported as-is from GameSettings.js. */
function buildLocationLookup(
  mapData: WorldMap,
): Record<string, { x: number; y: number }> {
  const lookup: Record<string, { x: number; y: number }> = {};
  for (const [y, row] of mapData.entries()) {
    for (const [x, tile] of row.entries()) {
      if (tile.poi === "town" && tile.townName) {
        lookup[tile.townName.toLowerCase()] = { x, y };
      }
      if (tile.poi === "mountain" && tile.mountainName) {
        const key = tile.mountainName.toLowerCase();
        lookup[key] ??= { x, y };
      }
    }
  }
  return lookup;
}

function resolveMilestoneCoords(
  milestones: readonly Milestone[],
  mapData: WorldMap | null,
): Milestone[] {
  if (!mapData) return [...milestones];

  const locationLookup = buildLocationLookup(mapData);

  return milestones
    .filter((m) => m.text.trim())
    .map((m) => {
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
}

export function GameSettingsPage() {
  const navigate = useNavigate();
  const generateAI = useGenerateAI();
  const setWorldMap = useGameStore((s) => s.setWorldMap);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSettingsModalOpen = useUiStore((s) => s.setSettingsModalOpen);

  // Clear stale session on mount (ported as-is)
  useEffect(() => {
    try {
      globalThis.localStorage.removeItem("activeGameSessionId");
    } catch {
      // Ignore
    }
  }, []);

  // Form state
  const [shortDescription, setShortDescription] = useState("");
  const [grimnessLevel, setGrimnessLevel] = useState("");
  const [darknessLevel, setDarknessLevel] = useState("");
  const [magicLevel, setMagicLevel] = useState("Low Magic");
  const [technologyLevel, setTechnologyLevel] = useState("Medieval");
  const [responseVerbosity, setResponseVerbosity] = useState("Moderate");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [formError, setFormError] = useState("");
  const [generatedMap, setGeneratedMap] = useState<WorldMap | null>(null);
  const [worldSeed, setWorldSeed] = useState<number | string | null>(null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customNames, setCustomNames] = useState<{
    towns: string[];
    mountains: string[];
  }>({ towns: [], mountains: [] });
  const [aiError, setAiError] = useState("");

  const isTemplateLocked = Boolean(
    selectedTemplate && selectedTemplate !== "custom",
  );

  const handleSelectTemplate = useCallback((template: StoryTemplate) => {
    setSelectedTemplate(template.id);
    setShortDescription(template.settings.shortDescription);
    setGrimnessLevel(template.settings.grimnessLevel);
    setDarknessLevel(template.settings.darknessLevel);
    setMagicLevel(template.settings.magicLevel);
    setTechnologyLevel(template.settings.technologyLevel);
    setResponseVerbosity(template.settings.responseVerbosity);
    setCampaignGoal(template.settings.campaignGoal);
    setMilestones([...template.settings.milestones]);
    setCustomNames({
      towns: [...template.customNames.towns],
      mountains: [...template.customNames.mountains],
    });
  }, []);

  const handleSelectCustom = useCallback(() => {
    setSelectedTemplate("custom");
    setCustomNames({ towns: [], mountains: [] });
    setCampaignGoal("");
    setMilestones([]);
  }, []);

  const handleAiGenerate = useCallback(() => {
    setAiError("");
    setSelectedTemplate("ai");

    // Ported prompt from GameSettings.js — zero changes
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

    generateAI.mutate(
      {
        provider: selectedProvider,
        model: selectedModel,
        prompt,
        maxTokens: 1000,
        temperature: 0.9,
      },
      {
        onSuccess: (response) => {
          try {
            const parsed = extractAndParseJson(response.text);
            setShortDescription(toStr(parsed["shortDescription"], ""));
            setCampaignGoal(toStr(parsed["campaignGoal"], ""));
            setMilestones(
              (
                Array.isArray(parsed["milestones"])
                  ? (parsed["milestones"] as Record<string, unknown>[])
                  : []
              ).map((m) => ({
                text: toStr(m["text"], ""),
                location: typeof m["location"] === "string" ? m["location"] : null,
              })),
            );
            setGrimnessLevel(toStr(parsed["grimnessLevel"], "Neutral"));
            setDarknessLevel(toStr(parsed["darknessLevel"], "Neutral"));
            setMagicLevel(toStr(parsed["magicLevel"], "Low Magic"));
            setTechnologyLevel(toStr(parsed["technologyLevel"], "Medieval"));
            setResponseVerbosity(
              toStr(parsed["responseVerbosity"], "Moderate"),
            );
            const rawNames = parsed["customNames"] as
              | Record<string, unknown>
              | unknown[]
              | undefined;
            if (Array.isArray(rawNames)) {
              setCustomNames({
                towns: rawNames.map(String),
                mountains: [],
              });
            } else if (rawNames && typeof rawNames === "object") {
              setCustomNames({
                towns: Array.isArray(rawNames["towns"])
                  ? (rawNames["towns"] as unknown[]).map(String)
                  : [],
                mountains: Array.isArray(rawNames["mountains"])
                  ? (rawNames["mountains"] as unknown[]).map(String)
                  : [],
              });
            }
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            setAiError(message);
          }
        },
        onError: (err) => {
          setAiError(err.message);
        },
      },
    );
  }, [generateAI, selectedProvider, selectedModel]);

  const handleGenerateMap = useCallback(() => {
    const seedToUse =
      worldSeed != null && worldSeed !== ""
        ? Number(worldSeed)
        : Math.floor(Math.random() * 1_000_000);
    if (worldSeed == null || worldSeed === "") {
      setWorldSeed(seedToUse);
    }
    const newMap = generateMapData(10, 10, seedToUse, customNames);
    setGeneratedMap(newMap);
    setShowMapPreview(true);
  }, [worldSeed, customNames]);

  const handleSubmit = useCallback(() => {
    if (!shortDescription.trim()) {
      setFormError("Please enter a story description.");
      return;
    }
    if (!grimnessLevel) {
      setFormError("Please select a Grimness level.");
      return;
    }
    if (!darknessLevel) {
      setFormError("Please select a Darkness level.");
      return;
    }
    if (!generatedMap) {
      setFormError("Please generate a world map before proceeding.");
      return;
    }

    setFormError("");

    const templateName =
      selectedTemplate === "ai"
        ? "AI Generated World"
        : selectedTemplate === "custom" || !selectedTemplate
          ? "Custom Tale"
          : "Template";

    const settingsData: GameSettings = {
      shortDescription,
      grimnessLevel: grimnessLevel as GrimnessLevel | "",
      darknessLevel: darknessLevel as DarknessLevel | "",
      magicLevel: magicLevel as MagicLevel,
      technologyLevel: technologyLevel as TechnologyLevel,
      responseVerbosity: responseVerbosity as ResponseVerbosity,
      campaignGoal,
      milestones: resolveMilestoneCoords(milestones, generatedMap),
      worldSeed,
      templateName,
    };

    const gameSessionId = `game-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      globalThis.localStorage.setItem("activeGameSessionId", gameSessionId);
    } catch {
      // Ignore
    }

    setSettings(settingsData);
    setWorldMap(generatedMap);

    // Find the starting town and mark it explored
    const startPos = findStartingTown(generatedMap);
    const startRow = generatedMap[startPos.y];
    const startTile = startRow?.[startPos.x];
    if (startTile) {
      startTile.isExplored = true;
    }
    setPlayerPosition(startPos);

    void navigate({ to: "/game/heroes" });
  }, [
    shortDescription,
    grimnessLevel,
    darknessLevel,
    magicLevel,
    technologyLevel,
    responseVerbosity,
    campaignGoal,
    milestones,
    generatedMap,
    worldSeed,
    selectedTemplate,
    setSettings,
    setWorldMap,
    setPlayerPosition,
    navigate,
  ]);

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <h1>New Game Setup</h1>
        <p>Configure your adventure&apos;s world and narrative style below.</p>

        {/* Story Configuration */}
        <div className="mb-8">
          <h2>Story Configuration</h2>
          <p>Choose a template or write your own custom story setting.</p>

          <StoryTemplateGrid
            selectedTemplate={selectedTemplate}
            isAiGenerating={generateAI.isPending}
            aiError={aiError}
            onSelectTemplate={handleSelectTemplate}
            onSelectCustom={handleSelectCustom}
            onAiGenerate={handleAiGenerate}
          />

          {isTemplateLocked ? (
            <div className="p-[10px_14px] bg-[var(--shadow)] border border-[var(--primary)] rounded-lg mb-5 text-[0.85rem] text-[var(--text-secondary)]">
              &#x1F512; Story fields are locked to keep milestones in sync
              with map locations. Choose <strong>Custom Tale</strong> for full
              editing freedom.
            </div>
          ) : null}

          <StoryTextFields
            shortDescription={shortDescription}
            campaignGoal={campaignGoal}
            milestones={milestones}
            isLocked={isTemplateLocked}
            onDescriptionChange={setShortDescription}
            onGoalChange={setCampaignGoal}
            onMilestonesChange={setMilestones}
          />

          <WorldSettingsGrid
            grimnessLevel={grimnessLevel}
            darknessLevel={darknessLevel}
            magicLevel={magicLevel}
            technologyLevel={technologyLevel}
            responseVerbosity={responseVerbosity}
            disabled={isTemplateLocked}
            onGrimnessChange={setGrimnessLevel}
            onDarknessChange={setDarknessLevel}
            onMagicChange={setMagicLevel}
            onTechnologyChange={setTechnologyLevel}
            onVerbosityChange={setResponseVerbosity}
          />
        </div>

        {/* Map Generation */}
        <div className="mb-8">
          <h2>World Map</h2>
          <p>
            Generate a random world map for your adventure. Each map is unique
            with forests, mountains, and towns.
          </p>

          <div className="flex items-center gap-[10px] flex-wrap mb-[15px]">
            <label htmlFor="worldSeed" className="font-bold">
              World Seed:
            </label>
            <input
              id="worldSeed"
              type="number"
              value={worldSeed ?? ""}
              onChange={(e) => {
                setWorldSeed(e.target.value);
              }}
              placeholder="Leave empty for random"
              className="p-2 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] w-[150px]"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setWorldSeed(Math.floor(Math.random() * 1_000_000));
              }}
            >
              &#x1F3B2; Randomize
            </Button>
          </div>

          <Button type="button" onClick={handleGenerateMap} className="mb-4">
            {generatedMap
              ? "\uD83D\uDD04 Build Map from Seed"
              : "\uD83D\uDDFA\uFE0F Generate World Map"}
          </Button>

          {generatedMap ? (
            <span className="ml-3 text-[var(--success)] font-bold">
              &#x2713; Map generated!
            </span>
          ) : null}

          {showMapPreview && generatedMap ? (
            <div className="mt-5">
              <h3>Map Preview</h3>
              <p className="text-[0.85rem] text-[var(--text-secondary)] mb-3">
                <strong>Towns:</strong> &#x1F6D6; Hamlet | &#x1F3E1; Village
                | &#x1F3D8;&#xFE0F; Town | &#x1F3F0; City
                <br />
                <strong>Features:</strong> &#x1F332; Forest | &#x26F0;&#xFE0F;
                Mountain
              </p>
              <WorldMapDisplay
                mapData={generatedMap}
                playerPosition={{ x: 0, y: 0 }}
                onTileClick={Function.prototype as (x: number, y: number) => void}
              />
            </div>
          ) : null}
        </div>

        {/* AI Configuration */}
        <div className="text-center my-10 p-5 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-[0_4px_12px_var(--shadow)]">
          <h4 className="m-0 mb-[10px] text-[var(--text-secondary)] text-[0.8rem] uppercase tracking-[1px]">
            &#x1F916; Global AI Configuration
          </h4>
          <p className="m-0 mb-[15px] text-[0.9rem] text-[var(--text)]">
            Current: <strong>{selectedProvider}</strong> /{" "}
            <strong>{selectedModel}</strong>
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSettingsModalOpen(true);
            }}
          >
            &#x2699;&#xFE0F; Technical AI Settings
          </Button>
        </div>

        {/* Submit */}
        <div className="flex justify-center gap-5 mt-5 pt-5 border-t border-[var(--border)]">
          {formError ? (
            <p className="text-[#ff5252] bg-[rgba(255,82,82,0.1)] border border-[#ff52524d] p-3 rounded-[4px] font-[family-name:var(--font-ui)] text-[0.9rem]">
              {formError}
            </p>
          ) : null}
          <Button onClick={handleSubmit}>Next: Select Heroes</Button>
        </div>
      </PageCard>
    </PageLayout>
  );
}

// ── StoryTextFields sub-component ───────────────────────────────────────────

interface StoryTextFieldsProps {
  readonly shortDescription: string;
  readonly campaignGoal: string;
  readonly milestones: Milestone[];
  readonly isLocked: boolean;
  readonly onDescriptionChange: (value: string) => void;
  readonly onGoalChange: (value: string) => void;
  readonly onMilestonesChange: (milestones: Milestone[]) => void;
}

function StoryTextFields({
  shortDescription,
  campaignGoal,
  milestones,
  isLocked,
  onDescriptionChange,
  onGoalChange,
  onMilestonesChange,
}: StoryTextFieldsProps) {
  return (
    <div className="mb-5">
      <div className="mb-4">
        <label htmlFor="shortDescription" className={labelStyle}>
          Adventure Description
        </label>
        <textarea
          id="shortDescription"
          value={shortDescription}
          onChange={(e) => {
            onDescriptionChange(e.target.value);
          }}
          placeholder="e.g., A group of mercenaries investigating a haunted mine..."
          className={cn(textareaStyle, isLocked && lockedStyle)}
          readOnly={isLocked}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="campaignGoal" className={labelStyle}>
          Campaign Ultimate Goal
        </label>
        <textarea
          id="campaignGoal"
          value={campaignGoal}
          onChange={(e) => {
            onGoalChange(e.target.value);
          }}
          placeholder="e.g., Defeat the dragon terrorizing the kingdom..."
          className={cn(textareaStyle, "min-h-[60px]", isLocked && lockedStyle)}
          readOnly={isLocked}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="milestones" className={labelStyle}>
          Intermediate Milestones (one per line)
        </label>
        <textarea
          id="milestones"
          value={milestones.map((m) => m.text).join("\n")}
          onChange={(e) => {
            if (isLocked) return;
            const lines = e.target.value.split("\n");
            onMilestonesChange(
              lines.map((line, i) => {
                const existing = milestones[i];
                if (existing?.text === line) return existing;
                return { text: line, location: existing?.location ?? null };
              }),
            );
          }}
          placeholder={"e.g., Find the ancient key\nBribe the castle guard..."}
          className={cn(textareaStyle, "min-h-[80px]", isLocked && lockedStyle)}
          readOnly={isLocked}
        />
        {milestones.some((m) => m.location) ? (
          <div className="mt-2 text-[0.8rem] text-[var(--text-secondary)]">
            {milestones
              .filter((m) => m.text.trim())
              .map((m, i) => (
                <div
                  key={`milestone-${String(i)}`}
                  className="flex items-center gap-[6px] mb-1"
                >
                  <span className="opacity-70">{i + 1}.</span>
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {m.text}
                  </span>
                  {m.location ? (
                    <span className="text-[var(--primary)] font-bold whitespace-nowrap">
                      &#x1F4CD; {m.location}
                    </span>
                  ) : (
                    <span className="opacity-40 whitespace-nowrap">
                      No location
                    </span>
                  )}
                </div>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── JSON parsing helper ─────────────────────────────────────────────────────

/** Safely extract a string from an unknown JSON value. Returns fallback if not a string. */
function toStr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** Ported from GameSettings.js extractAndParseJson — zero behavioral changes */
function extractAndParseJson(str: string): Record<string, unknown> {
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI failed to provide a valid JSON object.");
  }

  const json = str.slice(start, end + 1);

  // Sanitize literal control characters inside JSON strings
  let sanitized = "";
  let inString = false;
  let escaped = false;
  for (const element of json) {
    const char = element;
    if (char === '"' && !escaped) inString = !inString;

    sanitized += inString && (char === "\n" || char === "\r") ? String.raw`\n` : char;
    escaped = char === "\\" && !escaped;
  }

  return JSON.parse(sanitized) as Record<string, unknown>;
}
