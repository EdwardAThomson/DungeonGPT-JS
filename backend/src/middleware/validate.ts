/**
 * Zod validation middleware for Hono.
 *
 * Validates request bodies against shared Zod schemas.
 * Rejects with 400 on validation failure.
 */
import { validator } from "hono/validator";

import type { z } from "zod";

/**
 * Create a Hono body validation middleware from a Zod schema.
 * Parses the request JSON body and validates against the schema.
 * On failure, returns a structured 400 error with field-level details.
 *
 * NOTE: The return type involves `z.output<T>` which resolves to `any` when
 * `T extends z.ZodTypeAny`. This is a known limitation of Zod's generic typing.
 * The eslint-disable is required because Zod's safeParse output type erases to
 * `any` at the generic boundary. The data is validated by Zod at runtime.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return validator("json", (value: unknown, c) => {
    const result: z.SafeParseReturnType<unknown, z.output<T>> =
      schema.safeParse(value);
    if (!result.success) {
      return c.json(
        {
          error: "Validation failed",
          details: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Zod's ZodTypeAny erases output type to `any` at generic boundary. Data is validated by Zod at runtime.
    return result.data;
  });
}
