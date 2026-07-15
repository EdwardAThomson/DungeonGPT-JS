import { Hono } from "hono";
import { cors } from "hono/cors";
import { aiRoutes } from "./routes/ai";
import { embedRoutes } from "./routes/embed";
import { imageRoutes } from "./routes/image";
import dbRoutes from "./routes/db";
import { entitlementsRoutes } from "./routes/entitlements";
import { requireAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) {
        // Reject requests with no origin header (was previously allowed)
        // Auth is now required, so curl/Postman must send Authorization header anyway
        return null;
      }

      // Exact localhost origins for development
      const localhostOrigins = [
        "http://localhost:3000",
        "http://localhost:8787",
        "http://localhost:8788",
        "http://127.0.0.1:3000",
      ];
      if (localhostOrigins.includes(origin)) {
        return origin;
      }

      // Production origins
      if (
        origin === "https://dungeongpt.xyz" ||
        origin === "https://dungeongpt-js.pages.dev" ||
        /^https:\/\/[a-z0-9-]+\.dungeongpt-js\.pages\.dev$/.test(origin)
      ) {
        return origin;
      }

      // Custom domain (if configured via env var)
      const customDomain = c.env.CUSTOM_DOMAIN;
      if (customDomain && origin === customDomain) {
        return origin;
      }

      // Reject all other origins
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "dungeongpt-api",
    environment: c.env.ENVIRONMENT,
  })
);

app.route("/api/embed", embedRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/image", imageRoutes);
app.use("/api/db/*", requireAuth);
// Rate limiting (backlog #12): mutating db calls share the 'db-write' bucket.
// GET stays unthrottled on purpose (sign-in reads: entitlements, premium-templates,
// saves list must stay cheap; rationale in middleware/rateLimit.ts). The /api/ai
// and /api/embed buckets are applied inside their route files, after requireAuth.
app.use(
  "/api/db/*",
  rateLimit("db-write", { methods: ["POST", "PUT", "PATCH", "DELETE"] })
);
app.route("/api/db", dbRoutes);
// Hub payments Phase 1: the client's own entitlements snapshot (hub tier merged
// with local grants). Auth is applied inside the route file (as /api/ai does);
// unthrottled GET on purpose, same sign-in-read rationale as /api/db reads above.
app.route("/api/entitlements", entitlementsRoutes);

app.notFound((c) =>
  c.json(
    {
      error: "Not found",
      path: c.req.path,
    },
    404
  )
);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal server error",
    },
    500
  );
});

export default app;
