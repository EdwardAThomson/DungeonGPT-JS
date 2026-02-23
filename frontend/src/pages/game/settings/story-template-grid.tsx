/**
 * StoryTemplateGrid — template picker cards + AI generate button.
 *
 * Ported from src/pages/GameSettings.js template section.
 */

import type { StoryTemplate } from "@/data/story-templates";

import { storyTemplates } from "@/data/story-templates";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";


interface StoryTemplateGridProps {
  readonly selectedTemplate: string | null;
  readonly isAiGenerating: boolean;
  readonly aiError: string;
  readonly onSelectTemplate: (template: StoryTemplate) => void;
  readonly onSelectCustom: () => void;
  readonly onAiGenerate: () => void;
}

export function StoryTemplateGrid({
  selectedTemplate,
  isAiGenerating,
  aiError,
  onSelectTemplate,
  onSelectCustom,
  onAiGenerate,
}: StoryTemplateGridProps) {
  return (
    <div className="mb-[30px]">
      <div className="flex justify-between items-center mb-[15px]">
        <h4 className="m-0 text-[0.9rem] text-[#7f8c8d] uppercase tracking-[0.5px]">
          Quick Templates
        </h4>
        <Button
          onClick={onAiGenerate}
          disabled={isAiGenerating}
          className={cn(
            "bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]",
            "text-white border-none",
            "px-4 py-2 rounded-[20px]",
            "text-[0.85rem] font-bold",
            "flex items-center gap-2",
            "shadow-[0_4px_15px_rgba(108,92,231,0.3)]",
            "hover:scale-105 hover:bg-none",
          )}
        >
          {isAiGenerating
            ? "\u2728 Spawning World..."
            : "\u2728 Generate with AI"}
        </Button>
      </div>

      {aiError ? (
        <p className="text-[#ff5252] bg-[rgba(255,82,82,0.1)] border border-[#ff52524d] p-3 rounded-[4px] mb-[15px] font-[family-name:var(--font-ui)] text-[0.9rem]">
          {aiError}
        </p>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[15px]">
        {storyTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              onSelectTemplate(template);
            }}
            className={cn(
              "p-4 rounded-lg border text-left cursor-pointer",
              "transition-all duration-200 ease-in-out",
              "bg-[var(--bg)] border-[var(--border)]",
              "hover:border-[var(--primary)] hover:shadow-[0_4px_12px_var(--shadow)]",
              "shadow-none",
              selectedTemplate === template.id &&
                "border-[var(--primary)] bg-[var(--shadow)]",
            )}
          >
            <span className="text-[1.5rem] block mb-2">{template.icon}</span>
            <h5 className="m-0 mb-1 text-[var(--text)] font-[family-name:var(--font-header)] text-[0.95rem]">
              {template.name}
            </h5>
            <p className="m-0 text-[var(--text-secondary)] text-[0.8rem] leading-[1.4]">
              {template.description}
            </p>
          </button>
        ))}
        <button
          type="button"
          onClick={onSelectCustom}
          className={cn(
            "p-4 rounded-lg border text-left cursor-pointer",
            "transition-all duration-200 ease-in-out",
            "bg-[var(--bg)] border-[var(--border)]",
            "hover:border-[var(--primary)] hover:shadow-[0_4px_12px_var(--shadow)]",
            "shadow-none",
            (selectedTemplate === "custom" || !selectedTemplate) &&
              "border-[var(--primary)] bg-[var(--shadow)]",
          )}
        >
          <span className="text-[1.5rem] block mb-2">
            &#x270D;&#xFE0F;
          </span>
          <h5 className="m-0 mb-1 text-[var(--text)] font-[family-name:var(--font-header)] text-[0.95rem]">
            Custom Tale
          </h5>
          <p className="m-0 text-[var(--text-secondary)] text-[0.8rem] leading-[1.4]">
            Start with a blank slate and define your own world logic.
          </p>
        </button>
      </div>
    </div>
  );
}
