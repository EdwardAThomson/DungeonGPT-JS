import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../types";

interface ImageEnv extends Env {
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

// FLUX.2 models require multipart input via REST API (AI binding rejects JSON for these)
const FLUX2_MODELS = new Set([
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-9b",
  "@cf/black-forest-labs/flux-2-klein-4b",
]);

const imageRoutes = new Hono<{ Bindings: ImageEnv }>();

const IMAGE_MODELS = [
  {
    id: "@cf/leonardo/lucid-origin",
    name: "Lucid Origin",
    maxWidth: 2500,
    maxHeight: 2500,
    defaultSteps: 25,
  },
  {
    id: "@cf/leonardo/phoenix-1.0",
    name: "Phoenix 1.0",
    maxWidth: 2048,
    maxHeight: 2048,
    defaultSteps: 25,
  },
  {
    id: "@cf/black-forest-labs/flux-2-dev",
    name: "FLUX.2 Dev",
    maxWidth: 1024,
    maxHeight: 1024,
    defaultSteps: 25,
  },
  {
    id: "@cf/black-forest-labs/flux-2-klein-9b",
    name: "FLUX.2 Klein 9B",
    maxWidth: 1024,
    maxHeight: 1024,
    defaultSteps: 25,
  },
  {
    id: "@cf/black-forest-labs/flux-2-klein-4b",
    name: "FLUX.2 Klein 4B",
    maxWidth: 1024,
    maxHeight: 1024,
    defaultSteps: 25,
  },
  {
    id: "@cf/black-forest-labs/flux-1-schnell",
    name: "FLUX.1 Schnell",
    maxWidth: 1024,
    maxHeight: 1024,
    defaultSteps: 4,
  },
  {
    id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL",
    maxWidth: 1024,
    maxHeight: 1024,
    defaultSteps: 20,
  },
  {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    name: "SDXL Lightning",
    maxWidth: 1024,
    maxHeight: 1024,
    defaultSteps: 4,
  },
];

const generateImageSchema = z.object({
  prompt: z.string().min(1).max(10000),
  model: z
    .string()
    .default("@cf/leonardo/lucid-origin"),
  width: z.number().int().min(256).max(2500).optional(),
  height: z.number().int().min(256).max(2500).optional(),
  steps: z.number().int().min(1).max(50).optional(),
});

imageRoutes.options("*", (c) => c.body(null, 204));

imageRoutes.get("/models", requireAuth, (c) => {
  return c.json({ models: IMAGE_MODELS });
});

// TODO: restore requireAuth
imageRoutes.post("/generate", async (c) => {
  const body: unknown = await c.req.json();
  const parsed = generateImageSchema.safeParse(body);

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

  const { prompt, model, width, height, steps } = parsed.data;

  const modelInfo = IMAGE_MODELS.find((m) => m.id === model);
  if (!modelInfo) {
    return c.json({ error: `Unknown image model: ${model}` }, 400);
  }

  try {
    const input: Record<string, unknown> = { prompt };
    if (width) input.width = width;
    if (height) input.height = height;
    if (steps) input.num_steps = steps;

    let b64Image: string;

    if (FLUX2_MODELS.has(model)) {
      // FLUX.2 models require multipart/form-data via REST API
      const accountId = c.env.CF_ACCOUNT_ID;
      const apiToken = c.env.CF_API_TOKEN;
      if (!accountId || !apiToken) {
        return c.json(
          { error: "CF_ACCOUNT_ID and CF_API_TOKEN required for FLUX.2 models." },
          500
        );
      }

      const form = new FormData();
      form.append("prompt", prompt);
      if (width) form.append("width", String(width));
      if (height) form.append("height", String(height));
      if (steps) form.append("num_steps", String(steps));

      const restRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}` },
          body: form,
        }
      );

      if (!restRes.ok) {
        const errData = (await restRes.json().catch(() => null)) as {
          errors?: Array<{ message: string }>;
        } | null;
        const msg =
          errData?.errors?.[0]?.message || `CF API HTTP ${restRes.status}`;
        return c.json({ error: `Image generation failed: ${msg}` }, 502);
      }

      const imageBytes = new Uint8Array(await restRes.arrayBuffer());
      b64Image = btoa(
        imageBytes.reduce((s, b) => s + String.fromCharCode(b), "")
      );
    } else {
      // All other models work with the AI binding
      const result = await c.env.AI.run(model, input);

      if (result && typeof result === "object" && "image" in (result as Record<string, unknown>)) {
        b64Image = (result as Record<string, string>).image;
      } else if (result instanceof ReadableStream) {
        const reader = result.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const totalLen = chunks.reduce((s, ch) => s + ch.length, 0);
        const imageBytes = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          imageBytes.set(chunk, offset);
          offset += chunk.length;
        }
        b64Image = btoa(
          imageBytes.reduce((s, b) => s + String.fromCharCode(b), "")
        );
      } else {
        console.error("Unexpected AI.run result type:", typeof result);
        return c.json({ error: "Unexpected response from image model" }, 502);
      }
    }

    const format = b64Image.startsWith("/9j/") ? "jpeg" : "png";
    return c.json({
      image: b64Image,
      format,
      model: modelInfo.id,
      modelName: modelInfo.name,
    });
  } catch (error: unknown) {
    console.error(`Image generation error (${model}):`, error);
    const message =
      error instanceof Error ? error.message : String(error);
    return c.json({ error: `Image generation failed: ${message}` }, 502);
  }
});

export { imageRoutes };
