/**
 * ChatPanel — conversation display with message input.
 *
 * Ported from src/pages/Game.js chat section.
 * Uses react-markdown for ALL AI content (replacing dangerouslySetInnerHTML).
 * Uses design-system Message component for role-based styling.
 *
 * SECURITY: All AI and user content rendered safely via react-markdown.
 * Zero dangerouslySetInnerHTML.
 */

import { useCallback, useEffect, useRef } from "react";
import Markdown from "react-markdown";

import type { MessageRole } from "@/design-system/game/message";
import type { ConversationMessage } from "@dungeongpt/shared";

import { Message } from "@/design-system/game/message";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";


interface ChatPanelProps {
  readonly onSubmit: (event?: { preventDefault?: () => void }) => void;
  readonly onStartAdventure: () => void;
}

export function ChatPanel({ onSubmit, onStartAdventure }: ChatPanelProps) {
  const conversation = useGameStore((s) => s.conversation);
  const userInput = useGameStore((s) => s.userInput);
  const setUserInput = useGameStore((s) => s.setUserInput);
  const isLoading = useGameStore((s) => s.isLoading);
  const hasAdventureStarted = useGameStore((s) => s.hasAdventureStarted);
  const error = useGameStore((s) => s.error);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.length]);

  const handleFormSubmit = useCallback(
    (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit({ preventDefault: () => undefined });
    },
    [onSubmit],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasAdventureStarted ? (
          <>
            {conversation.map((msg, index) => (
              <ChatMessage
                key={`msg-${String(index)}`}
                message={msg}
              />
            ))}
            {isLoading ? (
              <Message variant="ai">
                <p className="animate-pulse text-[var(--text-secondary)]">
                  The DM is weaving the tale...
                </p>
              </Message>
            ) : null}
            {error ? (
              <Message variant="error">
                <p>{error}</p>
              </Message>
            ) : null}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="mb-4">Ready to Begin</h2>
              <p className="text-[var(--text-secondary)] mb-6">
                Your party is assembled. Click below to start the adventure.
              </p>
              <Button onClick={onStartAdventure} size="lg">
                Begin Adventure
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      {hasAdventureStarted ? (
        <form
          onSubmit={handleFormSubmit}
          className={cn(
            "flex gap-3 p-4",
            "border-t border-[var(--border)]",
            "bg-[var(--surface)]",
          )}
        >
          <input
            type="text"
            value={userInput}
            onChange={(e) => {
              setUserInput(e.target.value);
            }}
            placeholder="What do you do?"
            disabled={isLoading}
            maxLength={500}
            className={cn(
              "flex-1 p-3",
              "border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]",
              "rounded-[4px] box-border",
              "font-[family-name:var(--font-ui)] text-base",
              "focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_2px_var(--shadow)]",
              "disabled:opacity-50",
            )}
          />
          <Button type="submit" disabled={isLoading || !userInput.trim()}>
            Send
          </Button>
        </form>
      ) : null}
    </div>
  );
}

// ── ChatMessage sub-component ───────────────────────────────────────────────

interface ChatMessageProps {
  readonly message: ConversationMessage;
}

function ChatMessage({ message }: ChatMessageProps) {
  // Map role to design-system Message variant
  const role: MessageRole =
    message.role === "system" ? "system" : message.role;

  return (
    <Message variant={role}>
      {/* SECURITY: All content rendered via react-markdown — no dangerouslySetInnerHTML */}
      <Markdown>{message.content}</Markdown>
    </Message>
  );
}
