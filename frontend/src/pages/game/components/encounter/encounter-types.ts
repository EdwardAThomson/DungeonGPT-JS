/**
 * Shared types for encounter UI components.
 * Extracted from EncounterActionModal.js.
 */

import type {
  EncounterSummary,
  
} from "@/game/encounters/combat";
import type { RolledEncounter } from "@/game/encounters/generator";
import type {
  EncounterResolution,
  ResolverCharacter,
} from "@/game/encounters/resolver";
import type { Character } from "@dungeongpt/shared";

/** The encounter data shape used by the modal. */
export type EncounterData = RolledEncounter;

/** Initiative check result. */
export interface InitiativeResult {
  readonly success: boolean;
  readonly actualHeroIndex: number;
  readonly message: string | null;
}

/** Full resolution result (single-round or multi-round summary). */
export type EncounterResult = EncounterResolution | EncounterSummary;

/** Result with hero index for passing back to the game. */
export type EncounterResultWithHero = EncounterResult & {
  readonly heroIndex: number;
};

/** Outcome tier for badge display. */
export type OutcomeTierLabel =
  | "criticalSuccess"
  | "success"
  | "failure"
  | "criticalFailure";

/** Map outcome tier to CSS class name. */
export function getOutcomeBadgeStyle(tier: string): string {
  const styles: Record<string, string> = {
    criticalSuccess: "text-[#27ae60] font-bold",
    success: "text-[#2ecc71] font-bold",
    failure: "text-[#e74c3c] font-bold",
    criticalFailure: "text-[#c0392b] font-bold",
  };
  return styles[tier] ?? "font-bold";
}

/** Map outcome tier to display label. */
export function getOutcomeLabel(tier: string): string {
  const labels: Record<string, string> = {
    criticalSuccess: "Critical Success!",
    success: "Success",
    failure: "Failure",
    criticalFailure: "Critical Failure!",
  };
  return labels[tier] ?? tier;
}

/** Props shared by encounter sub-components. */
export interface EncounterBaseProps {
  readonly encounter: EncounterData;
  readonly currentCharacter: ResolverCharacter & Partial<Character>;
  readonly party?: readonly Character[] | null;
}

/** Round result with damage info for multi-round combat. */
export interface RoundResultWithDamage extends EncounterResolution {
  readonly enemyDamage?: number;
  readonly enemyCurrentHP?: number;
  readonly enemyMaxHP?: number;
}



export {type Character} from "@dungeongpt/shared";
export {type EncounterResolution} from "@/game/encounters/resolver";
export {type MultiRoundState, type EncounterSummary} from "@/game/encounters/combat";
export {type SuggestedAction} from "@/game/encounters/data/encounter-templates";