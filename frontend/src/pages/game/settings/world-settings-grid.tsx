/**
 * WorldSettingsGrid — grimness, darkness, magic, tech, verbosity selects.
 *
 * Ported from src/pages/GameSettings.js settings-grid section.
 */

import { cn } from "@/lib/utils";

const selectStyle = cn(
  "w-full p-3",
  "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  "rounded-[4px] box-border",
  "font-[family-name:var(--font-ui)] text-base",
  "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
  "disabled:opacity-70 disabled:cursor-not-allowed",
);

const labelStyle = cn(
  "block mb-2 font-semibold",
  "font-[family-name:var(--font-header)] text-[0.85rem]",
  "tracking-[0.05em] text-[var(--text-secondary)]",
);

const grimnessOptions = ["Noble", "Neutral", "Bleak", "Grim"] as const;
const darknessOptions = ["Bright", "Neutral", "Grey", "Dark"] as const;
const magicOptions = [
  "No Magic",
  "Low Magic",
  "High Magic",
  "Arcane Tech",
] as const;
const technologyOptions = [
  "Ancient",
  "Medieval",
  "Renaissance",
  "Industrial",
] as const;
const verbosityOptions = ["Concise", "Moderate", "Descriptive"] as const;

interface WorldSettingsGridProps {
  readonly grimnessLevel: string;
  readonly darknessLevel: string;
  readonly magicLevel: string;
  readonly technologyLevel: string;
  readonly responseVerbosity: string;
  readonly disabled: boolean;
  readonly onGrimnessChange: (value: string) => void;
  readonly onDarknessChange: (value: string) => void;
  readonly onMagicChange: (value: string) => void;
  readonly onTechnologyChange: (value: string) => void;
  readonly onVerbosityChange: (value: string) => void;
}

export function WorldSettingsGrid({
  grimnessLevel,
  darknessLevel,
  magicLevel,
  technologyLevel,
  responseVerbosity,
  disabled,
  onGrimnessChange,
  onDarknessChange,
  onMagicChange,
  onTechnologyChange,
  onVerbosityChange,
}: WorldSettingsGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[15px]">
      <div>
        <label htmlFor="grimness" className={labelStyle}>
          Grimness
        </label>
        <select
          id="grimness"
          value={grimnessLevel}
          onChange={(e) => {
            onGrimnessChange(e.target.value);
          }}
          className={selectStyle}
          disabled={disabled}
        >
          <option value="">Select...</option>
          {grimnessOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="darkness" className={labelStyle}>
          Darkness
        </label>
        <select
          id="darkness"
          value={darknessLevel}
          onChange={(e) => {
            onDarknessChange(e.target.value);
          }}
          className={selectStyle}
          disabled={disabled}
        >
          <option value="">Select...</option>
          {darknessOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="magic" className={labelStyle}>
          Magic Level
        </label>
        <select
          id="magic"
          value={magicLevel}
          onChange={(e) => {
            onMagicChange(e.target.value);
          }}
          className={selectStyle}
          disabled={disabled}
        >
          {magicOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tech" className={labelStyle}>
          Technology
        </label>
        <select
          id="tech"
          value={technologyLevel}
          onChange={(e) => {
            onTechnologyChange(e.target.value);
          }}
          className={selectStyle}
          disabled={disabled}
        >
          {technologyOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="verbosity" className={labelStyle}>
          Narrative Style
        </label>
        <select
          id="verbosity"
          value={responseVerbosity}
          onChange={(e) => {
            onVerbosityChange(e.target.value);
          }}
          className={selectStyle}
          disabled={disabled}
        >
          {verbosityOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
