/**
 * useGamePrompts — prompt construction for AI requests.
 *
 * Ported from src/hooks/useGameInteraction.js prompt building logic.
 * Extracts prompt construction into a pure hook.
 */

import { useCallback } from "react";

import type { WorldMap } from "@/game/maps/world-generator";
import type { EncounterHistoryEntry, HeroMechanicalState } from "@/stores/game-store";
import type { Character, GameSettings, Milestone } from "@dungeongpt/shared";

import { getHPStatus } from "@/game/health/index";
import { getTile } from "@/game/maps/world-generator";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";


// ── Milestone helpers (ported as-is from useGameInteraction.js) ─────────────

/** Normalize milestones for backward compatibility. */
function normalizeMilestones(milestones: readonly Milestone[]): Milestone[] {
  if (milestones.length === 0) return [];
  // Already in object format
  if (typeof milestones[0] === "object" && "text" in milestones[0]) {
    return [...milestones];
  }
  // Legacy string array — convert
  return (milestones as unknown as string[]).map((text, index) => ({
    id: index + 1,
    text,
    completed: false,
    location: null,
  }));
}

/** Get milestone status for inclusion in prompts. */
export function getMilestoneStatus(milestones: readonly Milestone[]) {
  const normalized = normalizeMilestones(milestones);
  const completed = normalized.filter((m) => m.completed);
  const remaining = normalized.filter((m) => !m.completed);
  const current = remaining.length > 0 ? (remaining[0] ?? null) : null;
  return { current, completed, remaining, all: normalized };
}

/** Build party status section for AI prompts. */
function buildPartyStatusSection(
  heroes: readonly Character[],
  heroStates: Record<string, HeroMechanicalState>,
): string {
  if (Object.keys(heroStates).length === 0) return "";

  const lines: string[] = [];
  let totalGold = 0;

  for (const hero of heroes) {
    const state = heroStates[hero.characterId];
    if (!state) continue;

    const hpStatus = getHPStatus(state.currentHP, state.maxHP);
    const notableItems = state.inventory
      .filter((item) => item.rarity !== "common")
      .map((item) => item.name)
      .slice(0, 3);

    lines.push(
      `- ${hero.characterName} (${hero.characterClass} Lv${String(state.level)}): ${hpStatus.description} (${String(state.currentHP)}/${String(state.maxHP)} HP)${notableItems.length > 0 ? ` | Items: ${notableItems.join(", ")}` : ""}`,
    );
    totalGold += state.gold;
  }

  if (lines.length === 0) return "";
  lines.push(`- Party gold: ${String(totalGold)}`);
  return `\n[PARTY STATUS]\n${lines.join("\n")}`;
}

/** Build recent encounters section for AI prompts. */
function buildEncounterHistorySection(
  encounterHistory: readonly EncounterHistoryEntry[],
  heroes: readonly Character[],
): string {
  if (encounterHistory.length === 0) return "";

  const recent = encounterHistory.slice(-3);
  const heroNames = new Map<string, string>();
  for (const h of heroes) {
    heroNames.set(h.characterId, h.characterName);
  }

  const lines = recent.map(
    (e) =>
      `- ${e.name} — ${e.outcome} (${heroNames.get(e.heroId) ?? "Unknown"})`,
  );
  return `\n[RECENT ENCOUNTERS]\n${lines.join("\n")}`;
}

