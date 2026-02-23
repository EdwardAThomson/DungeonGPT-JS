/**
 * MainNav — navigation bar used on non-game pages.
 *
 * Ported from src/App.js <nav className="main-nav"> and App.css .main-nav rules.
 * Uses TanStack Router Link (replacing React Router Link/NavLink).
 * Uses Zustand useUiStore (replacing SettingsContext).
 */

import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const navLinkStyle = cn(
  "text-[var(--text)] no-underline font-medium",
  "font-[family-name:var(--font-header)]",
  "text-[0.85rem] tracking-[0.1em] uppercase",
  "px-[15px] py-[10px] rounded-[4px]",
  "transition-all duration-300 ease-in-out",
  "hover:text-[var(--primary)] hover:bg-[var(--shadow)]",
  "border-b-0",
);

export function MainNav() {
  const setSettingsModalOpen = useUiStore(
    (state) => state.setSettingsModalOpen,
  );

  return (
    <ul className="list-none p-0 m-0 flex justify-center items-center h-[70px] gap-[15px]">
      <li className="flex items-center h-full">
        <Link to="/" className={navLinkStyle}>
          Home
        </Link>
      </li>
      <li className="flex items-center h-full">
        <Link to="/game/settings" className={navLinkStyle}>
          New Adventure
        </Link>
      </li>
      <li className="flex items-center h-full">
        <Link to="/characters/create" className={navLinkStyle}>
          Create Hero
        </Link>
      </li>
      <li className="flex items-center h-full">
        <Link to="/characters" className={navLinkStyle}>
          Heroes
        </Link>
      </li>
      <li className="flex items-center h-full">
        <Link to="/saves" className={navLinkStyle}>
          Chronicles
        </Link>
      </li>
      <li className="flex items-center h-full">
        <button
          type="button"
          onClick={() => {
            setSettingsModalOpen(true);
          }}
          className={cn(
            "bg-transparent border border-[var(--primary)]",
            "text-[var(--primary)]",
            "font-[family-name:var(--font-header)]",
            "uppercase text-[0.75rem] tracking-[0.1em]",
            "px-4 py-2 rounded-[4px] cursor-pointer",
            "transition-all duration-300 ease-in-out",
            "ml-[10px] shadow-none",
            "hover:bg-[var(--primary)] hover:text-[var(--bg)]",
          )}
        >
          Settings
        </button>
      </li>
    </ul>
  );
}
