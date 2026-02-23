/**
 * HomePage — landing page with navigation cards.
 *
 * Ported from src/pages/HomePage.js (67 lines).
 * Uses TanStack Router Link (replacing React Router Link).
 * Uses Zustand useUiStore (replacing SettingsContext).
 * CSS mapped to Tailwind classes matching App.css exactly.
 */

import { Link } from "@tanstack/react-router";

import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";
import { useUiStore } from "@/stores/ui-store";


/** Shared styles for all navigation cards */
const navCardBase = cn(
  "bg-[var(--bg)] border border-[var(--border)]",
  "rounded-lg p-6",
  "flex flex-col items-center text-center",
  "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
  "no-underline text-[var(--text)]",
  "shadow-[0_4px_6px_var(--shadow)]",
  "hover:-translate-y-[5px] hover:border-[var(--primary)]",
  "hover:shadow-[0_12px_24px_var(--shadow)] hover:bg-[var(--shadow)]",
);

export function HomePage() {
  const setSettingsModalOpen = useUiStore(
    (state) => state.setSettingsModalOpen,
  );

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        {/* Hero Section */}
        <div className="text-center mb-10">
          <h1 className="text-[3.5rem] mb-[0.2em] text-shadow-[0_4px_8px_var(--shadow)]">
            DungeonGPT
          </h1>
          <p
            className={cn(
              "font-[family-name:var(--font-header)]",
              "text-[var(--text-secondary)]",
              "text-[1.1rem] tracking-[0.2em] uppercase",
            )}
          >
            Enter the realm of infinite stories
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-5">
          {/* Primary Card — Start Adventure */}
          <Link
            to="/game/settings"
            className={cn(
              "bg-[var(--primary)] border border-[var(--primary)]",
              "rounded-lg p-[30px]",
              "flex items-center justify-center gap-5 text-center",
              "no-underline",
              "shadow-[0_4px_6px_var(--shadow)]",
              "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              "hover:-translate-y-[5px] hover:bg-transparent",
              "hover:shadow-[0_12px_24px_var(--shadow)] hover:border-[var(--primary)]",
              "group",
            )}
          >
            <span className="text-[2.5rem]">&#x2694;&#xFE0F;</span>
            <div>
              <h3 className="m-0 text-[1.5rem] !text-black group-hover:!text-[var(--primary)]">
                Start Adventure
              </h3>
              <p className="!text-black/80 mt-[5px] mb-0 group-hover:!text-[var(--primary)]">
                Begin a new story with your party
              </p>
            </div>
          </Link>

          {/* Grid of secondary cards */}
          <div className="grid grid-cols-3 gap-5">
            <Link to="/characters/create" className={navCardBase}>
              <span className="text-[2rem] mb-[15px]">
                &#x1F9D9;&#x200D;&#x2642;&#xFE0F;
              </span>
              <div>
                <h3 className="m-0 text-[1.2rem] font-[family-name:var(--font-header)]">
                  Create Hero
                </h3>
                <p className="mt-[10px] mb-0 text-[0.9rem] text-[var(--text-secondary)]">
                  Forge a new legend
                </p>
              </div>
            </Link>

            <Link to="/characters" className={navCardBase}>
              <span className="text-[2rem] mb-[15px]">&#x1F4DC;</span>
              <div>
                <h3 className="m-0 text-[1.2rem] font-[family-name:var(--font-header)]">
                  Hall of Heroes
                </h3>
                <p className="mt-[10px] mb-0 text-[0.9rem] text-[var(--text-secondary)]">
                  View your collection
                </p>
              </div>
            </Link>

            <Link to="/saves" className={navCardBase}>
              <span className="text-[2rem] mb-[15px]">&#x1F4D6;</span>
              <div>
                <h3 className="m-0 text-[1.2rem] font-[family-name:var(--font-header)]">
                  Chronicles
                </h3>
                <p className="mt-[10px] mb-0 text-[0.9rem] text-[var(--text-secondary)]">
                  Resume your journeys
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-[50px] text-center border-t border-[var(--border)] pt-[30px]">
          <Button
            variant="outline"
            onClick={() => {
              setSettingsModalOpen(true);
            }}
            className={cn(
              "bg-transparent border-dashed border-[var(--primary)]",
              "text-[var(--primary)]",
              "hover:bg-[var(--shadow)] hover:scale-105",
            )}
          >
            &#x2699;&#xFE0F; Configure AI Engine
          </Button>
        </div>
      </PageCard>
    </PageLayout>
  );
}
