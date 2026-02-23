/**
 * LLMDebugPage — LLM pipeline debug and testing.
 *
 * Ported from src/pages/LLMDebug.js (512 lines).
 * Adapted from the old SSE/CLI task system to use the new AI Gateway endpoint.
 * Tests: server connectivity, AI generation, response parsing, summarization,
 * and full pipeline simulation.
 */

import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useGenerateAI } from "@/api/client";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";
import { useSettingsStore } from "@/stores/settings-store";

const UNKNOWN_ERROR = "Unknown error";

// ── Ported sanitizer (from LLMDebug.js) — kept as-is ───────────────────────
const sanitizeResponse = (text: string): string => {
  if (!text) return "";
  let s = text.replaceAll(
    /\[STRICT DUNGEON MASTER PROTOCOL\][\s\S]*?\[\/STRICT DUNGEON MASTER PROTOCOL\]/gi,
    "",
  );
  const markers = [
    /\[ADVENTURE START\]/gi,
    /\[GAME INFORMATION\]/gi,
    /\[TASK\]/gi,
    /\[CONTEXT\]/gi,
    /\[SUMMARY\]/gi,
    /\[PLAYER ACTION\]/gi,
    /\[NARRATE\]/gi,
  ];
  for (const m of markers) {
    s = s.replace(m, "");
  }
  return s.trim();
};

// ── Shared styles ───────────────────────────────────────────────────────────

const monoClass = cn(
  "font-mono text-[0.8rem] bg-[var(--bg)] p-3 rounded",
  "border border-[var(--border)] text-[var(--text-secondary)]",
  "min-h-[40px] max-h-[400px] overflow-y-auto whitespace-pre-wrap",
);

// ── Sub-components ──────────────────────────────────────────────────────────

function TestCard({
  number,
  title,
  description,
  children,
}: {
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-5">
      <h2 className="mt-0 text-[1.1rem] text-[#64b5f6]">
        <span
          className={cn(
            "bg-[#64b5f6] text-black rounded-full",
            "w-7 h-7 inline-flex items-center justify-center",
            "mr-2.5 text-[0.85rem]",
          )}
        >
          {number}
        </span>
        {title}
      </h2>
      <p className="text-[var(--text-secondary)] -mt-1 text-[0.8rem]">
        {description}
      </p>
      {children}
    </div>
  );
}

function ResultBox({
  label,
  value,
  isError,
}: {
  readonly label: string;
  readonly value: string;
  readonly isError: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="text-[0.75rem] text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={cn(
          monoClass,
          isError ? "border-2 border-[#f44336] text-[#f44336]" : "",
        )}
      >
        {value || "(no result yet)"}
      </div>
    </div>
  );
}