/** Build the adventure start prompt. */
function buildStartPrompt(
  settings: GameSettings,
  selectedHeroes: readonly Character[],
  worldMap: unknown,
  playerPosition: { x: number; y: number },
  currentSummary: string,
): string {
  const partyInfo = selectedHeroes
    .map((h) => `${h.characterName} (${h.characterClass})`)
    .join(", ");
  const currentTile = getTile(
    worldMap as WorldMap,
    playerPosition.x,
    playerPosition.y,
  );

  let locationInfo = `Player starts at coordinates (${String(playerPosition.x)}, ${String(playerPosition.y)}) in a ${currentTile?.biome ?? "Unknown Area"} biome.`;
  if (currentTile?.poi === "town" && currentTile.townName) {
    locationInfo += ` The party is standing at the edge of ${currentTile.townName}, a ${currentTile.townSize ?? "settlement"}.`;
  } else if (currentTile?.poi) {
    locationInfo += ` POI: ${currentTile.poi}.`;
  }

  const goalInfo = settings.campaignGoal
    ? `\nGoal of the Campaign: ${settings.campaignGoal}`
    : "";

  const milestoneStatus = getMilestoneStatus(settings.milestones);
  let milestonesInfo = "";
  if (milestoneStatus.current) {
    milestonesInfo += `\nCurrent Milestone: ${milestoneStatus.current.text}`;
    if (milestoneStatus.completed.length > 0) {
      milestonesInfo += `\nCompleted Milestones: ${milestoneStatus.completed.map((m) => m.text).join(", ")}`;
    }
    if (milestoneStatus.remaining.length > 1) {
      milestonesInfo += `\nRemaining Milestones: ${milestoneStatus.remaining
        .slice(1)
        .map((m) => m.text)
        .join(", ")}`;
    }
  }

  const gameContext = `Setting: ${settings.shortDescription || "A mystery fantasy world"}. Mood: ${settings.grimnessLevel || "Normal"} Intensity. Magic: ${settings.magicLevel}. Tech: ${settings.technologyLevel}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;

  return `[ADVENTURE START]\n\n[CONTEXT]\n${gameContext}\n\nCurrent Summary: ${currentSummary || "They stand ready at the journey's beginning."}\n\n[TASK]\nDescribe the arrival of the party and the immediate atmosphere of the scene. Present the initial situation to the players. Use the context provided to set the stage. Begin your response directly with the narrative description.`;
}

/** Build the regular interaction prompt. */
function buildInteractionPrompt(
  userMessage: string,
  settings: GameSettings,
  selectedHeroes: readonly Character[],
  worldMap: unknown,
  playerPosition: { x: number; y: number },
  currentSummary: string,
  heroStates: Record<string, HeroMechanicalState>,
  encounterHistory: readonly EncounterHistoryEntry[],
): string {
  const partyInfo = selectedHeroes
    .map((h) => `${h.characterName} (${h.characterClass})`)
    .join(", ");
  const currentTile = getTile(
    worldMap as WorldMap,
    playerPosition.x,
    playerPosition.y,
  );
  const locationInfo = `Player is at coordinates (${String(playerPosition.x)}, ${String(playerPosition.y)}) in a ${currentTile?.biome ?? "Unknown Area"} biome.${currentTile?.poi ? ` Point Of Interest: ${currentTile.poi}.` : ""}`;
  const goalInfo = settings.campaignGoal
    ? `\nGoal: ${settings.campaignGoal}`
    : "";

  const milestoneStatus = getMilestoneStatus(settings.milestones);
  let milestonesInfo = "";
  if (milestoneStatus.current) {
    milestonesInfo += `\nCurrent Milestone: ${milestoneStatus.current.text}`;
    if (milestoneStatus.completed.length > 0) {
      milestonesInfo += `\nCompleted: ${milestoneStatus.completed.map((m) => m.text).join(", ")}`;
    }
    if (milestoneStatus.remaining.length > 1) {
      milestonesInfo += `\nRemaining: ${milestoneStatus.remaining
        .slice(1)
        .map((m) => m.text)
        .join(", ")}`;
    }
  }

  const partyStatusSection = buildPartyStatusSection(selectedHeroes, heroStates);
  const encounterSection = buildEncounterHistorySection(encounterHistory, selectedHeroes);

  const gameContext = `Setting: ${settings.shortDescription || "Fantasy Realm"}. Mood: ${settings.grimnessLevel || "Normal"}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.${partyStatusSection}${encounterSection}`;

  return `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\n${currentSummary || "The tale unfolds."}\n\n[PLAYER ACTION]\n${userMessage}\n\n[NARRATE]`;
}

/** Build the summarization prompt. */
export function buildSummarizePrompt(
  summary: string,
  newMessages: readonly { role: string; content: string }[],
): string {
  const recentText = newMessages
    .map((msg) => `${msg.role === "ai" ? "AI" : "User"}: ${msg.content}`)
    .join("\n");
  return `You are a concise story summarizer. Combine the old summary with the recent exchange into a single brief summary (2-4 sentences) capturing key events, locations, and character actions. Output ONLY the summary text, nothing else.\n\nOld summary: ${summary || "The adventure begins."}\n\nRecent exchange:\n${recentText}\n\nNew summary:`;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useGamePrompts() {
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const worldMap = useGameStore((s) => s.worldMap);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const currentSummary = useGameStore((s) => s.currentSummary);
  const heroStates = useGameStore((s) => s.heroStates);
  const encounterHistory = useGameStore((s) => s.encounterHistory);
  const settings = useSettingsStore((s) => s.settings);

  const buildStart = useCallback(() => {
    if (!settings) {
      throw new Error("Settings not initialized");
    }
    return buildStartPrompt(
      settings,
      selectedHeroes,
      worldMap,
      playerPosition,
      currentSummary,
    );
  }, [settings, selectedHeroes, worldMap, playerPosition, currentSummary]);

  const buildInteraction = useCallback(
    (userMessage: string) => {
      if (!settings) {
        throw new Error("Settings not initialized");
      }
      return buildInteractionPrompt(
        userMessage,
        settings,
        selectedHeroes,
        worldMap,
        playerPosition,
        currentSummary,
        heroStates,
        encounterHistory,
      );
    },
    [settings, selectedHeroes, worldMap, playerPosition, currentSummary, heroStates, encounterHistory],
  );

  return { buildStart, buildInteraction };
}
