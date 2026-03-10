import { Hono } from "hono";
import { cors } from "hono/cors";
import { aiRoutes } from "./routes/ai";
import { imageRoutes } from "./routes/image";
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

app.route("/api/ai", aiRoutes);
app.route("/api/image", imageRoutes);

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
