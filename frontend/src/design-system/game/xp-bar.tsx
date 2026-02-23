/**
 * XP Bar component — displays a character's experience point progress.
 *
 * Visual style ported from src/pages/Game.js inline styles (lines 723-757):
 *   - Container: margin 8px 0, padding 8px, bg var(--surface-light), rounded 6px
 *   - Label row: "XP:" left, "{xp} (Lvl {level})" right in gold (#f1c40f)
 *   - Bar: 8px height, bg #2c3e50, rounded 4px
 *   - Fill: gradient linear-gradient(90deg, #f39c12, #f1c40f)
 *
 * XP thresholds from progressionSystem.js:
 *   [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000]
 *
 * NOTE: These thresholds are duplicated here for display only.
 * The canonical values live in the game engine (progressionSystem).
 * This component is presentation — it does not mutate XP.
 */

import { cn } from "@/lib/utils";

/**
 * XP thresholds by level (index = level - 1).
 * Ported exactly from Game.js and progressionSystem.js.
 */
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14_000, 23_000, 34_000, 48_000, 64_000,
] as const;

interface XpBarProps {
  readonly xp: number;
  readonly level: number;
  readonly className?: string;
}

export function XpBar({ xp, level, className }: XpBarProps) {
  const currentThreshold = XP_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold =
    XP_THRESHOLDS[level] ?? XP_THRESHOLDS[level - 1] ?? 0;
  const isMaxLevel = level >= XP_THRESHOLDS.length;

  const progress =
    nextThreshold > currentThreshold
      ? ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100
      : 100;

  return (
    <div
      className={cn(
        "my-2 p-2 rounded-md",
        "bg-[var(--surface-light,rgba(0,0,0,0.03))]",
        className,
      )}
    >
      {/* Label row */}
      <div className="flex justify-between items-center mb-1 text-xs">
        <span className="font-bold">XP:</span>
        <span className="font-bold text-[#f1c40f]">
          {xp} (Lvl {level})
          {isMaxLevel ? " MAX" : ""}
        </span>
      </div>

      {/* Bar container */}
      <div className="w-full h-2 bg-[#2c3e50] rounded-[4px] overflow-hidden">
        <div
          className="h-full transition-[width] duration-500 ease-in-out"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            background: "linear-gradient(90deg, #f39c12, #f1c40f)",
          }}
        />
      </div>
    </div>
  );
}
