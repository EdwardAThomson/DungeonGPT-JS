/**
 * DiceRoller — dice rolling modal with simple dice and skill check modes.
 *
 * Ported from src/components/DiceRoller.js (161 lines).
 * Uses shadcn Dialog, game engine dice/rules modules.
 */

import { useCallback, useEffect, useState } from "react";

import type { CheckResult, DiceRollResult } from "@/game/dice/index";
import type { Character } from "@dungeongpt/shared";

import { DiceResult } from "@/design-system/game/dice-result";
import { Button } from "@/design-system/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { rollCheck, rollDice } from "@/game/dice/index";
import { calculateModifier, SKILLS, SUPPORTED_DICE } from "@/game/rules/index";
import { cn } from "@/lib/utils";


interface DiceRollerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly initialMode?: "dice" | "skill";
  readonly preselectedSkill?: string | null;
  readonly character?: Character | null;
  readonly onRollComplete?: (result: DiceRollResult | CheckResult) => void;
}

type RollResultState =
  | ({ type: "dice"; dieType: string } & DiceRollResult)
  | ({ type: "skill"; skillName: string; statName: string } & CheckResult)
  | null;

const selectStyle = cn(
  "w-full p-2",
  "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  "rounded-[4px]",
  "font-[family-name:var(--font-ui)] text-base",
  "focus:outline-none focus:border-[var(--primary)]",
);

