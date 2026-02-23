import { createFileRoute } from "@tanstack/react-router";

import { GameSettingsPage } from "@/pages/game/settings/game-settings-page";

/**
 * Game settings route -- `/game/settings`
 */
export const Route = createFileRoute("/game/settings")({
  component: GameSettingsPage,
});
