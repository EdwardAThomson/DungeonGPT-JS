/**
 * HeroSidebar — party sidebar showing hero portraits, HP bars, XP bars.
 *
 * Ported from src/pages/Game.js party-bar section.
 * Uses design-system HpBar and XpBar components.
 */

import type { Character } from "@dungeongpt/shared";

import { HpBar } from "@/design-system/game/hp-bar";
import { XpBar } from "@/design-system/game/xp-bar";
import { sanitizeImageUrl } from "@/lib/sanitize-url";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import { useUiStore } from "@/stores/ui-store";


export function HeroSidebar() {
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);

  return (
    <aside
      className={cn(
        "bg-[var(--surface)] text-[var(--text)]",
        "w-[280px] shrink-0",
        "p-[15px] flex flex-col",
        "overflow-y-auto",
        "shadow-[-2px_0_5px_var(--shadow)]",
        "h-full box-border",
        "border-l border-[var(--border)]",
      )}
    >
      <h2
        className={cn(
          "text-[var(--primary)] text-center mb-5",
          "text-[1.4rem] font-[family-name:var(--font-header)]",
          "uppercase tracking-[0.1em]",
          "border-b-2 border-[var(--border)] pb-[10px]",
          "mt-0",
        )}
      >
        Party
      </h2>
      <div className="flex flex-col gap-4">
        {selectedHeroes.map((hero) => (
          <HeroCard key={hero.characterId} hero={hero} />
        ))}
      </div>
    </aside>
  );
}

// ── HeroCard ────────────────────────────────────────────────────────────────

interface HeroCardProps {
  readonly hero: Character;
}

function HeroCard({ hero }: HeroCardProps) {
  const setCharacterModalOpen = useUiStore((s) => s.setCharacterModalOpen);
  const heroState = useGameStore((s) => s.heroStates[hero.characterId]);

  const handleClick = () => {
    setCharacterModalOpen(true, hero.characterId);
  };

  // Read HP/XP/level from heroStates (updated by encounters), fall back to Character data
  const currentHP = heroState?.currentHP ?? 10;
  const maxHP = heroState?.maxHP ?? 10;
  const xp = heroState?.xp ?? 0;
  const level = heroState?.level ?? hero.characterLevel;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "bg-[var(--bg)] border border-[var(--border)]",
        "rounded-lg p-3",
        "flex flex-col items-center",
        "cursor-pointer transition-all duration-200",
        "hover:border-[var(--primary)] hover:shadow-[0_4px_12px_var(--shadow)]",
        "text-left w-full shadow-none",
      )}
    >
      {/* Portrait */}
      <div className="w-[60px] h-[60px] rounded-full overflow-hidden mb-2 border-2 border-[var(--border)]">
        <img
          src={sanitizeImageUrl(hero.profilePicture)}
          alt={hero.characterName}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Name and info */}
      <h4 className="m-0 text-[0.9rem] font-[family-name:var(--font-header)] text-[var(--text)] text-center">
        {hero.characterName}
      </h4>
      <p className="m-0 text-[0.75rem] text-[var(--text-secondary)] text-center">
        Lv.{level} {hero.characterClass}
      </p>

      {/* HP Bar */}
      <div className="w-full mt-2">
        <HpBar currentHP={currentHP} maxHP={maxHP} size="sm" />
      </div>

      {/* XP Bar */}
      <div className="w-full mt-1">
        <XpBar xp={xp} level={level} />
      </div>
    </button>
  );
}