export function DiceRoller({
  isOpen,
  onClose,
  initialMode = "dice",
  preselectedSkill = null,
  character = null,
  onRollComplete,
}: DiceRollerProps) {
  const [mode, setMode] = useState<"dice" | "skill">(initialMode);
  const [selectedDie, setSelectedDie] = useState(20);
  const [diceCount, setDiceCount] = useState(1);
  const [selectedSkill, setSelectedSkill] = useState(
    preselectedSkill ?? "Perception",
  );
  const [rollResult, setRollResult] = useState<RollResultState>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setRollResult(null);
      if (preselectedSkill) {
        setSelectedSkill(preselectedSkill);
        setMode("skill");
      }
    }
  }, [isOpen, initialMode, preselectedSkill]);

  const handleRollDice = useCallback(() => {
    const result = rollDice(diceCount, selectedDie);
    const rollState = {
      type: "dice" as const,
      ...result,
      dieType: `d${String(selectedDie)}`,
    };
    setRollResult(rollState);
    onRollComplete?.(result);
  }, [diceCount, selectedDie, onRollComplete]);

  const handleSkillCheck = useCallback(() => {
    const statName = SKILLS[selectedSkill] ?? "Wisdom";
    let modifier = 0;
    if (character?.stats) {
      const statValue = character.stats[statName];
      modifier = calculateModifier(statValue);
    }
    const result = rollCheck(modifier);
    const rollState = {
      type: "skill" as const,
      ...result,
      skillName: selectedSkill,
      statName,
    };
    setRollResult(rollState);
    onRollComplete?.(result);
  }, [selectedSkill, character, onRollComplete]);

  const sortedSkills = Object.keys(SKILLS).toSorted();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>&#x1F3B2; Dice Roller</DialogTitle>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === "dice" ? "default" : "secondary"}
            size="sm"
            onClick={() => { setMode("dice"); }}
          >
            Simple Dice
          </Button>
          <Button
            variant={mode === "skill" ? "default" : "secondary"}
            size="sm"
            onClick={() => { setMode("skill"); }}
          >
            Skill Check
          </Button>
        </div>

        {/* Controls */}
        <div className="space-y-3 mb-4">
          {mode === "dice" ? (
            <DiceControls
              selectedDie={selectedDie}
              diceCount={diceCount}
              onDieChange={setSelectedDie}
              onCountChange={setDiceCount}
              onRoll={handleRollDice}
            />
          ) : (
            <SkillControls
              selectedSkill={selectedSkill}
              sortedSkills={sortedSkills}
              character={character}
              onSkillChange={setSelectedSkill}
              onRoll={handleSkillCheck}
            />
          )}
        </div>

        {/* Results */}
        {rollResult ? (
          <div className="border-t border-[var(--border)] pt-4">
            <RollResultDisplay rollResult={rollResult} />
          </div>
        ) : null}

        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DiceControls({
  selectedDie,
  diceCount,
  onDieChange,
  onCountChange,
  onRoll,
}: {
  readonly selectedDie: number;
  readonly diceCount: number;
  readonly onDieChange: (v: number) => void;
  readonly onCountChange: (v: number) => void;
  readonly onRoll: () => void;
}) {
  return (
    <>
      <div>
        <label htmlFor="die-type" className="block mb-1 text-[0.85rem] text-[var(--text-secondary)]">
          Die Type:
        </label>
        <select
          id="die-type"
          value={selectedDie}
          onChange={(e) => { onDieChange(Number(e.target.value)); }}
          className={selectStyle}
        >
          {SUPPORTED_DICE.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="dice-count" className="block mb-1 text-[0.85rem] text-[var(--text-secondary)]">
          Count:
        </label>
        <input
          id="dice-count"
          type="number"
          min={1}
          max={10}
          value={diceCount}
          onChange={(e) => { onCountChange(Number(e.target.value)); }}
          className={cn(selectStyle, "w-20")}
        />
      </div>
      <Button onClick={onRoll}>
        Roll {diceCount}d{selectedDie}
      </Button>
    </>
  );
}

function SkillControls({
  selectedSkill,
  sortedSkills,
  character,
  onSkillChange,
  onRoll,
}: {
  readonly selectedSkill: string;
  readonly sortedSkills: readonly string[];
  readonly character: Character | null;
  readonly onSkillChange: (v: string) => void;
  readonly onRoll: () => void;
}) {
  return (
    <>
      <div>
        <label htmlFor="skill-select" className="block mb-1 text-[0.85rem] text-[var(--text-secondary)]">
          Skill:
        </label>
        <select
          id="skill-select"
          value={selectedSkill}
          onChange={(e) => { onSkillChange(e.target.value); }}
          className={selectStyle}
        >
          {sortedSkills.map((skill) => (
            <option key={skill} value={skill}>
              {skill} ({SKILLS[skill]})
            </option>
          ))}
        </select>
      </div>
      {character ? (
        <SkillCharacterInfo character={character} selectedSkill={selectedSkill} />
      ) : (
        <p className="text-[0.85rem] text-[var(--warning)]">
          No character selected. Rolling with +0.
        </p>
      )}
      <Button onClick={onRoll}>
        Roll {selectedSkill} Check
      </Button>
    </>
  );
}

function SkillCharacterInfo({
  character,
  selectedSkill,
}: {
  readonly character: Character;
  readonly selectedSkill: string;
}) {
  const statName = SKILLS[selectedSkill] ?? "Wisdom";
  const statValue = character.stats[statName];
  const mod = calculateModifier(statValue);
  const modStr = mod >= 0 ? `+${String(mod)}` : String(mod);

  return (
    <div className="text-[0.85rem] text-[var(--text-secondary)]">
      Rolling as <strong>{character.characterName}</strong>
      <br />
      {SKILLS[selectedSkill]}: {statValue} ({modStr})
    </div>
  );
}

function RollResultDisplay({
  rollResult,
}: {
  readonly rollResult: NonNullable<RollResultState>;
}) {
  if (rollResult.type === "dice") {
    return (
      <DiceResult
        total={rollResult.total}
        breakdown={`Results: [${rollResult.results.join(", ")}]`}
      />
    );
  }

  const outcome = rollResult.isCriticalSuccess
    ? "critical-success" as const
    : rollResult.isCriticalFailure
      ? "critical-failure" as const
      : "normal" as const;

  const critText = rollResult.isCriticalSuccess
    ? "CRITICAL SUCCESS!"
    : rollResult.isCriticalFailure
      ? "CRITICAL FAIL!"
      : undefined;

  return (
    <DiceResult
      total={rollResult.total}
      breakdown={`Roll: ${String(rollResult.naturalRoll)} ${rollResult.modifier >= 0 ? "+" : "-"} ${String(Math.abs(rollResult.modifier))}`}
      outcome={outcome}
      {...(critText ? { critText } : {})}
    />
  );
}
