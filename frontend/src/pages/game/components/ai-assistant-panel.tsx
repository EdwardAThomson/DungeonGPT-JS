/**
 * AiAssistantPanel — floating OOC rules & mechanics assistant.
 *
 * Ported from src/components/AiAssistantPanel.js (231 lines).
 * Uses the backend AI generate endpoint instead of the old CLI/SSE system.
 * Renders AI responses safely via react-markdown (no dangerouslySetInnerHTML).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { Character } from "@dungeongpt/shared";

import { useGenerateAI } from "@/api/client";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";


// ── PROMPT_SNIPPET constant (ported from llm_constants.js) ──────────────────
// This is the OOC assistant system prompt, kept exactly as-is from the source.
const PROMPT_SNIPPET = `You are an Out-of-Character (OOC) Rules & Mechanics Assistant for a tabletop-style fantasy RPG. Do NOT speak in-character. Your goal is to help the player with rules, strategies, and facts about the world or the code.`;

/** Serialize game state to provide context to the AI. Ported as-is. */
function serializeGameState(
  selectedHeroes: readonly Character[],
  playerPosition: { readonly x: number; readonly y: number } | null,
  isInsideTown: boolean,
): string {
  const heroes =
    selectedHeroes.length > 0
      ? selectedHeroes
          .map(
            (h) =>
              `- ${h.characterName} (${h.characterRace} ${h.characterClass})`,
          )
          .join("\n")
      : "No heroes selected.";

  const position = playerPosition
    ? `X: ${String(playerPosition.x)}, Y: ${String(playerPosition.y)}`
    : "Unknown";

  return `
[GAME CONTEXT (OUT-OF-CHARACTER RULES ASSISTANT)]
Heroes:
${heroes}

Current Position: ${position}
Is Inside Town: ${isInsideTown ? "Yes" : "No"}

You are an Out-of-Character (OOC) Rules & Mechanics Assistant. Do NOT speak in-character.
Your goal is to help the player with rules, strategies, and facts about the world or the code.
`;
}

// ── Log entry type ──────────────────────────────────────────────────────────

interface LogEntry {
  readonly line: string;
  readonly stream: "stdout" | "stderr";
  readonly ts: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function AiAssistantPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<
    "idle" | "running" | "completed" | "error"
  >("idle");
  const [logs, setLogs] = useState<readonly LogEntry[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const generateAI = useGenerateAI();

  // Zustand selectors
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const assistantProvider = useSettingsStore((s) => s.assistantProvider);
  const assistantModel = useSettingsStore((s) => s.assistantModel);

  // isInsideTown is managed by the useTownMap hook, not the game store.
  // For the assistant, we default to false — it's context, not critical.
  const isInsideTown = false;

  // Auto-scroll when logs change
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) return;

    setStatus("running");
    setLogs([]);

    const contextBlock = serializeGameState(
      selectedHeroes,
      playerPosition,
      isInsideTown,
    );
    const fullPrompt = `${PROMPT_SNIPPET}\n\n${contextBlock}\n\n[USER COMMAND]\n${prompt}`;

    try {
      const response = await generateAI.mutateAsync({
        provider: assistantProvider,
        model: assistantModel,
        prompt: fullPrompt,
      });

      const responseText = response.text;

      setLogs([
        {
          line: responseText,
          stream: "stdout",
          ts: new Date().toISOString(),
        },
      ]);
      setStatus("completed");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus("error");
      setLogs((prev) => [
        ...prev,
        {
          line: `API Error: ${message}`,
          stream: "stderr",
          ts: new Date().toISOString(),
        },
      ]);
    }
  }, [
    prompt,
    selectedHeroes,
    playerPosition,
    isInsideTown,
    assistantProvider,
    assistantModel,
    generateAI,
  ]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
        className={cn(
          "fixed bottom-5 right-[300px] z-50",
          "bg-[rgba(76,29,149,0.8)] text-white",
          "p-3 rounded-full text-xl",
          "shadow-lg border border-[rgba(139,92,246,0.5)]",
          "cursor-pointer hover:bg-[rgba(76,29,149,1)]",
          "transition-colors duration-200",
        )}
        title="AI Assistant"
      >
        🤖
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 w-[450px] h-[400px] z-50",
        "bg-[#0c0a09] border border-[rgba(139,92,246,0.3)]",
        "rounded-lg shadow-2xl",
        "flex flex-col overflow-hidden",
        "font-mono text-xs",
      )}
    >
      {/* Header */}
      <AssistantHeader
        status={status}
        provider={assistantProvider}
        onClose={() => {
          setIsOpen(false);
        }}
      />

      {/* Terminal Output */}
      <div
        className={cn(
          "flex-1 overflow-auto p-4",
          "bg-[rgba(0,0,0,0.5)]",
          "flex flex-col gap-1",
        )}
      >
        {logs.length === 0 ? (
          <div className="text-[#4b5563] italic">
            How can I help you, adventurer?
          </div>
        ) : null}
        {logs.map((log) => (
          <div
            key={`${log.ts}-${log.stream}`}
            className={cn(
              "whitespace-pre-wrap break-all",
              log.stream === "stderr" ? "text-[#f87171]" : "text-[#d1d5db]",
            )}
          >
            <span className="text-[#4b5563] mr-2">
              [{new Date(log.ts).toLocaleTimeString()}]
            </span>
            {log.stream === "stdout" ? (
              <ReactMarkdown>{log.line}</ReactMarkdown>
            ) : (
              log.line
            )}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* Input Area */}
      <div
        className={cn(
          "p-3 bg-[#1c1917]",
          "border-t border-[rgba(255,255,255,0.1)]",
          "flex gap-2",
        )}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleRun();
            }
          }}
          placeholder="Ask about rules, stats, or mechanics..."
          className={cn(
            "flex-1 bg-[#292524]",
            "border border-[rgba(255,255,255,0.1)]",
            "text-white rounded px-2 py-1.5",
            "outline-none focus:border-[rgba(139,92,246,0.5)]",
          )}
          disabled={status === "running"}
          maxLength={1000}
        />
        <Button
          onClick={() => {
            void handleRun();
          }}
          disabled={status === "running" || !prompt.trim()}
          className={cn(
            "bg-[#7c3aed] text-white font-bold",
            "px-4 py-1.5 rounded",
            "disabled:opacity-50",
          )}
        >
          RUN
        </Button>
      </div>
    </div>
  );
}

// ── Sub-component ───────────────────────────────────────────────────────────

function AssistantHeader({
  status,
  provider,
  onClose,
}: {
  readonly status: string;
  readonly provider: string;
  readonly onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "flex justify-between items-center",
        "bg-[rgba(76,29,149,0.2)] p-2",
        "border-b border-[rgba(255,255,255,0.1)]",
      )}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2 text-[#d8b4fe] font-bold">
          <span>🤖 Rules & Mechanics Assistant</span>
          {status === "running" ? (
            <span className="text-[#4ade80]">●</span>
          ) : null}
        </div>
        <div className="text-[9px] text-[rgba(167,139,250,0.7)] uppercase">
          Backend:{" "}
          <span className="text-white">{provider.toUpperCase()}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="bg-transparent border-none text-[#9ca3af] cursor-pointer text-lg hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
