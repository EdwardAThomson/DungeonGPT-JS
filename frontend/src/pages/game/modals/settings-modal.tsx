/**
 * SettingsModal — AI provider/model selection and theme switcher.
 *
 * Ported from src/components/Modals.js AISettingsModalContent.
 * Uses shadcn Dialog, Zustand settings-store, theme-provider.
 */

import { useTheme } from "@/design-system/theme/theme-provider";
import { Button } from "@/design-system/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

const selectStyle = cn(
  "w-full p-3",
  "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
  "rounded-[4px] box-border",
  "font-[family-name:var(--font-ui)] text-base",
  "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
);

const labelStyle = cn(
  "block mb-2 font-semibold",
  "font-[family-name:var(--font-header)] text-[0.85rem]",
  "tracking-[0.05em] text-[var(--text-secondary)]",
);

const PROVIDER = "workers-ai" as const;

/** Available Workers AI models — matches backend MODEL_REGISTRY. */
const availableModels = [
  // Fast tier
  { provider: PROVIDER, model: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast", tier: "Fast" },
  { provider: PROVIDER, model: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash", tier: "Fast" },
  { provider: PROVIDER, model: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B", tier: "Fast" },
  // Balanced tier
  { provider: PROVIDER, model: "@cf/google/gemma-3-12b-it", label: "Gemma 3 12B", tier: "Balanced" },
  { provider: PROVIDER, model: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", tier: "Balanced" },
  { provider: PROVIDER, model: "@cf/openai/gpt-oss-20b", label: "GPT-OSS 20B", tier: "Balanced" },
  { provider: PROVIDER, model: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 24B", tier: "Balanced" },
  // Quality tier
  { provider: PROVIDER, model: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B MoE", tier: "Quality" },
  { provider: PROVIDER, model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B", tier: "Quality" },
  { provider: PROVIDER, model: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B", tier: "Quality" },
] as const;

export function SettingsModal() {
  const isOpen = useUiStore((s) => s.isSettingsModalOpen);
  const setOpen = useUiStore((s) => s.setSettingsModalOpen);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedProvider = useSettingsStore((s) => s.setSelectedProvider);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const { theme, toggleTheme } = useTheme();

  const handleModelChange = (value: string) => {
    const entry = availableModels.find(
      (m) => `${m.provider}/${m.model}` === value,
    );
    if (entry) {
      setSelectedProvider(entry.provider);
      setSelectedModel(entry.model);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Settings</DialogTitle>
          <DialogDescription>
            Configure the AI engine used for game narration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label htmlFor="ai-model" className={labelStyle}>
              AI Model
            </label>
            <select
              id="ai-model"
              value={`${selectedProvider}/${selectedModel}`}
              onChange={(e) => {
                handleModelChange(e.target.value);
              }}
              className={selectStyle}
            >
              {(["Fast", "Balanced", "Quality"] as const).map((tier) => (
                <optgroup key={tier} label={tier}>
                  {availableModels
                    .filter((m) => m.tier === tier)
                    .map((m) => (
                      <option
                        key={`${m.provider}/${m.model}`}
                        value={`${m.provider}/${m.model}`}
                      >
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="p-4 bg-[var(--bg)] rounded-lg border border-[var(--border)]">
            <p className="text-[0.85rem] text-[var(--text-secondary)] m-0">
              All AI requests are proxied through the backend.
              No API keys are stored in the browser.
            </p>
          </div>

          <div>
            <span className={labelStyle}>Theme</span>
            <Button variant="secondary" onClick={toggleTheme}>
              {theme === "dark-fantasy"
                ? "\u2600\uFE0F Switch to Light Fantasy"
                : "\uD83C\uDF19 Switch to Dark Fantasy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
