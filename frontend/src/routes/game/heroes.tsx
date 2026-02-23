import { createFileRoute } from "@tanstack/react-router";

import { HeroSelectionPage } from "@/pages/game/heroes/hero-selection-page";

/**
 * Hero selection route -- `/game/heroes`
 */
export const Route = createFileRoute("/game/heroes")({
  component: HeroSelectionPage,
});
