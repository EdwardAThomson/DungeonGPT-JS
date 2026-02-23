# Quest Milestones

The milestone and campaign completion system allows the AI DM to mark quest objectives as achieved during gameplay. The AI outputs special markers (`[COMPLETE_MILESTONE: ...]` and `[COMPLETE_CAMPAIGN]`) that the frontend detects and processes.

**Status:** ✅ Implemented and fully integrated in the current stack. Milestone detection, progress tracking, and campaign completion all functional.

## Files

| File | Description |
|------|-------------|
| [quest-milestone-testing.md](./quest-milestone-testing.md) | Testing guide with sample inputs and expected outputs |

## How It Works

1. Game settings define milestones (text + optional map coordinates)
2. The DM_PROTOCOL system prompt instructs the AI to use `[COMPLETE_MILESTONE: exact text]` markers
3. Frontend `useMilestones` hook parses AI responses for these markers
4. UI shows milestone progress and triggers celebration on completion
5. `[COMPLETE_CAMPAIGN]` marks the entire campaign as finished

## Integration Points

- `backend/src/services/ai.ts` — DM_PROTOCOL includes milestone instructions
- `frontend/src/hooks/use-milestones.ts` — milestone detection and state management
- `frontend/src/pages/game/settings/` — milestone editor in game settings
- `shared/src/schemas/game-settings.ts` — milestone schema (text, location, mapX, mapY, id, completed)
