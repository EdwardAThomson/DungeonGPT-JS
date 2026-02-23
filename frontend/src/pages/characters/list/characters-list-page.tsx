/**
 * CharactersListPage — displays all saved characters.
 *
 * Ported from src/pages/AllCharacters.js (125 lines).
 * Uses TanStack Query useCharacters (replacing direct fetch).
 * Uses TanStack Router navigation (replacing React Router).
 */

import { Link } from "@tanstack/react-router";

import type { Character } from "@dungeongpt/shared";

import { useCharacters } from "@/api/client";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { calculateMaxHP } from "@/game/health/index";
import { sanitizeImageUrl } from "@/lib/sanitize-url";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";


function downloadJSONFile(filename: string, data: Character): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CharactersListPage() {
  const { data: characters, isLoading, error } = useCharacters();

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="mt-0">All Characters</h2>
          <div className="flex gap-[10px]">
            <Button asChild>
              <Link to="/game/settings">+ Start New Game</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/characters/create">+ Create New Character</Link>
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <p className="text-center text-[var(--text-secondary)]">
            Loading characters...
          </p>
        ) : error ? (
          <p className="text-center text-[var(--danger)]">
            Failed to load characters. Please check the server.
          </p>
        ) : !characters || characters.length === 0 ? (
          <h3>
            No characters found. Create one or make sure the server is
            running.
          </h3>
        ) : (
          <ul className="list-none p-0 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
            {characters.map((char) => (
              <CharacterCard key={char.characterId} character={char} />
            ))}
          </ul>
        )}
      </PageCard>
    </PageLayout>
  );
}

// ── CharacterCard ───────────────────────────────────────────────────────────

interface CharacterCardProps {
  readonly character: Character;
}

function CharacterCard({ character }: CharacterCardProps) {
  const maxHP = calculateMaxHP(character);

  return (
    <li
      className={cn(
        "bg-[var(--surface)] border border-[var(--border)]",
        "rounded-lg shadow-[0_4px_12px_var(--shadow)]",
        "p-5 flex flex-col items-center",
        "transition-all duration-300 ease-in-out",
        "hover:shadow-[0_4px_10px_rgba(0,0,0,0.15)]",
      )}
    >
      {/* Portrait */}
      <div className="w-[100px] h-[100px] rounded-full overflow-hidden mb-[15px] border-[3px] border-[var(--border)]">
        <img
          src={sanitizeImageUrl(character.profilePicture)}
          alt={`${character.characterName}'s profile`}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Info */}
      <div className="text-center mb-[15px] w-full">
        <h3 className="mt-0 mb-[10px] text-[var(--text)] text-[1.4em] font-[family-name:var(--font-header)]">
          {character.characterName}
        </h3>
        <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
          <span className="font-bold text-[var(--text)]">Level:</span>{" "}
          {character.characterLevel} {character.characterClass}
        </p>
        <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
          <span className="font-bold text-[var(--text)]">Gender:</span>{" "}
          {character.characterGender}
        </p>
        <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
          <span className="font-bold text-[var(--text)]">Race:</span>{" "}
          {character.characterRace}
        </p>
        <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
          <span className="font-bold text-[var(--text)]">Alignment:</span>{" "}
          {character.characterAlignment}
        </p>
        <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
          <span className="font-bold text-[var(--text)]">BG:</span>{" "}
          {character.characterBackground
            ? `${character.characterBackground.slice(0, 60)}...`
            : "N/A"}
        </p>

        {/* Stats */}
        <ul className="list-none p-0 mt-[10px] flex flex-wrap justify-center gap-[10px]">
          {Object.entries(character.stats).map(([stat, value]) => (
            <li
              key={stat}
              className={cn(
                "bg-[var(--bg)] px-2 py-[3px]",
                "rounded-[4px] text-[0.85em]",
                "text-[var(--text-secondary)] border border-[var(--border)]",
              )}
            >
              {stat.slice(0, 3)}: {value}
            </li>
          ))}
        </ul>

        <p className="my-[5px] text-[var(--text-secondary)] text-[0.95em]">
          <span className="font-bold text-[var(--text)]">Max HP:</span>{" "}
          {maxHP}
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-[10px] w-full mt-auto">
        <Button
          size="sm"
          className="bg-[#3498db] border-[#3498db] hover:bg-[#2980b9]"
          asChild
        >
          <Link to="/characters/create">Edit</Link>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="bg-[#95a5a6] border-[#95a5a6] text-white hover:bg-[#7f8c8d]"
          onClick={() => {
            downloadJSONFile(
              `${character.characterName}-character.json`,
              character,
            );
          }}
        >
          Download
        </Button>
      </div>
    </li>
  );
}
