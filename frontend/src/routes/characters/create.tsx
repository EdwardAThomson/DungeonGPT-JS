import { createFileRoute } from "@tanstack/react-router";

import { CharacterCreationPage } from "@/pages/characters/create/character-creation-page";

/**
 * Character creation route -- `/characters/create`
 */
export const Route = createFileRoute("/characters/create")({
  component: CharacterCreationPage,
});
