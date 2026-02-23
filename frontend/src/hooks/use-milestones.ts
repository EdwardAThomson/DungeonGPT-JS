/**
 * useMilestones — milestone and campaign completion detection.
 *
 * Ported from src/hooks/useGameInteraction.js milestone handling.
 * Detects [COMPLETE_MILESTONE] and [COMPLETE_CAMPAIGN] markers in AI responses.
 */

import { useCallback } from "react";

import { getMilestoneStatus } from "@/hooks/use-game-prompts";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";

// ── Regex patterns (ported exactly from useGameInteraction.js) ──────────────

const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:([^\]]+)\]/i;
const CAMPAIGN_COMPLETE_REGEX = /\[COMPLETE_CAMPAIGN\]/i;

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMilestones() {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const addMessage = useGameStore((s) => s.addMessage);

  /**
   * Process milestone and campaign markers in an AI response.
   * Removes the markers from the response text and triggers side effects.
   * Returns the cleaned response.
   *
   * Ported as-is from useGameInteraction.js lines 272-317.
   */
  const processMilestoneMarkers = useCallback(
    (aiResponse: string): string => {
      let cleaned = aiResponse;

      if (!settings) return cleaned;

      // Check for milestone completion
      const milestoneMatch = MILESTONE_COMPLETE_REGEX.exec(cleaned);
      if (milestoneMatch) {
        const milestoneText = milestoneMatch[1]?.trim() ?? "";

        // Find and mark milestone as complete
        const milestoneStatus = getMilestoneStatus(settings.milestones);
        const milestoneIndex = milestoneStatus.all.findIndex(
          (m) =>
            m.text.toLowerCase().includes(milestoneText.toLowerCase()) ||
            milestoneText.toLowerCase().includes(m.text.toLowerCase()),
        );

        if (milestoneIndex !== -1) {
          const updated = [...milestoneStatus.all];
          const target = updated[milestoneIndex];
          if (target) {
            updated[milestoneIndex] = { ...target, completed: true };
            setSettings({ ...settings, milestones: updated });

            // Add celebration message
            addMessage({
              role: "system",
              content: `\uD83C\uDF89 Milestone Achieved! \uD83C\uDF89\n${target.text}`,
            });
          }
        }

        // Remove the marker from display
        cleaned = cleaned.replace(milestoneMatch[0], "").trim();
      }

      // Check for campaign completion
      const campaignMatch = CAMPAIGN_COMPLETE_REGEX.exec(cleaned);
      if (campaignMatch) {
        setSettings({ ...settings, campaignComplete: true });

        addMessage({
          role: "system",
          content: `\uD83C\uDFC6 CAMPAIGN COMPLETE! \uD83C\uDFC6\n${settings.campaignGoal || "Victory Achieved!"}\n\nThe tale of your heroic deeds will be sung for generations to come!`,
        });

        cleaned = cleaned.replace(campaignMatch[0], "").trim();
      }

      return cleaned;
    },
    [settings, setSettings, addMessage],
  );

  return { processMilestoneMarkers };
}
