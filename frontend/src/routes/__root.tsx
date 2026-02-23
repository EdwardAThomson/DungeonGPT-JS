import { Outlet, createRootRoute } from "@tanstack/react-router";

import { GameModals } from "@/pages/game/modals/game-modals";

/**
 * Root layout route.
 * All pages render inside this layout via <Outlet />.
 * ThemeProvider and QueryClientProvider are in main.tsx above the router.
 * GameModals are rendered at root level so settings modal works on all pages.
 */
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      <GameModals />
    </>
  );
}
