/**
 * SavedConversationsPage — list/load/delete saved game sessions.
 *
 * Ported from src/pages/SavedConversations.js (279 lines).
 * Uses TanStack Query (replacing direct fetch).
 * Uses TanStack Router (replacing React Router).
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { ConversationListItem } from "@dungeongpt/shared";

import {
  useConversations,
  useDeleteConversation,
} from "@/api/client";
import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";
import { useGameStore } from "@/stores/game-store";


function formatDate(timestamp: string | null | undefined): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

function formatProvider(provider: string | null | undefined): string {
  if (!provider) return "Not set";
  const map: Record<string, string> = {
    openai: "OpenAI",
    gemini: "Gemini",
    claude: "Claude",
  };
  return map[provider.toLowerCase()] ?? provider;
}

function formatModel(model: string | null | undefined): string {
  if (!model) return "Not set";
  return model;
}

export function SavedConversationsPage() {
  const { data: conversations, isLoading, error } = useConversations();

  // Sort by timestamp descending
  const sorted = conversations
    ? [...conversations].toSorted((a, b) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dateB - dateA;
      })
    : [];

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <h1>Saved Conversations</h1>
        <p>
          Manage your saved game sessions. Click &quot;Load&quot; to continue a
          previous adventure.
        </p>

        {isLoading ? (
          <p className="text-center text-[var(--text-secondary)]">
            Loading conversations...
          </p>
        ) : error ? (
          <p className="text-center text-[var(--danger)]">
            Failed to load conversations.
          </p>
        ) : sorted.length === 0 ? (
          <p>
            No saved conversations found. Start a new game to create your
            first adventure!
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sorted.map((conversation) => (
              <ConversationCard
                key={conversation.sessionId}
                conversation={conversation}
              />
            ))}
          </div>
        )}

        <div className="flex justify-center gap-5 mt-8">
          <Button variant="secondary" asChild>
            <Link to="/">Back to Home</Link>
          </Button>
          <Button asChild>
            <Link to="/game/settings">Start New Game</Link>
          </Button>
        </div>
      </PageCard>
    </PageLayout>
  );
}

// ── ConversationCard ────────────────────────────────────────────────────────

interface ConversationCardProps {
  readonly conversation: ConversationListItem;
}

function ConversationCard({ conversation }: ConversationCardProps) {
  const navigate = useNavigate();
  const deleteConversation = useDeleteConversation();
  const setSessionId = useGameStore((s) => s.setSessionId);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLoad = () => {
    setLoadingId(conversation.sessionId);
    setSessionId(conversation.sessionId);
    void navigate({ to: "/game/play" });
  };

  const handleDelete = () => {
    if (!globalThis.confirm("Are you sure you want to delete this conversation?")) {
      return;
    }
    deleteConversation.mutate(conversation.sessionId);
  };

  return (
    <div
      className={cn(
        "bg-[var(--surface)] border border-[var(--border)]",
        "rounded-lg p-5",
        "shadow-[0_4px_12px_var(--shadow)]",
        "transition-all duration-200 ease-in-out",
      )}
    >
      <div className="mb-3">
        <h3 className="mt-0 mb-[10px] text-[var(--text)] font-[family-name:var(--font-header)] text-[1.2rem]">
          {conversation.conversation_name ?? "Untitled Adventure"}
        </h3>
      </div>

      <div className="mb-3 text-[0.9rem]">
        <p className="my-[5px]">
          <strong>Date:</strong> {formatDate(conversation.timestamp)}
        </p>
        <p className="my-[5px]">
          <strong>Provider:</strong>{" "}
          {formatProvider(conversation.provider)}
        </p>
        <p className="my-[5px]">
          <strong>Model:</strong> {formatModel(conversation.model)}
        </p>
        <p className="my-[5px]">
          <strong>Session ID:</strong> {conversation.sessionId}
        </p>
        {conversation.summary ? (
          <p className="my-[5px]">
            <strong>Summary:</strong>{" "}
            {conversation.summary.slice(0, 100)}...
          </p>
        ) : null}
      </div>

      <div className="flex gap-[10px]">
        <Button
          onClick={handleLoad}
          disabled={loadingId === conversation.sessionId}
        >
          Load Game
        </Button>
        <Button variant="outline" asChild>
          <Link
            to="/saves/manage/$sessionId"
            params={{ sessionId: conversation.sessionId }}
          >
            Manage Messages
          </Link>
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteConversation.isPending}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
