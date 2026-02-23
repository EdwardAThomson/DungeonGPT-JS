import { createFileRoute } from "@tanstack/react-router";

import { LLMDebugPage } from "@/pages/debug/llm-debug-page";

/**
 * LLM debug route -- `/debug/llm`
 */
export const Route = createFileRoute("/debug/llm")({
  component: LLMDebugPage,
});
