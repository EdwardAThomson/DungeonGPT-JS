/**
 * StatsPanel — stat input grid with Max HP display.
 *
 * Ported from src/pages/CharacterCreation.js middle-right stats section.
 */

import type { CharacterStats } from "@dungeongpt/shared";

import { calculateMaxHP } from "@/game/health/index";
import { cn } from "@/lib/utils";


const statKeys: readonly (keyof CharacterStats)[] = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

interface StatsPanelProps {
  readonly stats: CharacterStats;
  readonly onStatChange: (stat: keyof CharacterStats, value: number) => void;
}

export function StatsPanel({ stats, onStatChange }: StatsPanelProps) {
  const maxHP = calculateMaxHP({ stats });

  return (
    <div>
      <h2 className="mt-0 mb-2">Stats</h2>
      <div>
        {statKeys.map((stat) => (
          <div
            key={stat}
            className="flex items-center gap-[10px] mb-3"
          >
            <label
              htmlFor={stat}
              className={cn(
                "w-[110px] mb-0 font-normal",
                "text-[var(--text-secondary)]",
                "font-[family-name:var(--font-header)] text-[0.85rem]",
                "tracking-[0.05em]",
              )}
            >
              {stat}:
            </label>
            <input
              type="number"
              id={stat}
              min={1}
              max={20}
              value={stats[stat]}
              onChange={(event) => {
                onStatChange(
                  stat,
                  Number.parseInt(event.target.value, 10) || 0,
                );
              }}
              className={cn(
                "w-[70px] mb-0 p-2",
                "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
                "rounded-[4px] box-border",
                "font-[family-name:var(--font-ui)] text-base",
                "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
              )}
              required
            />
          </div>
        ))}
      </div>
      <p className="mt-3">
        <span className="font-bold text-[var(--text)]">Max HP:</span>{" "}
        {maxHP}
      </p>
    </div>
  );
}
