import { createFileRoute } from "@tanstack/react-router";

import { CharactersListPage } from "@/pages/characters/list/characters-list-page";

/**
 * Characters list route -- `/characters`
 */
export const Route = createFileRoute("/characters/")({
  component: CharactersListPage,
});
