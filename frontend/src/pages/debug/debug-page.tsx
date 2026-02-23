/**
 * DebugPage — debug menu with links to test utilities.
 *
 * Ported from src/components/DebugMenu.js (107 lines).
 * Provides access to game state debugging tools.
 */

import { Link } from "@tanstack/react-router";

import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";

export function DebugPage() {
  const gameState = useGameStore.getState();
  const settingsState = useSettingsStore.getState();

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <h1>Debug Tools</h1>
        <p className="text-[var(--text-secondary)]">
          Development and testing utilities.
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5 mt-5">
          <DebugCard
            title="Game State"
            description="View current Zustand game store state"
          >
            <pre className={cn(
              "text-[0.75rem] max-h-[200px] overflow-y-auto",
              "bg-[var(--bg)] p-3 rounded border border-[var(--border)]",
              "text-[var(--text-secondary)]",
            )}>
              {JSON.stringify(
                {
                  sessionId: gameState.sessionId,
                  hasAdventureStarted: gameState.hasAdventureStarted,
                  conversationLength: gameState.conversation.length,
                  selectedHeroesCount: gameState.selectedHeroes.length,
                  playerPosition: gameState.playerPosition,
                  isLoading: gameState.isLoading,
                },
                null,
                2,
              )}
            </pre>
          </DebugCard>

          <DebugCard
            title="Settings State"
            description="View current settings store state"
          >
            <pre className={cn(
              "text-[0.75rem] max-h-[200px] overflow-y-auto",
              "bg-[var(--bg)] p-3 rounded border border-[var(--border)]",
              "text-[var(--text-secondary)]",
            )}>
              {JSON.stringify(
                {
                  provider: settingsState.selectedProvider,
                  model: settingsState.selectedModel,
                  hasSettings: settingsState.settings !== null,
                },
                null,
                2,
              )}
            </pre>
          </DebugCard>

          <DebugCard
            title="Debug Tools"
            description="System testing utilities"
          >
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/debug/encounters">Encounter Debug</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/debug/llm">LLM Pipeline Debug</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/debug/terrain">Terrain Studio</Link>
              </Button>
            </div>
          </DebugCard>

          <DebugCard
            title="Navigation"
            description="Quick links to all pages"
          >
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/">Home</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/characters/create">Create Character</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/characters">All Characters</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/game/settings">Game Settings</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/game/heroes">Hero Selection</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/game/play">Game Play</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/saves">Saved Conversations</Link>
              </Button>
            </div>
          </DebugCard>
        </div>
      </PageCard>
    </PageLayout>
  );
}

// ── DebugCard ───────────────────────────────────────────────────────────────

interface DebugCardProps {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}

function DebugCard({ title, description, children }: DebugCardProps) {
  return (
    <div className={cn(
      "bg-[var(--surface)] border border-[var(--border)]",
      "rounded-lg p-4",
      "shadow-[0_2px_8px_var(--shadow)]",
    )}>
      <h3 className="mt-0 mb-1 text-[1rem]">{title}</h3>
      <p className="text-[0.8rem] text-[var(--text-secondary)] mb-3">
        {description}
      </p>
      {children}
    </div>
  );
}
