import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { queryClient } from "@/api/query-client";
import { ThemeProvider } from "@/design-system/theme/theme-provider";
import { routeTree } from "@/routeTree.gen";

import "@/design-system/theme/tailwind.css";

/**
 * DungeonGPT Frontend
 *
 * Entry point for the Vite 7 + React 19 app.
 *
 * Provider stack (outermost to innermost):
 *   1. StrictMode — React development checks
 *   2. QueryClientProvider — TanStack Query for server state
 *   3. ThemeProvider — data-theme attribute switching (light-fantasy / dark-fantasy)
 *   4. RouterProvider — TanStack Router for file-based routing
 *
 * Design system (Tailwind v4, theme tokens, fonts) loaded via tailwind.css import.
 */

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html has a #root div.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
