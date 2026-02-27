import { Hono } from "hono";
import { cors } from "hono/cors";
import { aiRoutes } from "./routes/ai";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests from localhost in development
      if (origin?.includes("localhost") || origin?.includes("127.0.0.1")) {
        return origin;
      }
      // Allow requests from your production domain
      if (origin?.includes("dungeongpt") || origin?.includes(".pages.dev")) {
        return origin;
      }
      // Allow requests with no origin (e.g., curl, Postman)
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
