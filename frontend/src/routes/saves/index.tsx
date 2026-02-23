import { createFileRoute } from "@tanstack/react-router";

import { SavedConversationsPage } from "@/pages/saves/saved-conversations-page";

/**
 * Saved conversations route -- `/saves`
 */
export const Route = createFileRoute("/saves/")({
  component: SavedConversationsPage,
});
