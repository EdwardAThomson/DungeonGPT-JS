import { Hono } from "hono";
import { z } from "zod";
import { AiServiceError } from "../services/ai";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../types";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBEDDING_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 100;

const embedRoutes = new Hono<{ Bindings: Env }>();

const embedRequestSchema = z.object({
  text: z.union([
    z.string().min(1).max(10000),
    z.array(z.string().min(1).max(10000)).min(1).max(MAX_BATCH_SIZE),
  ]),
});

// Respond explicitly to CORS preflight for authenticated requests.
embedRoutes.options("*", (c) => c.body(null, 204));

embedRoutes.post("/", requireAuth, async (c) => {
  const body: unknown = await c.req.json();
  const parsed = embedRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    );
  }

  const textInput = Array.isArray(parsed.data.text)
    ? parsed.data.text
    : [parsed.data.text];

  try {
    const response = await c.env.AI.run(
      EMBEDDING_MODEL as Parameters<typeof c.env.AI.run>[0],
      { text: textInput }
    );

    // CF Workers AI embedding response: { data: number[][], shape: [count, dims] }
    const anyResponse = response as any;
    if (!anyResponse?.data || !Array.isArray(anyResponse.data)) {
      console.error("Unexpected embedding response format:", JSON.stringify(response));
      throw new AiServiceError("Unexpected embedding response format", 502);
    }

    return c.json({
      vectors: anyResponse.data,
      dimensions: EMBEDDING_DIMENSIONS,
      count: anyResponse.data.length,
    });
  } catch (error: unknown) {
    const status =
      error instanceof AiServiceError &&
      error.status >= 200 &&
      error.status < 600
        ? error.status
        : 500;

    const message =
      status >= 500
        ? "Embedding generation failed"
        : error instanceof Error
          ? error.message
          : String(error);

    console.error("Embedding error:", error);
    return c.json({ error: message }, status as 400 | 500 | 502);
  }
});

export { embedRoutes };
