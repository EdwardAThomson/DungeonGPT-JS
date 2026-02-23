import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/pages/home/home-page";

/**
 * Home page route — `/`
 * Renders the HomePage component with navigation cards.
 */
export const Route = createFileRoute("/")({
  component: HomePage,
});
