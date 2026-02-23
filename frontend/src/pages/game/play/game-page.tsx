/**
 * GamePage — main game view composing all game subsystems.
 *
 * Ported from src/pages/Game.js (1132 lines).
 * Composed from: GameHeader, ChatPanel, HeroSidebar.
 * Uses hooks: useGameSession, useAIResponse.
 * Uses Zustand stores for state.
 *
 * SECURITY: Zero dangerouslySetInnerHTML. All AI content rendered via
 * react-markdown in ChatPanel.
 */

import { GameLayout } from "@/design-system/layouts/game-layout";
import { useAIResponse } from "@/hooks/use-ai-response";
import { useGameSession } from "@/hooks/use-game-session";
import { ChatPanel } from "@/pages/game/play/chat-panel";
import { GameHeader } from "@/pages/game/play/game-header";
import { HeroSidebar } from "@/pages/game/play/hero-sidebar";
import { useUiStore } from "@/stores/ui-store";

export function GamePage() {
  const { saveGame } = useGameSession();
  const { handleStartAdventure, handleSubmit } = useAIResponse();
  const isSidebarVisible = useUiStore((s) => s.isSidebarVisible);

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-[var(--bg)]">
      <GameHeader onSave={saveGame} />
      <GameLayout
        partySidebar={isSidebarVisible ? <HeroSidebar /> : undefined}
      >
        <ChatPanel
          onSubmit={(event) => { void handleSubmit(event); }}
          onStartAdventure={() => { void handleStartAdventure(); }}
        />
      </GameLayout>
    </div>
  );
}
