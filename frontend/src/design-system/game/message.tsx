/**
 * Message component — displays a chat message in the game conversation.
 *
 * Visual style ported from src/App.css (.message, .message.user, .message.ai,
 * .message.system, .message.error):
 *
 * Base: padding 10px 15px, rounded-[15px], max-width 75%, word-wrap break-word,
 *       line-height 1.4, shadow 0 1px 2px rgba(0,0,0,0.1)
 *
 * User:  bg var(--primary), color var(--bg), bottom-right-radius 5px,
 *        align-self flex-end, margin-left auto
 *
 * AI:    bg var(--bg), color var(--text), border 1px var(--border),
 *        bottom-left-radius 5px, align-self flex-start, margin-right auto,
 *        white-space pre-line, text-align left
 *
 * System: bg var(--surface), color var(--text-secondary), border 1px var(--border),
 *         align-self center, text-center, italic, 0.9rem, max-width 90%
 *
 * Error:  bg rgba(255,82,82,0.1), color #ff5252, border rgba(255,82,82,0.3),
 *         align-self center, text-center, italic, 0.9rem, max-width 90%
 *
 * SECURITY: This component renders children as React nodes, NOT raw HTML.
 * AI content must be passed through react-markdown before reaching this component.
 */

import { cn } from "@/lib/utils";

export type MessageRole = "user" | "ai" | "system" | "error";

interface MessageProps {
  readonly variant: MessageRole;
  readonly children: React.ReactNode;
  readonly className?: string;
}

const roleStyles: Record<MessageRole, string> = {
  user: [
    "bg-[var(--primary)] text-[var(--bg)]",
    "rounded-br-[5px]",
    "self-end ml-auto",
  ].join(" "),
  ai: [
    "bg-[var(--bg)] text-[var(--text)]",
    "border border-[var(--border)]",
    "rounded-bl-[5px]",
    "self-start mr-auto",
    "whitespace-pre-line text-left",
  ].join(" "),
  system: [
    "bg-[var(--surface)] text-[var(--text-secondary)]",
    "border border-[var(--border)]",
    "self-center text-center italic text-[0.9rem]",
    "max-w-[90%]",
  ].join(" "),
  error: [
    "bg-[rgba(255,82,82,0.1)] text-[#ff5252]",
    "border border-[rgba(255,82,82,0.3)]",
    "self-center text-center italic text-[0.9rem]",
    "max-w-[90%]",
  ].join(" "),
};

export function Message({ variant, children, className }: MessageProps) {
  return (
    <div
      className={cn(
        "px-4 py-2.5 rounded-[15px]",
        "max-w-3/4",
        "break-words leading-[1.4]",
        "shadow-[0_1px_2px_rgba(0,0,0,0.1)]",
        roleStyles[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
