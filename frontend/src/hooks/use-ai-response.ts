/**
 * useAIResponse — AI response generation, cleaning, and trigger detection.
 *
 * Ported from src/hooks/useGameInteraction.js response handling logic.
 */

import { useCallback } from "react";

import { useGenerateAI } from "@/api/client";
import {
  buildSummarizePrompt,
  useGamePrompts,
} from "@/hooks/use-game-prompts";
import { useMilestones } from "@/hooks/use-milestones";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";

// ── Constants (ported from useGameInteraction.js) ───────────────────────────

const TRIGGER_REGEX = /\[(CHECK|ROLL):\s*([a-z0-9][a-z0-9 ]*)\]/i;

// ── Response cleaning (ported as-is) ────────────────────────────────────────

function cleanAIResponse(
  response: string,
  contextToRemove: string | null,
): string {
  let cleaned = response;

  if (contextToRemove && cleaned.includes(contextToRemove)) {
    cleaned = cleaned.replace(contextToRemove, "");
  }

  cleaned = cleaned.replaceAll(/\[CONTEXT\][\s\S]*?\[TASK\]/gi, "");
  cleaned = cleaned.replaceAll(/\[ADVENTURE START\]/gi, "");
  cleaned = cleaned.replaceAll(/Current Summary:.*?beginning\./gi, "");
  cleaned = cleaned.replaceAll(
    /Describe the arrival.*?narrative description\./gi,
    "",
  );
  cleaned = cleaned.replaceAll(/([a-z,])\n([a-z])/gi, "$1 $2");
  cleaned = cleaned.replaceAll(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  return cleaned;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAIResponse() {
  const generateAI = useGenerateAI();
  const { buildStart, buildInteraction } = useGamePrompts();
  const { processMilestoneMarkers } = useMilestones();

  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);

  const setConversation = useGameStore((s) => s.setConversation);
  const addMessage = useGameStore((s) => s.addMessage);
  const setCurrentSummary = useGameStore((s) => s.setCurrentSummary);
  const setIsLoading = useGameStore((s) => s.setIsLoading);
  const setError = useGameStore((s) => s.setError);
  const setCheckRequest = useGameStore((s) => s.setCheckRequest);
  const setHasAdventureStarted = useGameStore(
    (s) => s.setHasAdventureStarted,
  );
  const setLastPrompt = useGameStore((s) => s.setLastPrompt);
  const setUserInput = useGameStore((s) => s.setUserInput);
  const conversation = useGameStore((s) => s.conversation);
  const currentSummary = useGameStore((s) => s.currentSummary);
  const hasAdventureStarted = useGameStore((s) => s.hasAdventureStarted);
  const isLoading = useGameStore((s) => s.isLoading);
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const userInput = useGameStore((s) => s.userInput);

  /** Detect triggers like [CHECK: Perception] in AI response. */
  const detectTriggers = useCallback(
    (response: string) => {
      const match = TRIGGER_REGEX.exec(response);
      if (match) {
        const type = match[1]?.toUpperCase();
        const value = match[2]?.trim();
        if (type === "CHECK" && value) {
          setCheckRequest({ type: "skill", skill: value });
        }
      }
    },
    [setCheckRequest],
  );

  /** Generate a summarization of the conversation. */
  const summarize = useCallback(
    async (
      summary: string,
      newMessages: readonly { role: string; content: string }[],
    ) => {
      const prompt = buildSummarizePrompt(summary, newMessages);
      try {
        const result = await generateAI.mutateAsync({
          provider: selectedProvider,
          model: selectedModel,
          prompt,
          maxTokens: 400,
          temperature: 0.3,
        });
        return result.text;
      } catch {
        return summary;
      }
    },
    [generateAI, selectedProvider, selectedModel],
  );

  /** Start the adventure — generate first AI narration. */
  const handleStartAdventure = useCallback(async () => {
    if (hasAdventureStarted || isLoading) return;
    if (selectedHeroes.length === 0) {
      setError("Cannot start game without selecting heroes.");
      return;
    }

    setHasAdventureStarted(true);
    setIsLoading(true);
    setError(null);

    const prompt = buildStart();
    setLastPrompt(prompt);

    try {
      const result = await generateAI.mutateAsync({
        provider: selectedProvider,
        model: selectedModel,
        prompt,
        maxTokens: 1600,
        temperature: 0.7,
      });

      const aiResponse = cleanAIResponse(result.text, null);
      detectTriggers(aiResponse);

      if (!aiResponse.trim()) {
        return;
      }

      const aiMessage = { role: "ai" as const, content: aiResponse };
      addMessage(aiMessage);

      const updatedSummary = await summarize(currentSummary, [aiMessage]);
      setCurrentSummary(updatedSummary);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Error starting adventure: ${message}`);
      addMessage({
        role: "ai",
        content: `Error: Could not start the adventure. ${message}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    hasAdventureStarted,
    isLoading,
    selectedHeroes,
    setHasAdventureStarted,
    setIsLoading,
    setError,
    buildStart,
    setLastPrompt,
    generateAI,
    selectedProvider,
    selectedModel,
    detectTriggers,
    addMessage,
    summarize,
    currentSummary,
    setCurrentSummary,
  ]);

  /** Submit user message and get AI response. */
  const handleSubmit = useCallback(
    async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      if (!hasAdventureStarted || !userInput.trim() || isLoading) return;
      if (selectedHeroes.length === 0) {
        setError("Cannot start game without selecting heroes.");
        return;
      }

      const userMessage = { role: "user" as const, content: userInput };
      const tempConversation = [...conversation, userMessage];
      setConversation(tempConversation);
      setUserInput("");
      setIsLoading(true);
      setError(null);

      const prompt = buildInteraction(userInput);
      setLastPrompt(prompt);

      try {
        const result = await generateAI.mutateAsync({
          provider: selectedProvider,
          model: selectedModel,
          prompt,
          maxTokens: 1600,
          temperature: 0.7,
        });

        let aiResponse = cleanAIResponse(result.text, null);

        // Process milestone and campaign markers
        aiResponse = processMilestoneMarkers(aiResponse);

        // Detect triggers
        detectTriggers(aiResponse);

        if (!aiResponse.trim()) {
          setError("AI returned an empty response. Please try again.");
          return;
        }

        const aiMessage = { role: "ai" as const, content: aiResponse };
        setConversation([...tempConversation, aiMessage]);

        const updatedSummary = await summarize(currentSummary, [
          userMessage,
          aiMessage,
        ]);
        setCurrentSummary(updatedSummary);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setError(
          `Error getting response from ${selectedProvider}: ${message}`,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      hasAdventureStarted,
      userInput,
      isLoading,
      selectedHeroes,
      conversation,
      setConversation,
      setUserInput,
      setIsLoading,
      setError,
      buildInteraction,
      setLastPrompt,
      generateAI,
      selectedProvider,
      selectedModel,
      processMilestoneMarkers,
      detectTriggers,
      summarize,
      currentSummary,
      setCurrentSummary,
    ],
  );

  return { handleStartAdventure, handleSubmit };
}