function StatusBadge({
  ok,
  message,
}: {
  readonly ok: boolean;
  readonly message: string;
}) {
  return (
    <div
      className={cn(
        "mt-2 p-3 bg-[var(--bg)] rounded whitespace-pre-wrap",
        ok ? "border border-[#4caf50]" : "border border-[#f44336]",
      )}
    >
      <span className={cn("font-bold", ok ? "text-[#4caf50]" : "text-[#f44336]")}>
        {ok ? "PASS" : "FAIL"}
      </span>
      <span className="ml-3 text-[var(--text)]">{message}</span>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function LLMDebugPage() {
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const [model, setModel] = useState(selectedModel || "@cf/meta/llama-3.1-8b-instruct-fast");
  const [provider, setProvider] = useState(selectedProvider || "workers-ai");

  const generateAI = useGenerateAI();

  // Helper to call AI and return response text
  const callAI = async (prompt: string): Promise<string> => {
    const response = await generateAI.mutateAsync({
      provider,
      model,
      prompt,
    });
    return response.text;
  };

  // ── Test 1: Server connectivity ──
  const [t1Status, setT1Status] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [t1Running, setT1Running] = useState(false);

  const runTest1 = async () => {
    setT1Running(true);
    setT1Status(null);
    try {
      const result = await callAI("Say hello");
      if (result.trim()) {
        setT1Status({
          ok: true,
          msg: `Server is reachable. Got ${String(result.length)} chars response.`,
        });
      } else {
        setT1Status({ ok: false, msg: "Server responded but with empty text." });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : UNKNOWN_ERROR;
      setT1Status({
        ok: false,
        msg: `Cannot reach server. Error: ${message}\n\n(Is the backend Worker running?)`,
      });
    }
    setT1Running(false);
  };

  // ── Test 2: Simple generation ──
  const [t2Status, setT2Status] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [t2Running, setT2Running] = useState(false);
  const [t2Response, setT2Response] = useState("");

  const runTest2 = async () => {
    setT2Running(true);
    setT2Status(null);
    setT2Response("");
    try {
      const result = await callAI(
        'Say the word "pineapple" and nothing else.',
      );
      setT2Response(result);
      const hasPineapple = result.toLowerCase().includes("pineapple");
      setT2Status({
        ok: hasPineapple,
        msg: hasPineapple
          ? `AI returned correct response (${String(result.length)} chars).`
          : `AI responded but didn't say "pineapple": "${result.slice(0, 100)}"`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : UNKNOWN_ERROR;
      setT2Status({ ok: false, msg: `Generation failed: ${message}` });
    }
    setT2Running(false);
  };

  // ── Test 3: Response parsing + sanitization ──
  const [t3Status, setT3Status] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [t3Running, setT3Running] = useState(false);
  const [t3Raw, setT3Raw] = useState("");
  const [t3Sanitized, setT3Sanitized] = useState("");

  const runTest3 = async () => {
    setT3Running(true);
    setT3Status(null);
    setT3Raw("");
    setT3Sanitized("");

    const prompt = `[CONTEXT]\nSetting: Fantasy kingdom. Party: Marius (Paladin).\nPlayer moved to plains (7, 2).\n\n[TASK]\nDescribe what the party sees. Begin directly with the narrative.`;

    try {
      const fullText = await callAI(prompt);
      setT3Raw(fullText);
      const sanitized = sanitizeResponse(fullText);
      setT3Sanitized(sanitized);

      const checks: string[] = [];
      if (!fullText.trim()) checks.push("Raw text is EMPTY");
      if (fullText.includes("[STRICT DUNGEON MASTER"))
        checks.push("Raw text contains DM_PROTOCOL echo (prompt leaked)");
      if (fullText.includes("[CONTEXT]") || fullText.includes("[TASK]"))
        checks.push("Raw text contains prompt markers");
      if (!sanitized.trim() && fullText.trim())
        checks.push("Sanitizer stripped ALL content");
      if (!sanitized.trim() && !fullText.trim())
        checks.push("No content at all");

      setT3Status({
        ok: sanitized.trim().length > 0 && checks.length === 0,
        msg:
          checks.length === 0
            ? `Response OK. ${String(fullText.length)} chars raw -> ${String(sanitized.length)} chars sanitized.`
            : `Issues found:\n${checks.map((c) => `  - ${c}`).join("\n")}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : UNKNOWN_ERROR;
      setT3Status({ ok: false, msg: `Failed: ${message}` });
    }
    setT3Running(false);
  };

  // ── Test 4: Summarization ──
  const [t4Status, setT4Status] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [t4Running, setT4Running] = useState(false);
  const [t4Result, setT4Result] = useState("");

  const runTest4 = async () => {
    setT4Running(true);
    setT4Status(null);
    setT4Result("");

    const prompt = `You are a concise story summarizer. Combine the old summary with the recent exchange into a single brief summary (2-4 sentences) capturing key events, locations, and character actions. Output ONLY the summary text, nothing else.\n\nOld summary: The party has reached the village of Frostwood.\n\nRecent exchange:\nAI: The rolling grasslands stretch before Marius. The path to Oakhaven lies ahead.\n\nNew summary:`;

    try {
      const fullText = await callAI(prompt);
      const result = sanitizeResponse(fullText);
      setT4Result(result);

      const checks: string[] = [];
      if (!result.trim()) checks.push("Summary is empty");
      if (result.includes("concise story summarizer"))
        checks.push("Summary contains the summarization PROMPT (contamination)");
      if (result.includes("Old summary:"))
        checks.push('Summary contains "Old summary:" (prompt echo)');
      if (result.includes("[STRICT DUNGEON"))
        checks.push("Summary contains DM_PROTOCOL");
      if (result.length > 500)
        checks.push(`Summary is ${String(result.length)} chars (too long)`);

      setT4Status({
        ok: result.trim().length > 0 && checks.length === 0,
        msg:
          checks.length === 0
            ? `Summary OK (${String(result.length)} chars). Clean, no contamination.`
            : `Issues:\n${checks.map((c) => `  - ${c}`).join("\n")}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : UNKNOWN_ERROR;
      setT4Status({ ok: false, msg: `Failed: ${message}` });
    }
    setT4Running(false);
  };

  const anyRunning = t1Running || t2Running || t3Running || t4Running;

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <div className="flex items-center gap-3 mb-2">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/debug">Back to Debug</Link>
          </Button>
          <h1 className="text-xl m-0">LLM Pipeline Debug</h1>
        </div>
        <p className="text-[var(--text-secondary)] mt-0 mb-5">
          Run each test in order. Each tests one piece of the pipeline. If a
          test fails, the problem is in that stage.
        </p>

        {/* Model selector */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mb-5 flex items-center gap-4 flex-wrap">
          <span className="text-[var(--text-secondary)] text-[0.8rem]">
            Provider:
          </span>
          <input
            value={provider}
            onChange={(e) => { setProvider(e.target.value); }}
            className="p-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded font-mono text-[0.8rem] w-40"
          />
          <span className="text-[var(--text-secondary)] text-[0.8rem]">
            Model:
          </span>
          <input
            value={model}
            onChange={(e) => { setModel(e.target.value); }}
            className="p-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded font-mono text-[0.8rem] w-64"
          />
        </div>

        {/* Test 1 */}
        <TestCard
          number="1"
          title="Server Connectivity"
          description="Can the browser reach the backend Worker? Sends a simple prompt and checks the response."
        >
          <Button onClick={() => { void runTest1(); }} disabled={anyRunning}>
            {t1Running ? "Testing..." : "Test Connection"}
          </Button>
          {t1Status ? (
            <StatusBadge ok={t1Status.ok} message={t1Status.msg} />
          ) : null}
        </TestCard>

        {/* Test 2 */}
        <TestCard
          number="2"
          title="Simple Generation"
          description='Sends a tiny prompt and checks the AI returns the expected word. Should say "pineapple".'
        >
          <Button onClick={() => { void runTest2(); }} disabled={anyRunning}>
            {t2Running ? "Generating..." : "Test Generation"}
          </Button>
          {t2Response ? (
            <ResultBox
              label='LLM Response (should say "pineapple")'
              value={t2Response}
              isError={!t2Response.toLowerCase().includes("pineapple")}
            />
          ) : null}
          {t2Status ? (
            <StatusBadge ok={t2Status.ok} message={t2Status.msg} />
          ) : null}
        </TestCard>

        {/* Test 3 */}
        <TestCard
          number="3"
          title="Response Parsing + Sanitization"
          description="Sends a game-style prompt. Checks that the response doesn't echo the prompt and that sanitization produces clean text."
        >
          <Button onClick={() => { void runTest3(); }} disabled={anyRunning}>
            {t3Running ? "Generating..." : "Test Response Parsing"}
          </Button>
          {t3Raw ? (
            <ResultBox
              label="Raw text (before sanitize)"
              value={t3Raw}
              isError={!t3Raw.trim()}
            />
          ) : null}
          {t3Sanitized ? (
            <ResultBox
              label="Sanitized text (what the chat would show)"
              value={t3Sanitized}
              isError={!t3Sanitized.trim()}
            />
          ) : null}
          {t3Status ? (
            <StatusBadge ok={t3Status.ok} message={t3Status.msg} />
          ) : null}
        </TestCard>

        {/* Test 4 */}
        <TestCard
          number="4"
          title="Summarization"
          description="Tests summary generation. Checks that the result is clean and doesn't contain the summarization prompt."
        >
          <Button
            onClick={() => { void runTest4(); }}
            disabled={anyRunning}
            className="bg-[#ff9800]"
          >
            {t4Running ? "Summarizing..." : "Test Summarization"}
          </Button>
          {t4Result ? (
            <ResultBox
              label="Summary result"
              value={t4Result}
              isError={!t4Result.trim()}
            />
          ) : null}
          {t4Status ? (
            <StatusBadge ok={t4Status.ok} message={t4Status.msg} />
          ) : null}
        </TestCard>
      </PageCard>
    </PageLayout>
  );
}
