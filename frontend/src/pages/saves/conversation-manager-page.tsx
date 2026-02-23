/**
 * ConversationManagerPage -- view and manage individual messages in a saved conversation.
 *
 * Ported from src/pages/ConversationManager.js (328 lines).
 * Uses TanStack Router (replacing React Router).
 * Uses TanStack Query (replacing direct fetch).
 * Uses react-markdown for ALL content rendering (replacing dangerouslySetInnerHTML).
 *
 * SECURITY: Zero dangerouslySetInnerHTML. All message content rendered via react-markdown.
 */

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import Markdown from "react-markdown";

import type { ConversationMessage } from "@dungeongpt/shared";

import {
  useConversation,
  useDeleteConversation,
  useUpdateConversationMessages,
} from "@/api/client";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";

// ── Role styling helpers ────────────────────────────────────────────────────

const ROLE_BORDER: Record<string, string> = {
  user: "border-l-[#4a90e2]",
  ai: "border-l-[#8bc34a]",
  system: "border-l-[#ff9800]",
};

const ROLE_BADGE_BG: Record<string, string> = {
  user: "bg-[#4a90e2]",
  ai: "bg-[#8bc34a]",
  system: "bg-[#ff9800]",
};

const ROLE_BADGE_LABEL: Record<string, string> = {
  user: "User",
  ai: "AI",
  system: "System",
};

function getRoleBorderClass(role: string): string {
  return ROLE_BORDER[role] ?? "border-l-[#888]";
}

function getRoleBadgeClass(role: string): string {
  return ROLE_BADGE_BG[role] ?? "bg-[#888]";
}

function getRoleBadgeLabel(role: string): string {
  return ROLE_BADGE_LABEL[role] ?? role;
}

// ── Page component ──────────────────────────────────────────────────────────

export function ConversationManagerPage() {
  const { sessionId } = useParams({
    from: "/saves/manage/$sessionId",
  });

  const { data: conversation, isLoading, error } = useConversation(sessionId);
  const updateMessages = useUpdateConversationMessages();
  const deleteConversation = useDeleteConversation();
  const navigate = useNavigate();

  const messages: ConversationMessage[] =
    conversation?.conversation_data ?? [];

  const handleDeleteMessage = (messageIndex: number) => {
    const updatedMessages = messages.filter((_, idx) => idx !== messageIndex);
    updateMessages.mutate({
      sessionId,
      conversationData: updatedMessages,
    });
  };

  const handleClearAll = () => {
    if (
      !globalThis.confirm(
        "Delete ALL messages from this conversation?",
      )
    ) {
      return;
    }
    updateMessages.mutate({
      sessionId,
      conversationData: [],
    });
  };

  const handleDeleteConversation = () => {
    if (
      !globalThis.confirm(
        "Delete this entire conversation? This cannot be undone.",
      )
    ) {
      return;
    }
    deleteConversation.mutate(sessionId, {
      onSuccess: () => {
        void navigate({ to: "/saves" });
      },
    });
  };

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="m-0 font-[family-name:var(--font-header)]">
            Conversation Manager
          </h1>
          <Button variant="secondary" asChild>
            <Link to="/saves">Back to Saves</Link>
          </Button>
        </div>

        {/* Error display */}
        {error ? (
          <p className="text-center text-[var(--danger)]">
            Failed to load conversation.
          </p>
        ) : null}

        {updateMessages.error ? (
          <p className="text-center text-[var(--danger)]">
            Failed to update messages.
          </p>
        ) : null}

        {/* Loading state */}
        {isLoading ? (
          <p className="text-center text-[var(--text-secondary)]">
            Loading conversation...
          </p>
        ) : null}

        {/* Conversation info and actions */}
        {conversation ? (
          <>
            <div className="flex justify-between items-center mb-5">
              <h3 className="m-0 text-[1.2rem] text-[var(--text)] font-[family-name:var(--font-header)]">
                Messages ({String(messages.length)})
              </h3>
              <div className="flex gap-[10px]">
                <Button
                  variant="outline"
                  onClick={handleClearAll}
                  disabled={
                    updateMessages.isPending || messages.length === 0
                  }
                >
                  Clear All Messages
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConversation}
                  disabled={deleteConversation.isPending}
                >
                  Delete Entire Conversation
                </Button>
              </div>
            </div>

            {/* Message list */}
            {messages.length === 0 ? (
              <p className="text-center text-[var(--text-secondary)] py-10">
                No messages in this conversation.
              </p>
            ) : (
              <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
                {messages.map((msg, idx) => (
                  <MessageCard
                    key={`msg-${String(idx)}`}
                    message={msg}
                    index={idx}
                    onDelete={() => {
                      handleDeleteMessage(idx);
                    }}
                    isDeleting={updateMessages.isPending}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </PageCard>
    </PageLayout>
  );
}

// ── MessageCard sub-component ───────────────────────────────────────────────

interface MessageCardProps {
  readonly message: ConversationMessage;
  readonly index: number;
  readonly onDelete: () => void;
  readonly isDeleting: boolean;
}

function MessageCard({
  message,
  index,
  onDelete,
  isDeleting,
}: MessageCardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--bg)] rounded-lg p-4",
        "border-l-4",
        getRoleBorderClass(message.role),
      )}
    >
      {/* Header row: badge + message number + delete button */}
      <div className="flex justify-between items-center mb-[10px]">
        <div className="flex items-center gap-[10px]">
          <span
            className={cn(
              "px-[10px] py-1 rounded-xl",
              "text-xs font-semibold text-white",
              getRoleBadgeClass(message.role),
            )}
          >
            {getRoleBadgeLabel(message.role)}
          </span>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Message #{String(index + 1)}
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
        >
          Delete
        </Button>
      </div>

      {/* Message content — rendered safely via react-markdown */}
      <div className="text-sm leading-relaxed text-[var(--text)] break-words">
        <Markdown>{message.content}</Markdown>
      </div>
    </div>
  );
}
