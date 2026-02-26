import { Hono } from "hono";
import { z } from "zod";
import { generateText, AiServiceError } from "../services/ai";
import { getAllModels, DEFAULT_MODEL_ID } from "../services/models";
import type { Env } from "../types";

const aiRoutes = new Hono<{ Bindings: Env }>();

const generateAiRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1).max(50000),
  maxTokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const generateAiResponseSchema = z.object({
  text: z.string(),
});

aiRoutes.get("/models", (c) => {
  const models = getAllModels();
  return c.json({
    models,
    defaultModelId: DEFAULT_MODEL_ID,
  });
});

aiRoutes.post("/generate", async (c) => {
  const body: unknown = await c.req.json();
  const parsed = generateAiRequestSchema.safeParse(body);

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

  try {
    const result = await generateText(c.env, {
      prompt: parsed.data.prompt,
      modelId: parsed.data.model,
      maxTokens: parsed.data.maxTokens,
      temperature: parsed.data.temperature,
    });

    const output = generateAiResponseSchema.parse(result);
    return c.json(output);
  } catch (error: unknown) {
    const status =
      error instanceof AiServiceError &&
      error.status >= 200 &&
      error.status < 600
        ? error.status
        : 500;

    const message =
      status >= 500
        ? "AI generation failed"
        : error instanceof Error
          ? error.message
          : String(error);

    return c.json({ error: message }, status as 400 | 500 | 502);
  }
});

export { aiRoutes };
