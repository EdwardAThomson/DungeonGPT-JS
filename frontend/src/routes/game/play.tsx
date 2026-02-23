import { createFileRoute } from "@tanstack/react-router";

import { GamePage } from "@/pages/game/play/game-page";

/**
 * Main game play route -- `/game/play`
 */
export const Route = createFileRoute("/game/play")({
  component: GamePage,
});
