import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query client configuration.
 *
 * Settings tuned for a game app:
 *   - staleTime: 5 minutes — character/conversation data doesn't change externally
 *   - gcTime: 30 minutes — keep inactive data in cache for session continuity
 *   - retry: 2 attempts — network hiccups during gameplay shouldn't break flow
 *   - refetchOnWindowFocus: false — game state is managed locally, no need to refetch
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
