import { createFileRoute } from "@tanstack/react-router";

import { EncounterDebugPage } from "@/pages/debug/encounter-debug-page";

/**
 * Encounter debug route -- `/debug/encounters`
 */
export const Route = createFileRoute("/debug/encounters")({
  component: EncounterDebugPage,
});
