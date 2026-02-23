/**
 * CharacterModal — character detail view with portrait, stats, HP, XP.
 *
 * Ported from src/components/CharacterModal.js (133 lines).
 * Uses design-system components: HpBar, XpBar, StatBlock, Dialog.
 */

import { HpBar } from "@/design-system/game/hp-bar";
import { StatBlock } from "@/design-system/game/stat-block";
import { XpBar } from "@/design-system/game/xp-bar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { sanitizeImageUrl } from "@/lib/sanitize-url";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import { useUiStore } from "@/stores/ui-store";


export function CharacterModal() {
  const isOpen = useUiStore((s) => s.isCharacterModalOpen);
  const activeCharacterId = useUiStore((s) => s.activeCharacterId);
  const setOpen = useUiStore((s) => s.setCharacterModalOpen);
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);

  const heroState = useGameStore(
    (s) => activeCharacterId ? s.heroStates[activeCharacterId] : undefined,
  );

  const character = selectedHeroes.find(
    (h) => h.characterId === activeCharacterId,
  );

  if (!character) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Character</DialogTitle>
          </DialogHeader>
          <p className="text-center text-[var(--text-secondary)]">
            Character not found.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const currentHP = heroState?.currentHP ?? 10;
  const maxHP = heroState?.maxHP ?? 10;
  const xp = heroState?.xp ?? 0;
  const level = heroState?.level ?? character.characterLevel;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{character.characterName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5">
          {/* Portrait */}
          <div className="w-[120px] h-[120px] rounded-full overflow-hidden border-[3px] border-[var(--border)]">
            <img
              src={sanitizeImageUrl(character.profilePicture)}
              alt={character.characterName}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="text-center">
            <p className="text-[1.1rem] font-[family-name:var(--font-header)] text-[var(--primary)]">
              Level {level} {character.characterClass}
            </p>
            <p className="text-[0.9rem] text-[var(--text-secondary)]">
              {character.characterRace} &middot; {character.characterGender} &middot;{" "}
              {character.characterAlignment}
            </p>
          </div>

          {/* HP Bar */}
          <div className="w-full">
            <HpBar currentHP={currentHP} maxHP={maxHP} />
          </div>

          {/* XP Bar */}
          <div className="w-full">
            <XpBar xp={xp} level={level} />
          </div>

          {/* Stats */}
          <div className="w-full">
            <StatBlock stats={character.stats} variant="full" />
          </div>

          {/* Background */}
          <div className="w-full">
            <h4 className={cn(
              "text-[0.85rem] font-[family-name:var(--font-header)]",
              "text-[var(--text-secondary)] uppercase tracking-[0.05em]",
              "mb-2",
            )}>
              Background
            </h4>
            <p className="text-[0.9rem] text-[var(--text)] leading-[1.5]">
              {character.characterBackground}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
