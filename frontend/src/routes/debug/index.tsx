import { createFileRoute } from "@tanstack/react-router";

import { DebugPage } from "@/pages/debug/debug-page";

/**
 * Debug menu route -- `/debug`
 */
export const Route = createFileRoute("/debug/")({
  component: DebugPage,
});
