/**
 * GameHeader — top bar with save, settings, map, sidebar toggle.
 *
 * Ported from src/pages/Game.js game header section.
 */

import { Link } from "@tanstack/react-router";

import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

interface GameHeaderProps {
  readonly onSave: () => void;
}

export function GameHeader({ onSave }: GameHeaderProps) {
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSettingsModalOpen = useUiStore((s) => s.setSettingsModalOpen);
  const setMapModalOpen = useUiStore((s) => s.setMapModalOpen);
  const setInventoryModalOpen = useUiStore((s) => s.setInventoryModalOpen);
  const setHelpModalOpen = useUiStore((s) => s.setHelpModalOpen);

  return (
    <header
      className={cn(
        "bg-[var(--surface)]",
        "border-b-2 border-[var(--primary)]",
        "px-5 flex items-center justify-between",
        "h-[50px] shrink-0",
        "shadow-[0_2px_8px_var(--shadow)]",
      )}
    >
      {/* Left: Navigation */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="text-[var(--text)] no-underline font-[family-name:var(--font-header)] text-[0.85rem] uppercase tracking-[0.1em] border-b-0 hover:text-[var(--primary)]"
        >
          Home
        </Link>
        <span className="text-[var(--border)]">|</span>
        <span className="text-[0.8rem] text-[var(--text-secondary)]">
          {selectedProvider} / {selectedModel}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSave}>
          &#x1F4BE; Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMapModalOpen(true);
          }}
        >
          &#x1F5FA;&#xFE0F; Map
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setInventoryModalOpen(true);
          }}
        >
          &#x1F392; Inventory
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSettingsModalOpen(true);
          }}
        >
          &#x2699;&#xFE0F;
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setHelpModalOpen(true);
          }}
        >
          ?
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleSidebar}>
          &#x2630;
        </Button>
      </div>
    </header>
  );
}
