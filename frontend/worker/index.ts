/**
 * Frontend Worker entrypoint.
 *
 * - /api/* requests are proxied to the backend Worker via Service Binding
 * - Everything else falls through to static assets (Vite build)
 */

interface Env {
  BACKEND: Fetcher;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Proxy /api/* to the backend Worker
    if (url.pathname.startsWith("/api/")) {
      return env.BACKEND.fetch(request);
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
