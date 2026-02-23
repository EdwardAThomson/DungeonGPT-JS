/**
 * EncounterModal — encounter action modal shell using shadcn Dialog.
 *
 * Ported from src/components/EncounterActionModal.js (707 lines).
 * Broken into: EncounterModal (shell + state), HeroSelection, CombatRound, CombatResult.
 * Uses game engine modules for encounter resolution and multi-round combat.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { CombatResult } from "./combat-result";
import { CombatRound } from "./combat-round";
import { HeroSelection } from "./hero-selection";

import type {
  EncounterData,
  EncounterResult,
  InitiativeResult,
  RoundResultWithDamage,
} from "./encounter-types";
import type { MultiRoundState } from "@/game/encounters/combat";
import type { SuggestedAction } from "@/game/encounters/data/encounter-templates";
import type { ResolverCharacter } from "@/game/encounters/resolver";
import type { Character } from "@dungeongpt/shared";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import {
  createMultiRoundEncounter,
  generateEncounterSummary,
  getRoundActions,
  resolveRound,
} from "@/game/encounters/combat";
import { resolveEncounter } from "@/game/encounters/resolver";
import { applyDamage } from "@/game/health/index";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";



/**
 * Internal character type that guarantees currentHP/maxHP are present.
 * This matches the runtime shape after initializeHP has been called.
 */
interface EncounterCharacter extends ResolverCharacter {
  readonly currentHP: number;
  readonly maxHP: number;
}

/** Safely convert a Character or null into an EncounterCharacter using heroStates. */
function toEncounterCharacter(
  char: Character | null,
  heroStates: Record<string, { currentHP: number; maxHP: number }>,
): EncounterCharacter {
  if (!char) {
    return { stats: {}, currentHP: 10, maxHP: 10 };
  }
  const state = heroStates[char.characterId];
  return {
    ...char,
    stats: char.stats,
    currentHP: state?.currentHP ?? 10,
    maxHP: state?.maxHP ?? 10,
  };
}

interface EncounterModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly encounter: EncounterData | null;
  readonly character: Character | null;
  readonly party?: readonly Character[] | null;
  readonly onResolve?: (result: EncounterResult & { heroIndex: number }) => void;
  readonly onCharacterUpdate?: (character: Character) => void;
}

