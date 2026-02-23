/**
 * HeroSelectionPage — party selection (1-4 heroes).
 *
 * Ported from src/pages/HeroSelection.js (156 lines).
 * Uses TanStack Query useCharacters (replacing direct fetch).
 * Uses Zustand game-store (replacing navigation state).
 * Uses initializeHP from game/health.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import type { Character } from "@dungeongpt/shared";

import { useCharacters } from "@/api/client";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { initializeHP } from "@/game/health/index";
import { sanitizeImageUrl } from "@/lib/sanitize-url";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";
import { useGameStore } from "@/stores/game-store";


export function HeroSelectionPage() {
  const navigate = useNavigate();
  const { data: characters, isLoading, error } = useCharacters();
  const setSelectedHeroes = useGameStore((s) => s.setSelectedHeroes);
  const initializeHeroStates = useGameStore((s) => s.initializeHeroStates);

  const [selected, setSelected] = useState<Character[]>([]);
  const [selectionError, setSelectionError] = useState("");

  const toggleHero = useCallback(
    (character: Character) => {
      setSelectionError("");
      setSelected((previous) => {
        const isSelected = previous.some(
          (hero) => hero.characterId === character.characterId,
        );
        if (isSelected) {
          return previous.filter(
            (hero) => hero.characterId !== character.characterId,
          );
        }
        if (previous.length < 4) {
          return [...previous, character];
        }
        setSelectionError("You can select a maximum of 4 heroes.");
        return previous;
      });
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (selected.length === 0 || selected.length > 4) {
      setSelectionError("Please select between 1 and 4 heroes to start.");
      return;
    }
    setSelectionError("");

    // Initialize HP for all selected heroes
    const heroesWithHP = selected.map((hero) => initializeHP(hero));
    setSelectedHeroes(heroesWithHP);
    initializeHeroStates(heroesWithHP);
    void navigate({ to: "/game/play" });
  }, [selected, setSelectedHeroes, initializeHeroStates, navigate]);

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <div className="flex items-center justify-between mb-5">
          <h2 className="mt-0">Select Your Party (1-4 Heroes)</h2>
          <Button variant="secondary" asChild>
            <Link to="/characters/create">+ Create New Character</Link>
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center text-[var(--text-secondary)]">
            Loading characters...
          </p>
        ) : error ? (
          <p className="text-center text-[var(--danger)]">
            Failed to load characters. Please ensure the server is running.
          </p>
        ) : !characters || characters.length === 0 ? (
          <h3>No characters available. Please create a character.</h3>
        ) : (
          <div role="listbox" aria-label="Character selection" className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
            {characters.map((char) => {
              const isSelected = selected.some(
                (hero) => hero.characterId === char.characterId,
              );
              return (
                <div
                  key={char.characterId}
                  onClick={() => {
                    toggleHero(char);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleHero(char);
                    }
                  }}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={cn(
                    "bg-[var(--surface)] border-2 border-[var(--border)]",
                    "rounded-lg shadow-[0_4px_12px_var(--shadow)]",
                    "p-5 flex flex-col items-center cursor-pointer",
                    "transition-all duration-300 ease-in-out",
                    "hover:border-[var(--primary)] hover:shadow-[0_8px_24px_var(--shadow)]",
                    isSelected && "border-[var(--primary)] bg-[var(--shadow)]",
                  )}
                >
                  <div className="w-[100px] h-[100px] rounded-full overflow-hidden mb-[15px] border-[3px] border-[var(--border)]">
                    <img
                      src={sanitizeImageUrl(char.profilePicture)}
                      alt={`${char.characterName}'s profile`}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="text-center mb-[15px] w-full">
                    <h3 className="mt-0 mb-[10px] text-[var(--text)] text-[1.4em] font-[family-name:var(--font-header)]">
                      {char.characterName}
                    </h3>
                    <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
                      <span className="font-bold text-[var(--text)]">
                        Level:
                      </span>{" "}
                      {char.characterLevel} {char.characterClass}
                    </p>
                    <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
                      <span className="font-bold text-[var(--text)]">
                        Race:
                      </span>{" "}
                      {char.characterRace}
                    </p>
                    <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
                      <span className="font-bold text-[var(--text)]">
                        Gender:
                      </span>{" "}
                      {char.characterGender}
                    </p>
                    <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
                      <span className="font-bold text-[var(--text)]">
                        Alignment:
                      </span>{" "}
                      {char.characterAlignment}
                    </p>
                    <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
                      <span className="font-bold text-[var(--text)]">
                        BG:
                      </span>{" "}
                      {char.characterBackground
                        ? `${char.characterBackground.slice(0, 60)}...`
                        : "N/A"}
                    </p>
                  </div>

                  <ul className="list-none p-0 mt-[10px] flex flex-wrap justify-center gap-[10px]">
                    {Object.entries(char.stats).map(([stat, value]) => (
                      <li
                        key={stat}
                        className="bg-[var(--bg)] px-2 py-[3px] rounded-[4px] text-[0.85em] text-[var(--text-secondary)] border border-[var(--border)]"
                      >
                        {stat.slice(0, 3)}: {value}
                      </li>
                    ))}
                  </ul>

                  {isSelected ? (
                    <div className="mt-3 text-[var(--primary)] text-[1.5rem] font-bold">
                      &#x2713;
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-center items-center gap-5 mt-5 pt-5 border-t border-[var(--border)]">
          {selectionError ? (
            <p className="text-[#ff5252] bg-[rgba(255,82,82,0.1)] border border-[#ff52524d] p-3 rounded-[4px] font-[family-name:var(--font-ui)] text-[0.9rem]">
              {selectionError}
            </p>
          ) : null}
          <Button variant="secondary" asChild>
            <Link to="/game/settings">Back to Settings</Link>
          </Button>
          <Button
            onClick={handleNext}
            disabled={selected.length === 0 || selected.length > 4}
          >
            Start Game with Selected Heroes
          </Button>
        </div>
      </PageCard>
    </PageLayout>
  );
}
