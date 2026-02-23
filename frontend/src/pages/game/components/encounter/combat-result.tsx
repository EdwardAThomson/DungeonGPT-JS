/**
 * CombatResult — displays the final result of a resolved encounter.
 *
 * Ported from EncounterActionModal.js lines 603-700 (result phase).
 * Shows outcome, dice roll, narration, rewards, penalties, faction changes.
 */

import { getOutcomeBadgeStyle, getOutcomeLabel } from "./encounter-types";

import type { EncounterData, EncounterResult } from "./encounter-types";

import { DiceResult } from "@/design-system/game/dice-result";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";



interface CombatResultProps {
  readonly encounter: EncounterData;
  readonly result: EncounterResult;
  readonly isDefeated: boolean;
  readonly onContinue: () => void;
}

export function CombatResult({
  encounter,
  result,
  isDefeated,
  onContinue,
}: CombatResultProps) {
  // Defeat state takes priority
  if (isDefeated) {
    return (
      <DefeatScreen onContinue={onContinue} />
    );
  }

  return (
    <VictoryScreen
      encounter={encounter}
      result={result}
      onContinue={onContinue}
    />
  );
}

// ── Defeat sub-component ─────────────────────────────────────────────────

function DefeatScreen({ onContinue }: { readonly onContinue: () => void }) {
  return (
    <>
      <div className="text-center mb-5">
        <span className="text-[3rem]">{"\uD83D\uDC80"}</span>
        <h2 className="text-[1.4rem] font-[family-name:var(--font-header)] text-[#e74c3c]">
          Defeated!
        </h2>
      </div>

      <div className="text-center mb-5">
        <p>
          Your wounds have overcome you. You collapse, unable to continue the
          fight.
        </p>
        <p className="mt-4 italic text-[var(--text-secondary)]">
          You need rest and healing before you can face more dangers.
        </p>
      </div>

      <div className="mb-5 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <h4>Consequences of Defeat</h4>
        <ul className="text-[0.85rem] text-[var(--text-secondary)]">
          <li>Cannot engage in combat encounters</li>
          <li>Must find a safe place to rest</li>
          <li>Need healing or medical attention</li>
        </ul>
      </div>

      <Button
        onClick={onContinue}
        style={{ background: "#e74c3c" }}
        className="w-full"
      >
        Retreat to Safety
      </Button>
    </>
  );
}

// ── Victory sub-component ─────────────────────────────────────────────────

function VictoryScreen({
  encounter,
  result,
  onContinue,
}: {
  readonly encounter: EncounterData;
  readonly result: EncounterResult;
  readonly onContinue: () => void;
}) {
  // Cast for property access -- result can be EncounterResolution or EncounterSummary
  const asRecord = result as unknown as Record<string, unknown>;
  const outcomeTier = (asRecord["outcomeTier"] as string | undefined) ?? "success";
  const narration = (asRecord["narration"] as string | undefined) ?? "";
  const rollResult = asRecord["rollResult"] as {
    total: number;
    naturalRoll: number;
    modifier: number;
  } | null;
  const roundCount = asRecord["roundCount"] as number | undefined;
  const outcome = asRecord["outcome"] as string | undefined;
  const hpDamage = (asRecord["hpDamage"] as number | undefined) ?? 0;
  const damageDescription = asRecord["damageDescription"] as
    | string
    | undefined;
  const rewards = asRecord["rewards"] as {
    xp?: number;
    gold?: number;
    items?: string[];
  } | null;
  const penalties = asRecord["penalties"] as
    | string[]
    | { messages?: string[]; goldLoss?: number; itemsLost?: string[] }
    | null;
  const affectedFactions = asRecord["affectedFactions"] as Record<
    string,
    number
  > | null;

  return (
    <>
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">{encounter.icon}</span>
          <h2 className="text-[1.4rem] font-[family-name:var(--font-header)] text-[var(--primary)]">
            {encounter.name}
          </h2>
        </div>

        <div
          className={cn(
            "text-[1.2rem] mt-2",
            getOutcomeBadgeStyle(outcomeTier),
          )}
        >
          {getOutcomeLabel(outcomeTier)}
        </div>
      </div>

      {rollResult ? (
        <DiceResult
          total={rollResult.total}
          breakdown={`d20: ${String(rollResult.naturalRoll)} + modifier: ${String(rollResult.modifier)}`}
          variant="inline"
        />
      ) : null}

      {roundCount ? (
        <div className="text-center text-[0.85rem] text-[var(--text-secondary)] mb-3">
          Resolved in {roundCount} round{roundCount > 1 ? "s" : ""}
        </div>
      ) : null}

      {/* Narration */}
      <div className="text-[0.9rem] my-4 whitespace-pre-line text-[var(--text)]">
        {narration}
      </div>

      {outcome ? (
        <div className="text-center text-[0.85rem] font-bold mb-3">
          Final Outcome: {outcome.toUpperCase()}
        </div>
      ) : null}

      {/* HP Damage */}
      {hpDamage > 0 ? (
        <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg mb-3">
          <h4 className="text-[0.85rem]">Health Impact</h4>
          <div className="text-[#e74c3c] text-[1.3rem] font-bold">
            -{hpDamage} HP
          </div>
          {damageDescription ? (
            <p className="text-[0.8rem] text-[var(--text-secondary)]">
              {damageDescription}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Rewards */}
      {rewards ? (
        <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg mb-3">
          <h4 className="text-[0.85rem]">Rewards</h4>
          <ul className="text-[0.85rem]">
            {(rewards.xp ?? 0) > 0 ? (
              <li>+{rewards.xp} XP</li>
            ) : null}
            {(rewards.gold ?? 0) > 0 ? (
              <li>+{rewards.gold} gold</li>
            ) : null}
            {rewards.items?.map((item, idx) => (
              <li key={`item-${String(idx)}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Penalties */}
      {penalties ? (
        <PenaltiesDisplay penalties={penalties} />
      ) : null}

      {/* Faction changes */}
      {affectedFactions ? (
        <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg mb-3">
          <h4 className="text-[0.85rem]">Reputation Changes</h4>
          <ul className="text-[0.85rem]">
            {Object.entries(affectedFactions).map(([faction, change]) => (
              <li key={faction}>
                {faction}: {change > 0 ? "+" : ""}
                {change}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button onClick={onContinue} className="w-full mt-4">
        Continue Journey
      </Button>
    </>
  );
}

// ── Penalties sub-component ──────────────────────────────────────────────

function PenaltiesDisplay({
  penalties,
}: {
  readonly penalties:
    | string[]
    | { messages?: string[]; goldLoss?: number; itemsLost?: string[] };
}) {
  // Handle both array and object formats for penalties (ported as-is)
  const penaltyMessages = Array.isArray(penalties)
    ? penalties
    : (penalties.messages ?? []);

  if (penaltyMessages.length === 0) return null;

  return (
    <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg mb-3">
      <h4 className="text-[0.85rem]">Consequences</h4>
      <ul className="text-[0.85rem] text-[var(--text-secondary)]">
        {penaltyMessages.map((penalty, idx) => (
          <li key={`penalty-${String(idx)}`}>{penalty}</li>
        ))}
      </ul>
    </div>
  );
}
