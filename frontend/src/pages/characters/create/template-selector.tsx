/**
 * TemplateSelector — class template dropdown + apply button.
 *
 * Ported from src/pages/CharacterCreation.js template section.
 */

import { useState } from "react";

import type { CharacterClass } from "@dungeongpt/shared";

import { characterTemplates } from "@/data/character-templates";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";


const templateClassNames = Object.keys(characterTemplates) as CharacterClass[];

interface TemplateSelectorProps {
  readonly onApply: (templateClass: CharacterClass) => void;
}

export function TemplateSelector({ onApply }: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const handleApply = () => {
    if (!selectedTemplate) {
      return;
    }
    onApply(selectedTemplate as CharacterClass);
  };

  return (
    <div>
      <label
        htmlFor="template-select"
        className={cn(
          "block mb-2 font-semibold",
          "font-[family-name:var(--font-header)] text-[0.85rem]",
          "tracking-[0.05em] text-[var(--text-secondary)]",
        )}
      >
        Apply Class Template (Level 1):
      </label>
      <div className="flex gap-[10px]">
        <select
          id="template-select"
          value={selectedTemplate}
          onChange={(event) => {
            setSelectedTemplate(event.target.value);
          }}
          className={cn(
            "w-full p-3 mb-0",
            "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
            "rounded-[4px] box-border",
            "font-[family-name:var(--font-ui)] text-base",
            "transition-[border-color] duration-200 ease-in-out",
            "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
          )}
        >
          <option value="">Select Class Template</option>
          {templateClassNames.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
        <Button
          type="button"
          onClick={handleApply}
          disabled={!selectedTemplate}
          size="sm"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
