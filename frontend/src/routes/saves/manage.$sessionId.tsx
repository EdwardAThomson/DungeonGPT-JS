import { createFileRoute } from "@tanstack/react-router";

import { ConversationManagerPage } from "@/pages/saves/conversation-manager-page";

/**
 * Conversation manager route -- `/saves/manage/$sessionId`
 * Allows viewing and managing individual messages in a saved conversation.
 */
export const Route = createFileRoute("/saves/manage/$sessionId")({
  component: ConversationManagerPage,
});