export function EncounterModal({
  isOpen,
  onClose,
  encounter,
  character,
  party = null,
  onResolve,
  onCharacterUpdate,
}: EncounterModalProps) {
  const heroStates = useGameStore((s) => s.heroStates);
  const settings = useSettingsStore((s) => s.settings);

  // State
  const [, setSelectedAction] = useState<SuggestedAction | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult] = useState<EncounterResult | null>(null);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState(0);
  const [initiativeResult, setInitiativeResult] =
    useState<InitiativeResult | null>(null);
  const [showHeroSelection, setShowHeroSelection] = useState(true);
  const [heroConfirmed, setHeroConfirmed] = useState(false);
  const [currentCharacter, setCurrentCharacter] =
    useState<EncounterCharacter>(() => toEncounterCharacter(character, heroStates));

  // Multi-round state
  const [isMultiRound, setIsMultiRound] = useState(false);
  const [roundState, setRoundState] = useState<MultiRoundState | null>(null);
  const [roundResults, setRoundResults] = useState<
    { round: number; result: RoundResultWithDamage }[]
  >([]);
  const [currentRoundResult, setCurrentRoundResult] =
    useState<RoundResultWithDamage | null>(null);

  // Track which encounter we've initialized for
  const initializedEncounterRef = useRef<string | null>(null);

  // Initialize state when modal opens with a NEW encounter
  useEffect(() => {
    if (isOpen && encounter) {
      const encounterId = encounter.name + encounter.description;
      if (initializedEncounterRef.current !== encounterId) {
        initializedEncounterRef.current = encounterId;
        const initChar = toEncounterCharacter(character, heroStates);
        setCurrentCharacter(initChar);
        setSelectedHeroIndex(0);
        setInitiativeResult(null);
        setResult(null);
        setSelectedAction(null);
        setRoundResults([]);
        setCurrentRoundResult(null);

        const needsHeroSelection = party != null && party.length > 1;
        setShowHeroSelection(needsHeroSelection);
        setHeroConfirmed(!needsHeroSelection);

        if (!needsHeroSelection && encounter.multiRound) {
          setIsMultiRound(true);
          setRoundState(
            createMultiRoundEncounter(encounter, initChar, settings),
          );
        } else if (needsHeroSelection) {
          setIsMultiRound(false);
          setRoundState(null);
        } else {
          setIsMultiRound(false);
          setRoundState(null);
        }
      }
    } else if (!isOpen) {
      initializedEncounterRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ported dependency list
  }, [isOpen, encounter]);

  const handleHeroConfirm = useCallback(
    (heroIndex: number, initiative: InitiativeResult) => {
      setInitiativeResult(initiative);
      const actingHero = party
        ? (party[initiative.actualHeroIndex] ?? character)
        : character;
      const initChar = toEncounterCharacter(actingHero, heroStates);
      setCurrentCharacter(initChar);
      setSelectedHeroIndex(heroIndex);
      setHeroConfirmed(true);
      setShowHeroSelection(false);

      if (encounter?.multiRound) {
        setIsMultiRound(true);
        setRoundState(
          createMultiRoundEncounter(encounter, initChar, settings),
        );
      }
    },
    [party, character, heroStates, encounter, settings],
  );

  const handleAction = useCallback(
    async (action: SuggestedAction) => {
      if (!encounter) return;
      setSelectedAction(action);
      setIsResolving(true);

      try {
        if (isMultiRound && roundState) {
          const { roundResult, updatedState } = await resolveRound(
            roundState,
            action.label,
          );

          if (roundResult.hpDamage > 0) {
            const updatedChar = applyDamage(currentCharacter, roundResult.hpDamage);
            setCurrentCharacter(updatedChar as unknown as EncounterCharacter);
            onCharacterUpdate?.(updatedChar as unknown as Character);
          }

          setCurrentRoundResult(roundResult as RoundResultWithDamage);
          const completedRound =
            updatedState.roundHistory.at(-1);
          if (completedRound) {
            setRoundResults((prev) => [
              ...prev,
              { round: completedRound.round, result: roundResult as RoundResultWithDamage },
            ]);
          }
          setRoundState(updatedState);

          if (updatedState.isResolved) {
            const summary = generateEncounterSummary(updatedState);
            setResult(summary);
          }
        } else {
          const outcome = await resolveEncounter(
            encounter,
            action.label,
            currentCharacter,
            settings,
          );

          if (outcome.hpDamage > 0) {
            const updatedChar = applyDamage(currentCharacter, outcome.hpDamage);
            setCurrentCharacter(updatedChar as unknown as EncounterCharacter);
            onCharacterUpdate?.(updatedChar as unknown as Character);
          }

          setResult(outcome);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setResult({
          narration: `An error occurred while resolving the encounter: ${message}`,
          rollResult: null,
          outcomeTier: "failure",
          rewards: null,
          penalties: { messages: ["Encounter resolution failed"], goldLoss: 0, itemsLost: [] },
          affectedFactions: null,
          hpDamage: 0,
          damageDescription: null,
        });
      } finally {
        setIsResolving(false);
      }
    },
    [
      encounter,
      isMultiRound,
      roundState,
      currentCharacter,
      settings,
      onCharacterUpdate,
    ],
  );

  const handleNextRound = useCallback(() => {
    setCurrentRoundResult(null);
    setSelectedAction(null);
  }, []);

  const handleFleeEncounter = useCallback(() => {
    const fleeRoll = Math.random();
    const fleeSuccess = fleeRoll > 0.3;

    if (fleeSuccess) {
      setResult({
        narration: `${currentCharacter.characterName ?? "Hero"} successfully breaks away from combat and flees to safety.`,
        rollResult: null,
        outcomeTier: "success",
        rewards: null,
        penalties: { messages: ["Fled from combat"], goldLoss: 0, itemsLost: [] },
        affectedFactions: null,
        hpDamage: 0,
        damageDescription: null,
      });
    } else {
      const maxHP = currentCharacter.maxHP;
      const fleeDamage = Math.floor(maxHP * 0.15);
      const goldLoss = Math.floor(Math.random() * 10) + 5;

      const updatedChar = applyDamage(currentCharacter, fleeDamage);
      setCurrentCharacter(updatedChar as unknown as EncounterCharacter);
      onCharacterUpdate?.(updatedChar as unknown as Character);

      setResult({
        narration: `${currentCharacter.characterName ?? "Hero"} attempts to flee but is caught! They take ${String(fleeDamage)} damage escaping.`,
        rollResult: null,
        outcomeTier: "failure",
        rewards: null,
        penalties: {
          messages: [
            "Failed to flee cleanly",
            `Took ${String(fleeDamage)} damage`,
            `Lost ${String(goldLoss)} gold in the chaos`,
          ],
          goldLoss,
          itemsLost: [],
        },
        affectedFactions: null,
        hpDamage: fleeDamage,
        damageDescription: null,
      });
    }
  }, [currentCharacter, onCharacterUpdate]);

  const handleClaimVictory = useCallback(() => {
    if (!roundState) return;
    const summary = generateEncounterSummary(roundState);
    setResult(summary);
  }, [roundState]);

  const handleContinue = useCallback(() => {
    if (onResolve && result) {
      onResolve({
        ...result,
        heroIndex: initiativeResult
          ? initiativeResult.actualHeroIndex
          : party
            ? selectedHeroIndex
            : 0,
      });
    }
    setSelectedAction(null);
    setResult(null);
    setIsMultiRound(false);
    setRoundState(null);
    setRoundResults([]);
    setCurrentRoundResult(null);
    setShowHeroSelection(true);
    setHeroConfirmed(false);
    setInitiativeResult(null);
    onClose();
  }, [
    onResolve,
    result,
    initiativeResult,
    party,
    selectedHeroIndex,
    onClose,
  ]);

  if (!encounter) return null;

  const isDefeated = currentCharacter.currentHP <= 0;

  const availableActions =
    isMultiRound && roundState && !currentRoundResult
      ? getRoundActions(roundState)
      : encounter.suggestedActions;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="sr-only">Encounter</DialogTitle>
        </DialogHeader>

        {showHeroSelection &&
        !heroConfirmed &&
        party != null &&
        party.length > 1 ? (
          <HeroSelection
            encounter={encounter}
            party={party}
            onConfirm={handleHeroConfirm}
            onFlee={onClose}
          />
        ) : result ? (
          <CombatResult
            encounter={encounter}
            result={result}
            isDefeated={isDefeated}
            onContinue={handleContinue}
          />
        ) : (
          <CombatRound
            encounter={encounter}
            currentCharacter={currentCharacter}
            isMultiRound={isMultiRound}
            roundState={roundState}
            currentRoundResult={currentRoundResult}
            roundResults={roundResults}
            availableActions={availableActions}
            initiativeResult={initiativeResult}
            isResolving={isResolving}
            isDefeated={isDefeated}
            onAction={(action) => { void handleAction(action); }}
            onNextRound={handleNextRound}
            onFlee={handleFleeEncounter}
            onClaimVictory={handleClaimVictory}
            onRetreat={handleContinue}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
