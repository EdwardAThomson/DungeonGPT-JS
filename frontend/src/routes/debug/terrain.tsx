import { createFileRoute } from "@tanstack/react-router";

import { TerrainStudioPage } from "@/pages/debug/terrain-studio-page";

/**
 * Terrain studio debug route -- `/debug/terrain`
 */
export const Route = createFileRoute("/debug/terrain")({
  component: TerrainStudioPage,
});
