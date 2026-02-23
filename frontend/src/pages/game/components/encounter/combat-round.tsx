/**
 * CombatRound — displays current round state and action results.
 *
 * Ported from EncounterActionModal.js lines 372-593 (action phase).
 * Shows encounter header, HP bars, initiative message, action buttons.
 */

import { getOutcomeBadgeStyle, getOutcomeLabel } from "./encounter-types";

import type {
  EncounterData,
  InitiativeResult,
  MultiRoundState,
  RoundResultWithDamage,
  SuggestedAction,
} from "./encounter-types";
import type { ResolverCharacter } from "@/game/encounters/resolver";

import { DiceResult } from "@/design-system/game/dice-result";
import { HpBar } from "@/design-system/game/hp-bar";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";



interface CombatRoundProps {
  readonly encounter: EncounterData;
  readonly currentCharacter: ResolverCharacter;
  readonly isMultiRound: boolean;
  readonly roundState: MultiRoundState | null;
  readonly currentRoundResult: RoundResultWithDamage | null;
  readonly roundResults: readonly {
    round: number;
    result: RoundResultWithDamage;
  }[];
  readonly availableActions: readonly SuggestedAction[];
  readonly initiativeResult: InitiativeResult | null;
  readonly isResolving: boolean;
  readonly isDefeated: boolean;
  readonly onAction: (action: SuggestedAction) => void;
  readonly onNextRound: () => void;
  readonly onFlee: () => void;
  readonly onClaimVictory: () => void;
  readonly onRetreat: () => void;
}

