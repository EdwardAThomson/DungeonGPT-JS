/**
 * GameModals — renders all game modals together.
 *
 * Each modal is independently controlled by Zustand ui-store state.
 * Modals only mount when their open state is true (handled by Dialog).
 */

import { useCallback } from "react";

import type { CheckResult, DiceRollResult } from "@/game/dice/index";
import type { EncounterResolution } from "@/game/encounters/resolver";
import type { EncounterResult } from "@/pages/game/components/encounter/encounter-types";
import type { HeroMechanicalState } from "@/stores/game-store";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { addGold, addItem } from "@/game/inventory/index";
import { awardXP } from "@/game/progression/index";
import { DiceRoller } from "@/pages/game/components/dice-roller";
import { EncounterModal } from "@/pages/game/components/encounter/encounter-modal";
import { InventoryPanel } from "@/pages/game/components/inventory-panel";
import { CharacterModal } from "@/pages/game/modals/character-modal";
import { HelpModal } from "@/pages/game/modals/help-modal";
import { MapModal } from "@/pages/game/modals/map-modal";
import { SettingsModal } from "@/pages/game/modals/settings-modal";
import { useGameStore } from "@/stores/game-store";
import { useUiStore } from "@/stores/ui-store";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Type guard: check if result is a single-round EncounterResolution. */
function isEncounterResolution(
  result: EncounterResult,
): result is EncounterResolution {
  return "rollResult" in result;
}

/** Mutable partial for building updates. */
type MutablePartial<T> = { -readonly [P in keyof T]?: T[P] };

/** Extract rewards from the union result type. */
function getRewards(result: EncounterResult): { xp?: number; gold?: number; items?: readonly string[] } | null {
  if (isEncounterResolution(result)) return result.rewards;
  // EncounterSummary has rewards as { xp, gold, items }
  return result.rewards;
}

/** Extract penalties from the union result type. */
function getPenalties(result: EncounterResult): { goldLoss?: number } | null {
  if (isEncounterResolution(result)) return result.penalties;
  return null; // EncounterSummary penalties are string/object arrays, not structured
}

/** Apply encounter rewards (XP, gold, items) to hero state. */
function applyRewards(
  rewards: { xp?: number; gold?: number; items?: readonly string[] } | null,
  hero: { characterClass: string; characterName: string; stats: Record<string, number | undefined> },
  state: HeroMechanicalState,
  currentHP: number,
  addMessageFn: (msg: { role: "system"; content: string }) => void,
): MutablePartial<HeroMechanicalState> & { xpGained: number } {
  const updates: MutablePartial<HeroMechanicalState> = {};
  let xpGained = 0;

  if (!rewards) return { ...updates, xpGained };

  if (rewards.xp) {
    const xpResult = awardXP(
      {
        characterClass: hero.characterClass,
        stats: hero.stats,
        xp: state.xp,
        level: state.level,
        maxHP: state.maxHP,
        currentHP,
      },
      rewards.xp,
    );
    xpGained = rewards.xp;
    updates.xp = xpResult.character.xp ?? state.xp;
    updates.level = xpResult.newLevel;
    if (xpResult.leveledUp) {
      updates.maxHP = xpResult.character.maxHP ?? state.maxHP;
      updates.currentHP = xpResult.character.currentHP ?? state.maxHP;
      addMessageFn({
        role: "system",
        content: `${hero.characterName} reached level ${String(xpResult.newLevel)}!`,
      });
    }
  }

  if (rewards.gold) {
    updates.gold = addGold({ gold: state.gold }, rewards.gold).gold;
  }

  if (rewards.items) {
    let inv = state.inventory;
    for (const itemKey of rewards.items) {
      inv = addItem(inv, itemKey);
    }
    updates.inventory = inv;
  }

  return { ...updates, xpGained };
}

