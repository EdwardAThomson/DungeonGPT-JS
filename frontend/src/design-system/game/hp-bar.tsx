/**
 * HP Bar component — displays a character's hit point bar.
 *
 * Visual style ported from src/pages/Game.js inline styles (lines 686-719)
 * and src/App.css (.character-hp-display, .hp-bar-container, .hp-bar-fill,
 * .encounter-hp-bar, .hp-label).
 *
 * Layout:
 *   - Label row: "HP:" left, "currentHP/maxHP" right (colored by status)
 *   - Bar: 12px height, var(--border) bg, rounded-md, fill color by HP %
 *   - Optional low-HP warning text
 *   - Optional defeated indicator
 *
 * HP color thresholds (from healthSystem.js getHPStatus):
 *   > 75%: #27ae60 (green)
 *   > 50%: #f1c40f (yellow)
 *   > 25%: #e67e22 (orange)
 *   <= 25%: #e74c3c (red)
 *   === 0: #e74c3c (defeated)
 */

import { cn } from "@/lib/utils";

interface HpBarProps {
  readonly currentHP: number;
  readonly maxHP: number;
  readonly label?: string;
  readonly showWarning?: boolean;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
}

function getHpColor(currentHP: number, maxHP: number): string {
  if (maxHP <= 0 || currentHP <= 0) return "#e74c3c";
  const ratio = currentHP / maxHP;
  if (ratio > 0.75) return "#27ae60";
  if (ratio > 0.5) return "#f1c40f";
  if (ratio > 0.25) return "#e67e22";
  return "#e74c3c";
}

function getHpDescription(currentHP: number, maxHP: number): string {
  if (currentHP <= 0) return "Defeated";
  const ratio = currentHP / maxHP;
  if (ratio <= 0.25) return "Critically wounded";
  if (ratio <= 0.5) return "Bloodied";
  if (ratio <= 0.75) return "Lightly wounded";
  return "Healthy";
}

const sizeMap = {
  sm: "h-2",
  md: "h-3",
  lg: "h-5",
} as const;

export function HpBar({
  currentHP,
  maxHP,
  label = "HP",
  showWarning = true,
  size = "md",
  className,
}: HpBarProps) {
  const color = getHpColor(currentHP, maxHP);
  const percentage = maxHP > 0 ? Math.max(0, (currentHP / maxHP) * 100) : 0;
  const isLow = currentHP > 0 && currentHP <= maxHP * 0.25;
  const isDefeated = currentHP <= 0;

  return (
    <div
      className={cn(
        "p-2 rounded-md",
        "bg-[var(--surface-light,rgba(0,0,0,0.03))]",
        className,
      )}
    >
      {/* Label row */}
      <div className="flex justify-between items-center mb-1 text-xs">
        <span className="font-bold">{label}:</span>
        <span className="font-bold" style={{ color }}>
          {currentHP}/{maxHP}
        </span>
      </div>

      {/* Bar container */}
      <div
        className={cn(
          "w-full rounded-md overflow-hidden",
          "bg-[var(--border)] border border-[var(--border)]",
          sizeMap[size],
        )}
      >
        <div
          className="h-full rounded-[inherit] transition-[width] duration-500 ease-in-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Low HP warning */}
      {showWarning && isLow && (
        <div className="text-[10px] text-[#e74c3c] mt-1 italic">
          {getHpDescription(currentHP, maxHP)}
        </div>
      )}

      {/* Defeated indicator */}
      {isDefeated && (
        <div className="text-[10px] text-[#e74c3c] mt-1 font-bold">
          DEFEATED
        </div>
      )}
    </div>
  );
}