export function CombatRound({
  encounter,
  currentCharacter,
  isMultiRound,
  roundState,
  currentRoundResult,
  roundResults,
  availableActions,
  initiativeResult,
  isResolving,
  isDefeated,
  onAction,
  onNextRound,
  onFlee,
  onClaimVictory,
  onRetreat,
}: CombatRoundProps) {
  const charHP = currentCharacter.currentHP ?? 0;
  const charMaxHP = currentCharacter.maxHP ?? 10;

  return (
    <>
      {/* Encounter header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{encounter.icon}</span>
          <h2 className="text-[1.4rem] font-[family-name:var(--font-header)] text-[var(--primary)]">
            {encounter.name}
          </h2>
        </div>

        {isMultiRound && roundState ? (
          <div className="text-[0.85rem] text-[var(--text-secondary)] mb-2">
            Round {roundState.currentRound} of {roundState.maxRounds}
          </div>
        ) : null}

        {/* Initiative result notification */}
        {initiativeResult?.message ? (
          <div className="p-[10px] my-[10px] bg-[#ff9800] text-black rounded font-bold text-center">
            {initiativeResult.message}
          </div>
        ) : null}

        {/* Player HP Bar */}
        {charMaxHP > 0 ? (
          <HpBar
            currentHP={charHP}
            maxHP={charMaxHP}
            label={currentCharacter.characterName ?? "Hero"}
          />
        ) : null}

        {/* Enemy HP Bar */}
        {isMultiRound && roundState && roundState.enemyMaxHP > 0 ? (
          <div className="mt-2">
            <HpBar
              currentHP={Math.max(0, roundState.enemyCurrentHP)}
              maxHP={roundState.enemyMaxHP}
              label={encounter.name}
            />
          </div>
        ) : null}
      </div>

      {/* State-based content */}
      {isDefeated && !currentRoundResult ? (
        <DefeatedMidCombat onRetreat={onRetreat} />
      ) : roundState &&
        roundState.enemyCurrentHP <= 0 &&
        !currentRoundResult ? (
        <VictoryBanner encounter={encounter} onClaimVictory={onClaimVictory} />
      ) : currentRoundResult ? (
        <RoundResult
          encounter={encounter}
          roundResult={currentRoundResult}
          roundState={roundState}
          onNextRound={onNextRound}
          onAction={onAction}
        />
      ) : (
        <ActionPhase
          encounter={encounter}
          roundResults={roundResults}
          availableActions={availableActions}
          isResolving={isResolving}
          isMultiRound={isMultiRound}
          roundState={roundState}
          onAction={onAction}
          onFlee={onFlee}
        />
      )}

      {/* Resolving indicator */}
      {isResolving ? (
        <div className="text-center mt-4 text-[var(--text-secondary)]">
          <p>Resolving encounter...</p>
        </div>
      ) : null}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DefeatedMidCombat({
  onRetreat,
}: {
  readonly onRetreat: () => void;
}) {
  return (
    <div className="text-center">
      <h3 className="text-[#e74c3c] m-0 mb-[10px]">You are defeated!</h3>
      <p>You cannot continue fighting in your current condition.</p>
      <Button
        onClick={onRetreat}
        className="mt-4"
        style={{ background: "#e74c3c" }}
      >
        Retreat from Combat
      </Button>
    </div>
  );
}

function VictoryBanner({
  encounter,
  onClaimVictory,
}: {
  readonly encounter: EncounterData;
  readonly onClaimVictory: () => void;
}) {
  return (
    <div className="text-center">
      <h3 className="text-[#27ae60] m-0 mb-[10px]">Victory!</h3>
      <p>The {encounter.name.toLowerCase()} has been defeated!</p>
      <Button
        onClick={onClaimVictory}
        className="mt-4"
        style={{ background: "#27ae60" }}
      >
        Claim Victory
      </Button>
    </div>
  );
}

function RoundResult({
  encounter,
  roundResult,
  roundState,
  onNextRound,
  onAction,
}: {
  readonly encounter: EncounterData;
  readonly roundResult: RoundResultWithDamage;
  readonly roundState: MultiRoundState | null;
  readonly onNextRound: () => void;
  readonly onAction: (action: SuggestedAction) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "text-center text-[1.2rem] mb-3",
          getOutcomeBadgeStyle(roundResult.outcomeTier),
        )}
      >
        {getOutcomeLabel(roundResult.outcomeTier)}
      </div>

      {roundResult.rollResult ? (
        <DiceResult
          total={roundResult.rollResult.total}
          breakdown={`d20: ${String(roundResult.rollResult.naturalRoll)} + modifier: ${String(roundResult.rollResult.modifier)}`}
          variant="inline"
        />
      ) : null}

      <div className="text-[0.9rem] my-3 text-[var(--text)]">
        {roundResult.narration}
      </div>

      {/* Damage summary */}
      <div className="flex gap-4 mb-4">
        {(roundResult.enemyDamage ?? 0) > 0 ? (
          <div className="flex-1 text-center">
            <h4 className="text-[0.85rem]">Damage Dealt</h4>
            <div className="text-[#f39c12] text-[1.5rem] font-bold">
              {roundResult.enemyDamage} HP
            </div>
            <p className="text-[0.8rem] text-[var(--text-secondary)]">
              You strike the {encounter.name.toLowerCase()}!
            </p>
          </div>
        ) : null}
        {roundResult.hpDamage > 0 ? (
          <div className="flex-1 text-center">
            <h4 className="text-[0.85rem]">Damage Taken</h4>
            <div className="text-[#e74c3c] text-[1.5rem] font-bold">
              {roundResult.hpDamage} HP
            </div>
            <p className="text-[0.8rem] text-[var(--text-secondary)]">
              The {encounter.name.toLowerCase()} strikes back!
            </p>
          </div>
        ) : null}
      </div>

      {/* Combat status */}
      {roundState ? (
        <div className="text-[0.85rem] text-[var(--text-secondary)] mb-4">
          <div>
            Enemy Morale: {Math.max(0, roundState.enemyMorale)}%
          </div>
          <div>
            Your Advantage:{" "}
            {roundState.playerAdvantage > 0 ? "+" : ""}
            {roundState.playerAdvantage}
          </div>
        </div>
      ) : null}

      {/* Continue buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => {
            onNextRound();
            const fightAction = encounter.suggestedActions.find(
              (a) => a.label === "Fight",
            );
            if (fightAction) {
              setTimeout(() => { onAction(fightAction); }, 50);
            }
          }}
        >
          Fight!
        </Button>
        <Button variant="secondary" onClick={onNextRound}>
          Choose Action
        </Button>
      </div>
    </>
  );
}

function ActionPhase({
  encounter,
  roundResults,
  availableActions,
  isResolving,
  isMultiRound,
  roundState,
  onAction,
  onFlee,
}: {
  readonly encounter: EncounterData;
  readonly roundResults: readonly {
    round: number;
    result: RoundResultWithDamage;
  }[];
  readonly availableActions: readonly SuggestedAction[];
  readonly isResolving: boolean;
  readonly isMultiRound: boolean;
  readonly roundState: MultiRoundState | null;
  readonly onAction: (action: SuggestedAction) => void;
  readonly onFlee: () => void;
}) {
  return (
    <>
      <p className="text-[0.9rem] text-[var(--text-secondary)] mb-4">
        {encounter.description}
      </p>

      {roundResults.length > 0 ? (
        <div className="mb-4 text-[0.85rem]">
          <h4 className="mb-1">Previous Rounds:</h4>
          {roundResults.map((r, idx) => (
            <div
              key={`round-${String(idx)}`}
              className="text-[var(--text-secondary)]"
            >
              <strong>Round {r.round}:</strong> {r.result.outcomeTier}
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h3 className="text-[1rem] font-[family-name:var(--font-header)] mb-3">
          What do you do?
        </h3>
        <div className="flex flex-col gap-2">
          {availableActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => { onAction(action); }}
              disabled={isResolving}
              className={cn(
                "p-3 border border-[var(--border)] rounded-lg text-left",
                "bg-[var(--surface)] hover:border-[var(--primary)]",
                "transition-all duration-200 cursor-pointer",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <div className="flex items-center gap-2">
                <strong>{action.label}</strong>
                {action.skill ? (
                  <span className="text-[0.8rem] text-[var(--text-secondary)]">
                    ({action.skill})
                  </span>
                ) : null}
              </div>
              <p className="text-[0.85rem] text-[var(--text-secondary)] m-0 mt-1">
                {action.description}
              </p>
            </button>
          ))}
        </div>

        {/* Flee button for multi-round encounters */}
        {isMultiRound && roundState && !roundState.isResolved ? (
          <Button
            variant="secondary"
            onClick={onFlee}
            disabled={isResolving}
            className="mt-4 w-full"
            style={{ background: "#e67e22", borderColor: "#d35400" }}
          >
            Attempt to Flee (70% success, risks damage/gold loss)
          </Button>
        ) : null}
      </div>
    </>
  );
}
