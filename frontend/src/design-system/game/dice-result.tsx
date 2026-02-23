/**
 * Dice Result component — displays the result of a dice roll.
 *
 * Visual style ported from src/App.css:
 *   - .roll-result: mt 20px, p 20px, bg var(--bg),
 *     border 1px solid var(--primary), rounded-lg, text-center
 *   - .roll-value: 3rem, Cinzel, var(--primary)
 *   - .roll-value.crit-success: #27ae60, text-shadow
 *   - .roll-value.crit-fail: #e74c3c
 *   - .roll-details: text-secondary, 0.9rem, mt 10px
 *   - .crit-text: block, bold, mt 5px
 *
 * Encounter dice result:
 *   - .dice-result: bg var(--surface-light), border 2px var(--border),
 *     rounded-lg, p 15px, flex center, gap 10px
 *   - .dice-icon: 24px
 *   - .roll-total: 32px bold var(--primary)
 *   - .roll-breakdown: 14px text-secondary
 */

import { cn } from "@/lib/utils";

type RollOutcome = "normal" | "critical-success" | "critical-failure";

interface DiceResultProps {
  readonly total: number;
  readonly breakdown?: string;
  readonly outcome?: RollOutcome;
  readonly critText?: string;
  readonly variant?: "standalone" | "inline";
  readonly className?: string;
}

const outcomeColors: Record<RollOutcome, string> = {
  normal: "text-[var(--primary)]",
  "critical-success": "text-[#27ae60]",
  "critical-failure": "text-[#e74c3c]",
};

export function DiceResult({
  total,
  breakdown,
  outcome = "normal",
  critText,
  variant = "standalone",
  className,
}: DiceResultProps) {
  if (variant === "inline") {
    // Encounter modal inline variant
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2.5",
          "bg-[var(--surface-light,rgba(0,0,0,0.03))]",
          "border-2 border-[var(--border)]",
          "rounded-lg p-4 mb-5",
          className,
        )}
      >
        <span className="text-2xl" aria-hidden>
          🎲
        </span>
        <span className={cn("text-[32px] font-bold", outcomeColors[outcome])}>
          {total}
        </span>
        {breakdown && (
          <span className="text-sm text-[var(--text-secondary)]">
            {breakdown}
          </span>
        )}
      </div>
    );
  }

  // Standalone variant (dice roller)
  return (
    <div
      className={cn(
        "mt-5 p-5",
        "bg-[var(--bg)]",
        "border border-[var(--primary)]",
        "rounded-lg text-center",
        className,
      )}
    >
      <span
        className={cn(
          "block text-[3rem] font-[family-name:var(--font-header)]",
          outcomeColors[outcome],
          outcome === "critical-success" &&
            "shadow-[0_0_10px_rgba(39,174,96,0.4)]",
        )}
      >
        {total}
      </span>

      {breakdown && (
        <span className="block text-[0.9rem] text-[var(--text-secondary)] mt-2.5">
          {breakdown}
        </span>
      )}

      {critText && (
        <span className="block font-bold mt-1.5">{critText}</span>
      )}
    </div>
  );
}
