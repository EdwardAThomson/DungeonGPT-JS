/**
 * Stat Block component — displays character ability scores.
 *
 * Visual style ported from src/App.css:
 *   - .party-member .stats-grid: 3-column grid, gap 5px 8px, 0.8rem
 *   - .party-member .stat-item: bg var(--bg), border var(--border),
 *     padding 3px 5px, rounded 3px, centered, nowrap
 *   - .stats-grid-modal: 3-column grid, gap 15px (full modal view)
 *   - .stat-item-modal: bg #f8f9fa, padding 10px, rounded 8px,
 *     flex-col center, border #e9ecef
 *   - .stat-label: 0.75rem, bold, #6c757d
 *   - .stat-value: 1.25rem, bold, #2c3e50
 */

import { cn } from "@/lib/utils";

interface StatBlockProps {
  readonly stats: Record<string, number>;
  readonly variant?: "compact" | "full";
  readonly className?: string;
}

const STAT_ABBREVIATIONS: Record<string, string> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};

export function StatBlock({
  stats,
  variant = "compact",
  className,
}: StatBlockProps) {
  const entries = Object.entries(stats);

  if (variant === "full") {
    return (
      <div className={cn("grid grid-cols-3 gap-4 mt-2.5", className)}>
        {entries.map(([name, value]) => (
          <div
            key={name}
            className={cn(
              "flex flex-col items-center",
              "bg-[#f8f9fa] p-2.5 rounded-lg",
              "border border-[#e9ecef]",
            )}
          >
            <span className="text-[0.75rem] font-bold text-[#6c757d] mb-0.5">
              {STAT_ABBREVIATIONS[name] ?? name.slice(0, 3).toUpperCase()}
            </span>
            <span className="text-[1.25rem] font-bold text-[#2c3e50]">
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Compact variant (sidebar)
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-[5px_8px] p-0 m-0 text-[0.8rem]",
        "text-[var(--text-secondary)]",
        className,
      )}
    >
      {entries.map(([name, value]) => (
        <div
          key={name}
          className={cn(
            "bg-[var(--bg)] border border-[var(--border)]",
            "py-[3px] px-[5px] rounded-[3px]",
            "text-center whitespace-nowrap",
          )}
        >
          {STAT_ABBREVIATIONS[name] ?? name.slice(0, 3).toUpperCase()}: {value}
        </div>
      ))}
    </div>
  );
}