/** Build a dice roll system message from an encounter resolution. */
function buildDiceRollMessage(result: EncounterResolution): string | null {
  if (!result.rollResult) return null;
  const r = result.rollResult;
  const critTag = r.isCriticalSuccess
    ? " CRITICAL!"
    : r.isCriticalFailure
      ? " CRITICAL FAIL!"
      : "";
  return `d20: ${String(r.naturalRoll)} + ${String(r.modifier)} = ${String(r.total)}${critTag} — ${result.outcomeTier}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function GameModals() {
  // Encounter state
  const activeEncounter = useGameStore((s) => s.activeEncounter);
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const heroStates = useGameStore((s) => s.heroStates);
  const updateHeroState = useGameStore((s) => s.updateHeroState);
  const addEncounterHistoryEntry = useGameStore(
    (s) => s.addEncounterHistoryEntry,
  );
  const setActiveEncounter = useGameStore((s) => s.setActiveEncounter);
  const addMessage = useGameStore((s) => s.addMessage);

  // Check request state (for dice roller)
  const checkRequest = useGameStore((s) => s.checkRequest);
  const setCheckRequest = useGameStore((s) => s.setCheckRequest);

  // UI state
  const isEncounterModalOpen = useUiStore((s) => s.isEncounterModalOpen);
  const setEncounterModalOpen = useUiStore((s) => s.setEncounterModalOpen);
  const isInventoryModalOpen = useUiStore((s) => s.isInventoryModalOpen);
  const setInventoryModalOpen = useUiStore((s) => s.setInventoryModalOpen);
  const isDiceRollerOpen = useUiStore((s) => s.isDiceRollerOpen);
  const setDiceRollerOpen = useUiStore((s) => s.setDiceRollerOpen);

  const firstHero = selectedHeroes[0] ?? null;

  /** Handle encounter resolution results — applies HP, XP, loot, gold. */
  const handleEncounterResolve = useCallback(
    (result: EncounterResult & { heroIndex: number }) => {
      const hero = selectedHeroes[result.heroIndex] ?? firstHero;
      if (!hero) return;

      const heroId = hero.characterId;
      const state = heroStates[heroId];
      if (!state) return;

      const isResolution = isEncounterResolution(result);

      // Apply HP damage (only EncounterResolution has hpDamage)
      const hpDamage = isResolution ? result.hpDamage : 0;
      const newHP = hpDamage > 0
        ? Math.max(0, state.currentHP - hpDamage)
        : state.currentHP;

      // Apply rewards
      const rewards = getRewards(result);
      const { xpGained, ...rewardUpdates } = applyRewards(
        rewards,
        hero,
        state,
        newHP,
        addMessage,
      );

      const updates: MutablePartial<HeroMechanicalState> = { ...rewardUpdates };
      if (hpDamage > 0) {
        updates.currentHP = updates.currentHP ?? newHP;
      }

      // Apply penalties
      const penalties = getPenalties(result);
      if (penalties?.goldLoss && penalties.goldLoss > 0) {
        const currentGold = updates.gold ?? state.gold;
        updates.gold = Math.max(0, currentGold - penalties.goldLoss);
      }

      if (Object.keys(updates).length > 0) {
        updateHeroState(heroId, updates);
      }

      // Determine outcome label
      const outcomeTier = isResolution
        ? result.outcomeTier
        : (result.outcome ?? "success");

      // Add encounter history entry
      addEncounterHistoryEntry({
        name: activeEncounter?.name ?? "Unknown",
        outcome: outcomeTier,
        heroId,
        xpGained,
        timestamp: Date.now(),
      });

      // Surface dice roll as chat message (11.6.1)
      if (isResolution) {
        const rollMsg = buildDiceRollMessage(result);
        if (rollMsg) {
          addMessage({ role: "system", content: rollMsg });
        }
      }

      // Clear encounter state
      setActiveEncounter(null);
      setEncounterModalOpen(false);
    },
    [
      selectedHeroes,
      firstHero,
      heroStates,
      updateHeroState,
      addEncounterHistoryEntry,
      activeEncounter,
      addMessage,
      setActiveEncounter,
      setEncounterModalOpen,
    ],
  );

  const handleEncounterClose = useCallback(() => {
    setActiveEncounter(null);
    setEncounterModalOpen(false);
  }, [setActiveEncounter, setEncounterModalOpen]);

  // Auto-open dice roller when checkRequest is detected
  const effectiveDiceRollerOpen =
    isDiceRollerOpen || checkRequest !== null;

  const handleDiceRollerClose = useCallback(() => {
    setDiceRollerOpen(false);
    if (checkRequest) {
      setCheckRequest(null);
    }
  }, [setDiceRollerOpen, checkRequest, setCheckRequest]);

  const handleDiceRollComplete = useCallback(
    (result: DiceRollResult | CheckResult) => {
      if ("naturalRoll" in result) {
        const critTag = result.isCriticalSuccess
          ? " CRITICAL SUCCESS!"
          : result.isCriticalFailure
            ? " CRITICAL FAIL!"
            : "";
        addMessage({
          role: "system",
          content: `Skill check: d20 = ${String(result.naturalRoll)} + ${String(result.modifier)} = ${String(result.total)}${critTag}`,
        });
      } else {
        addMessage({
          role: "system",
          content: `Dice roll: ${String(result.total)} [${result.results.join(", ")}]`,
        });
      }
      if (checkRequest) {
        setCheckRequest(null);
      }
    },
    [addMessage, checkRequest, setCheckRequest],
  );

  return (
    <>
      <SettingsModal />
      <HelpModal />
      <CharacterModal />
      <MapModal />

      {/* Encounter Modal */}
      <EncounterModal
        isOpen={isEncounterModalOpen}
        onClose={handleEncounterClose}
        encounter={activeEncounter}
        character={firstHero}
        party={selectedHeroes}
        onResolve={handleEncounterResolve}
      />

      {/* Inventory Modal */}
      <Dialog
        open={isInventoryModalOpen}
        onOpenChange={(open) => {
          setInventoryModalOpen(open);
        }}
      >
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Inventory</DialogTitle>
          </DialogHeader>
          <InventoryPanel />
        </DialogContent>
      </Dialog>

      {/* Dice Roller */}
      <DiceRoller
        isOpen={effectiveDiceRollerOpen}
        onClose={handleDiceRollerClose}
        initialMode={checkRequest ? "skill" : "dice"}
        preselectedSkill={checkRequest?.skill ?? null}
        character={firstHero}
        onRollComplete={handleDiceRollComplete}
      />
    </>
  );
}
