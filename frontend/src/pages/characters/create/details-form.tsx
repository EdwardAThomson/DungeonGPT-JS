/**
 * DetailsForm — race, class, level, alignment selects row.
 *
 * Ported from src/pages/CharacterCreation.js middle-left details section.
 */

import type {
  CharacterAlignment,
  CharacterClass,
  CharacterRace,
} from "@dungeongpt/shared";

import {
  alignmentOptions,
  characterClasses,
  characterRaces,
} from "@/data/character-templates";
import { cn } from "@/lib/utils";


const selectStyle = cn(
  "w-full mb-0 p-2",
  "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  "rounded-[4px] box-border",
  "font-[family-name:var(--font-ui)] text-base",
  "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
);

const labelStyle = cn(
  "mb-[5px] text-[0.9rem]",
  "block font-semibold",
  "font-[family-name:var(--font-header)]",
  "tracking-[0.05em] text-[var(--text-secondary)]",
);

interface DetailsFormProps {
  readonly selectedRace: string;
  readonly selectedClass: string;
  readonly level: number;
  readonly alignment: string;
  readonly onRaceChange: (race: CharacterRace | "") => void;
  readonly onClassChange: (cls: CharacterClass | "") => void;
  readonly onLevelChange: (level: number) => void;
  readonly onAlignmentChange: (alignment: CharacterAlignment | "") => void;
}

export function DetailsForm({
  selectedRace,
  selectedClass,
  level,
  alignment,
  onRaceChange,
  onClassChange,
  onLevelChange,
  onAlignmentChange,
}: DetailsFormProps) {
  return (
    <div className="flex flex-wrap gap-[15px] items-end">
      {/* Race */}
      <div className="flex-1 min-w-[130px]">
        <label htmlFor="race" className={labelStyle}>
          Race:
        </label>
        <select
          id="race"
          value={selectedRace}
          onChange={(event) => {
            onRaceChange(event.target.value as CharacterRace | "");
          }}
          className={selectStyle}
          required
        >
          <option value="">Select Race</option>
          {characterRaces.map((race) => (
            <option key={race} value={race}>
              {race}
            </option>
          ))}
        </select>
      </div>

      {/* Class */}
      <div className="flex-1 min-w-[130px]">
        <label htmlFor="class" className={labelStyle}>
          Class:
        </label>
        <select
          id="class"
          value={selectedClass}
          onChange={(event) => {
            onClassChange(event.target.value as CharacterClass | "");
          }}
          className={selectStyle}
          required
        >
          <option value="">Select Class</option>
          {characterClasses.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>
      </div>

      {/* Level */}
      <div className="flex-1 min-w-[130px]">
        <label htmlFor="level" className={labelStyle}>
          Level:
        </label>
        <input
          type="number"
          id="level"
          min={1}
          max={20}
          value={level}
          onChange={(event) => {
            onLevelChange(
              Number.parseInt(event.target.value, 10) || 1,
            );
          }}
          className={cn(selectStyle, "w-full")}
          required
        />
      </div>

      {/* Alignment */}
      <div className="flex-1 min-w-[130px]">
        <label htmlFor="alignment" className={labelStyle}>
          Alignment:
        </label>
        <select
          id="alignment"
          value={alignment}
          onChange={(event) => {
            onAlignmentChange(
              event.target.value as CharacterAlignment | "",
            );
          }}
          className={selectStyle}
          required
        >
          <option value="">Choose Alignment</option>
          {alignmentOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
