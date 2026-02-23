/**
 * Game Layout — sidebar + main content + chat bar layout.
 *
 * Ported from src/App.css game layout structure:
 *
 * .game-page-wrapper:
 *   height: calc(100vh - 60px), width: 100%, overflow: hidden
 *
 * .game-container:
 *   display: flex, height: 100%, width: 100%, overflow: hidden
 *
 * .game-chat-bar / .party-bar (sidebars):
 *   width: 280px, flex-shrink: 0, padding: 15px, flex-col,
 *   overflow-y: auto, bg var(--surface), border-left 1px var(--border),
 *   box-shadow: -2px 0 5px var(--shadow)
 *
 * .game-main:
 *   flex-grow: 1, flex-col, padding: 20px, overflow-y: auto,
 *   bg var(--surface)
 *
 * Order: chat-bar (left) | main (center) | party-bar (right)
 */

import { cn } from "@/lib/utils";

interface GameLayoutProps {
  readonly chatSidebar?: React.ReactNode;
  readonly partySidebar?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}

const SIDEBAR_BASE = [
  "w-[280px] shrink-0",
  "p-4 flex flex-col",
  "overflow-y-auto",
  "bg-[var(--surface)] text-[var(--text)]",
  "box-border h-full",
].join(" ");

export function GameLayout({
  chatSidebar,
  partySidebar,
  children,
  className,
}: GameLayoutProps) {
  return (
    <div
      className={cn(
        "h-[calc(100vh-70px)] w-full overflow-hidden",
        className,
      )}
    >
      <div className="flex h-full w-full overflow-hidden">
        {/* Left sidebar — chat history */}
        {chatSidebar && (
          <aside
            className={cn(
              SIDEBAR_BASE,
              "border-r border-[var(--border)]",
              "shadow-[2px_0_5px_var(--shadow)]",
            )}
          >
            {chatSidebar}
          </aside>
        )}

        {/* Main content area */}
        <main
          className={cn(
            "grow flex flex-col",
            "p-5 h-full box-border",
            "overflow-y-auto",
            "bg-[var(--surface)]",
          )}
        >
          {children}
        </main>

        {/* Right sidebar — party */}
        {partySidebar && (
          <aside
            className={cn(
              SIDEBAR_BASE,
              "border-l border-[var(--border)]",
              "shadow-[-2px_0_5px_var(--shadow)]",
            )}
          >
            {partySidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
