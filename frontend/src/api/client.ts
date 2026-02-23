import {
  createCharacterResponseSchema,
  generateAiResponseSchema,
  getCharactersResponseSchema,
  getConversationResponseSchema,
  getConversationsResponseSchema,
  saveConversationResponseSchema,
} from "@dungeongpt/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";

import type {
  CreateCharacterRequest,
  CreateCharacterResponse,
  GenerateAiRequest,
  GenerateAiResponse,
  GetCharactersResponse,
  GetConversationResponse,
  GetConversationsResponse,
  SaveConversationRequest,
  SaveConversationResponse,
} from "@dungeongpt/shared";

// ── Base URL ─────────────────────────────────────────────────────────────────

/**
 * API base URL.
 * In development, Vite's proxy forwards /api to localhost:8787.
 * In production, the frontend is served from the same Worker origin.
 * Falls back to empty string (same-origin) when VITE_API_URL is not set.
 */
const API_BASE = import.meta.env["VITE_API_URL"]
  ? String(import.meta.env["VITE_API_URL"])
  : "";

// ── Typed Fetch Wrapper ──────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Merge headers from RequestInit options with default Content-Type.
 * Avoids spreading Headers/array onto an object (which is invalid).
 */
function buildHeaders(options?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.headers) {
    if (options.headers instanceof Headers) {
      for (const [key, value] of options.headers.entries()) {
        headers[key] = value;
      }
    } else if (!Array.isArray(options.headers)) {
      Object.assign(headers, options.headers);
    }
  }

  return headers;
}

/**
 * Typed fetch wrapper with Zod response validation.
 * All API responses are validated against their Zod schema before use.
 * No raw casts, no `as`, no trust — validate or reject.
 */
async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options),
  });

  if (!response.ok) {
    throw new ApiError(
      `API request failed: ${response.statusText}`,
      response.status,
    );
  }

  const data: unknown = await response.json();
  return schema.parse(data);
}

// ── Query Key Factories ──────────────────────────────────────────────────────

export const queryKeys = {
  characters: {
    all: ["characters"] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    detail: (sessionId: string) => ["conversations", sessionId] as const,
  },
} as const;

// ── Shared response schemas ──────────────────────────────────────────────────

const messageSchema = z.object({ message: z.string() });

// ── Character API ────────────────────────────────────────────────────────────

async function fetchCharacters(): Promise<GetCharactersResponse> {
  return apiFetch("/api/characters", getCharactersResponseSchema);
}

async function createCharacter(
  data: CreateCharacterRequest,
): Promise<CreateCharacterResponse> {
  return apiFetch("/api/characters", createCharacterResponseSchema, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function deleteCharacter(characterId: string): Promise<void> {
  await apiFetch(`/api/characters/${characterId}`, messageSchema, {
    method: "DELETE",
  });
}

// ── Conversation API ─────────────────────────────────────────────────────────

async function fetchConversations(): Promise<GetConversationsResponse> {
  return apiFetch("/api/conversations", getConversationsResponseSchema);
}

async function fetchConversation(
  sessionId: string,
): Promise<GetConversationResponse> {
  return apiFetch(
    `/api/conversations/${sessionId}`,
    getConversationResponseSchema,
  );
}

async function saveConversation(
  data: SaveConversationRequest,
): Promise<SaveConversationResponse> {
  return apiFetch("/api/conversations", saveConversationResponseSchema, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function updateConversationMessages(
  sessionId: string,
  conversationData: unknown[],
): Promise<void> {
  await apiFetch(`/api/conversations/${sessionId}`, messageSchema, {
    method: "PUT",
    body: JSON.stringify({ conversation_data: conversationData }),
  });
}

async function deleteConversation(sessionId: string): Promise<void> {
  await apiFetch(`/api/conversations/${sessionId}`, messageSchema, {
    method: "DELETE",
  });
}

// ── AI API ───────────────────────────────────────────────────────────────────

async function generateAi(
  data: GenerateAiRequest,
): Promise<GenerateAiResponse> {
  return apiFetch("/api/ai/generate", generateAiResponseSchema, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── TanStack Query Hooks ─────────────────────────────────────────────────────

/**
 * Fetch all characters.
 */
export function useCharacters() {
  return useQuery({
    queryKey: queryKeys.characters.all,
    queryFn: fetchCharacters,
  });
}

/**
 * Fetch all saved conversations (list view).
 */
export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations.all,
    queryFn: fetchConversations,
  });
}

/**
 * Fetch a single conversation by session ID.
 */
export function useConversation(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(sessionId ?? ""),
    queryFn: () => {
      if (!sessionId) {
        throw new Error("Session ID is required");
      }
      return fetchConversation(sessionId);
    },
    enabled: sessionId !== null && sessionId.length > 0,
  });
}

/**
 * Save a conversation (create or update).
 * Invalidates conversations list on success.
 */
export function useSaveConversation() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: saveConversation,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });
}

/**
 * Create a new character.
 * Invalidates characters list on success.
 */
export function useCreateCharacter() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: createCharacter,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.characters.all,
      });
    },
  });
}

/**
 * Delete a character by ID.
 * Invalidates characters list on success.
 */
export function useDeleteCharacter() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: deleteCharacter,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.characters.all,
      });
    },
  });
}

/**
 * Delete a saved conversation.
 * Invalidates conversations list on success.
 */
export function useDeleteConversation() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });
}

/**
 * Update conversation messages (PUT conversation_data).
 * Invalidates both the specific conversation and the conversations list.
 */
export function useUpdateConversationMessages() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      conversationData,
    }: {
      sessionId: string;
      conversationData: unknown[];
    }) => updateConversationMessages(sessionId, conversationData),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.sessionId),
      });
      void client.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });
}

/**
 * Generate AI response.
 */
export function useGenerateAI() {
  return useMutation({
    mutationFn: generateAi,
  });
}
