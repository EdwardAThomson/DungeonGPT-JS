/**
 * TerrainStudioPage — placeholder for the terrain generation studio.
 *
 * The original TerrainStudio.js (367 lines) depends on:
 *   - WorldMapDisplay3D (Three.js 3D renderer from experimental/)
 *   - generateOrganicMap (from experimental/mapGen/organicGenerator)
 *
 * These experimental dependencies are not part of the migration scope.
 * This placeholder preserves the route and provides a note about the
 * missing dependency. The 2D world map generator IS available and could
 * be wired up in a future iteration.
 */

import { Link } from "@tanstack/react-router";

import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { MainNav } from "@/pages/home/main-nav";

export function TerrainStudioPage() {
  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/debug">Back to Debug</Link>
          </Button>
          <h1 className="text-xl m-0">Terrain Studio</h1>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center">
          <h2 className="text-[var(--primary)] mb-3">Not Yet Available</h2>
          <p className="text-[var(--text-secondary)] mb-4">
            The Terrain Studio requires the experimental Three.js 3D renderer
            (WorldMapDisplay3D) and organic map generator, which are not part
            of the current migration scope.
          </p>
          <p className="text-[var(--text-secondary)] text-[0.85rem]">
            The 2D world map generator is available at{" "}
            <code className="text-[var(--accent)]">
              frontend/src/game/maps/world-generator.ts
            </code>{" "}
            and could be used in a future iteration of this tool.
          </p>
        </div>
      </PageCard>
    </PageLayout>
  );
}
