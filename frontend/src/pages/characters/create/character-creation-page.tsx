/**
 * CharacterCreationPage — character creation form.
 *
 * Ported from src/pages/CharacterCreation.js (464 lines).
 * Broken into sub-components: ProfilePictureGrid, TemplateSelector,
 * StatsPanel, DetailsForm.
 *
 * Uses TanStack Router (replacing React Router).
 * Uses useCreateCharacter TanStack Query mutation (replacing CharacterContext).
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import type {
  CharacterAlignment,
  CharacterClass,
  CharacterRace,
  CharacterStats,
} from "@dungeongpt/shared";

import { useCreateCharacter } from "@/api/client";
import {
  characterGenders,
  characterTemplates,
  initialStats,
} from "@/data/character-templates";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { generateName } from "@/game/npcs/generator";
import { cn } from "@/lib/utils";
import { DetailsForm } from "@/pages/characters/create/details-form";
import { ProfilePictureGrid } from "@/pages/characters/create/profile-picture-grid";
import { StatsPanel } from "@/pages/characters/create/stats-panel";
import { TemplateSelector } from "@/pages/characters/create/template-selector";
import { MainNav } from "@/pages/home/main-nav";


const inputStyle = cn(
  "w-full p-3 mb-5",
  "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  "rounded-[4px] box-border",
  "font-[family-name:var(--font-ui)] text-base",
  "transition-[border-color] duration-200 ease-in-out",
  "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
);

const labelStyle = cn(
  "block mb-2 font-semibold",
  "font-[family-name:var(--font-header)] text-[0.85rem]",
  "tracking-[0.05em] text-[var(--text-secondary)]",
);

export function CharacterCreationPage() {
  const navigate = useNavigate();
  const createCharacter = useCreateCharacter();

  // Form state
  const [characterName, setCharacterName] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedPicture, setSelectedPicture] = useState<string | null>(null);
  const [selectedRace, setSelectedRace] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [level, setLevel] = useState(1);
  const [stats, setStats] = useState<CharacterStats>({ ...initialStats });
  const [background, setBackground] = useState("");
  const [alignment, setAlignment] = useState("");

  const handleGenderChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newGender = event.target.value;
      setSelectedGender(newGender);
      // Clear picture if it doesn't match new gender
      if (selectedPicture) {
        const picGender = selectedPicture.startsWith("female_")
          ? "Female"
          : "Male";
        if (picGender !== newGender) {
          setSelectedPicture(null);
        }
      }
    },
    [selectedPicture],
  );

  const handleStatChange = useCallback(
    (stat: keyof CharacterStats, value: number) => {
      setStats((previous) => ({ ...previous, [stat]: value }));
    },
    [],
  );

  const handleApplyTemplate = useCallback(
    (templateClass: CharacterClass) => {
      const template = characterTemplates[templateClass];
      setSelectedClass(templateClass);
      setSelectedRace(template.race);
      setStats({ ...template.stats });
      setAlignment(template.alignment);
      setBackground(template.backgroundSnippet);
      setLevel(1);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!selectedPicture) {
      // NOTE: Original uses alert() — ported as-is
      globalThis.alert("Please select a profile picture.");
      return;
    }
    if (
      !characterName ||
      !selectedRace ||
      !selectedClass ||
      !background ||
      !alignment ||
      !selectedGender ||
      !level
    ) {
      globalThis.alert(
        "Please fill in all remaining character details (Name, Gender, Race, Class, Level, Alignment, Background).",
      );
      return;
    }

    const newCharacter = {
      characterId: uuidv4(),
      characterName,
      characterGender: selectedGender as "Male" | "Female",
      profilePicture: selectedPicture,
      characterRace: selectedRace as CharacterRace,
      characterClass: selectedClass as CharacterClass,
      characterLevel: level,
      characterBackground: background,
      characterAlignment: alignment as CharacterAlignment,
      stats,
    };

    createCharacter.mutate(newCharacter, {
      onSuccess: () => {
        void navigate({ to: "/characters" });
      },
    });
  }, [
    characterName,
    selectedGender,
    selectedPicture,
    selectedRace,
    selectedClass,
    level,
    background,
    alignment,
    stats,
    createCharacter,
    navigate,
  ]);

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        {/* Top: Header + Name + Gender + Pictures */}
        <div className="mb-[30px]">
          <div className="mb-[25px]">
            <h1>Create Your Character</h1>
            <NameInput
              value={characterName}
              gender={selectedGender}
              onChange={setCharacterName}
            />
          </div>

          <div className="mb-[25px]">
            <label htmlFor="gender" className={labelStyle}>
              Gender:
            </label>
            <select
              id="gender"
              value={selectedGender}
              onChange={handleGenderChange}
              className={inputStyle}
              required
            >
              <option value="">Select Gender</option>
              {characterGenders.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <ProfilePictureGrid
            selectedGender={selectedGender}
            selectedPicture={selectedPicture}
            onSelect={setSelectedPicture}
          />
        </div>

        {/* Middle: Details + Stats */}
        <div className="flex gap-10 mb-[30px]">
          <div className="flex-[2] flex flex-col gap-[25px]">
            <TemplateSelector onApply={handleApplyTemplate} />
            <DetailsForm
              selectedRace={selectedRace}
              selectedClass={selectedClass}
              level={level}
              alignment={alignment}
              onRaceChange={setSelectedRace}
              onClassChange={setSelectedClass}
              onLevelChange={setLevel}
              onAlignmentChange={setAlignment}
            />
            <div>
              <label htmlFor="background" className={labelStyle}>
                Background Story:
              </label>
              <textarea
                id="background"
                value={background}
                onChange={(event) => {
                  setBackground(event.target.value);
                }}
                maxLength={200}
                placeholder="Enter character background"
                rows={4}
                className={inputStyle}
                required
              />
            </div>
          </div>

          <div className="flex-1">
            <StatsPanel stats={stats} onStatChange={handleStatChange} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-5 mt-5 pt-5 border-t border-[var(--border)]">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createCharacter.isPending}
          >
            {createCharacter.isPending ? "Creating..." : "Create Character"}
          </Button>
        </div>
      </PageCard>
    </PageLayout>
  );
}

// ── NameInput sub-component ─────────────────────────────────────────────────

interface NameInputProps {
  readonly value: string;
  readonly gender: string;
  readonly onChange: (name: string) => void;
}

function NameInput({ value, gender, onChange }: NameInputProps) {
  const handleGenerate = () => {
    onChange(generateName(gender || null));
  };

  return (
    <div>
      <label htmlFor="characterName" className={cn(
        "block mb-2 font-semibold",
        "font-[family-name:var(--font-header)] text-[0.85rem]",
        "tracking-[0.05em] text-[var(--text-secondary)]",
      )}>
        Character Name:
      </label>
      <div className="flex gap-[10px]">
        <input
          type="text"
          id="characterName"
          maxLength={50}
          placeholder="Enter or Generate Name"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={cn(
            "w-full p-3 mb-0",
            "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
            "rounded-[4px] box-border",
            "font-[family-name:var(--font-ui)] text-base",
            "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
          )}
          required
        />
        <Button
          type="button"
          onClick={handleGenerate}
          variant="secondary"
          title="Generate Random Name"
        >
          &#x1F3B2;
        </Button>
      </div>
    </div>
  );
}
