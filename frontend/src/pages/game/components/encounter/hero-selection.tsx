/**
 * HeroSelection — encounter hero chooser with initiative mechanic.
 *
 * Ported from EncounterActionModal.js hero selection phase (lines 282-342).
 */

import { useState } from "react";

import type { EncounterData, InitiativeResult } from "./encounter-types";
import type { Character } from "@dungeongpt/shared";

import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";


interface HeroSelectionProps {
  readonly encounter: EncounterData;
  readonly party: readonly Character[];
  readonly onConfirm: (
    heroIndex: number,
    initiativeResult: InitiativeResult,
  ) => void;
  readonly onFlee: () => void;
}

export function HeroSelection({
  encounter,
  party,
  onConfirm,
  onFlee,
}: HeroSelectionProps) {
  const heroStates = useGameStore((s) => s.heroStates);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState(0);

  const handleConfirm = () => {
    // Roll initiative check (15% chance of failure) -- ported as-is
    const initiativeRoll = Math.random();
    const initiativeFailed = initiativeRoll < 0.15;

    let actualHeroIndex = selectedHeroIndex;
    let message: string | null = null;

    if (initiativeFailed && party.length > 1) {
      const availableIndices = party
        .map((_, idx) => idx)
        .filter((idx) => idx !== selectedHeroIndex);
      const randomIdx =
        availableIndices[Math.floor(Math.random() * availableIndices.length)];
      actualHeroIndex = randomIdx ?? selectedHeroIndex;
      const forcedHero = party[actualHeroIndex];
      if (forcedHero) {
        message = `Initiative failed! ${forcedHero.characterName} is forced to act instead!`;
      }
    }

    onConfirm(actualHeroIndex, {
      success: !initiativeFailed,
      actualHeroIndex,
      message,
    });
  };

  return (
    <>
      <h2 className="text-[1.4rem] font-[family-name:var(--font-header)] text-[var(--primary)]">
        {encounter.name}
      </h2>
      <div className="text-[0.9rem] text-[var(--text-secondary)] mb-4">
        <p>{encounter.description}</p>
      </div>

      <div className="mt-5">
        <h3 className="text-[1.1rem] font-[family-name:var(--font-header)] mb-1">
          Choose Your Champion
        </h3>
        <p className="text-[0.85rem] text-[var(--text-secondary)] mb-4">
          Select which hero will lead the encounter. (15% chance initiative
          fails and a random hero acts instead)
        </p>

        <div className="flex flex-col gap-[10px]">
          {party.map((hero, idx) => {
            const state = heroStates[hero.characterId];
            return (
              <button
                key={hero.characterId}
                type="button"
                aria-label={`Select ${hero.characterName}`}
                onClick={() => { setSelectedHeroIndex(idx); }}
                className={cn(
                  "p-[15px] border-2 rounded-lg cursor-pointer transition-all duration-200 text-left w-full",
                  selectedHeroIndex === idx
                    ? "border-[var(--primary)] bg-[rgba(76,175,80,0.1)]"
                    : "border-[var(--border)] bg-[var(--bg)]",
                )}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <strong>{hero.characterName}</strong>
                    <span className="ml-[10px] text-[var(--text-secondary)]">
                      {hero.characterClass}
                    </span>
                  </div>
                  <div className="text-[0.85rem] text-[var(--text-secondary)]">
                    HP: {state?.currentHP ?? "?"}/{state?.maxHP ?? "?"}{" "}
                    | Level {state?.level ?? hero.characterLevel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <Button onClick={handleConfirm} className="mt-5 w-full">
          Confirm Hero
        </Button>
      </div>

      <Button
        variant="secondary"
        onClick={onFlee}
        className="mt-3 w-full"
      >
        Flee Encounter
      </Button>
    </>
  );
}
