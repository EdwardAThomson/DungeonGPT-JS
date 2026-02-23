/**
 * Page Layout — standard page wrapper with navigation bar.
 *
 * Ported from src/App.css:
 *
 * .App:
 *   text-align: center, min-height: 100vh, bg var(--bg),
 *   color var(--text), font-family var(--body-font),
 *   display: flex, flex-direction: column
 *
 * .main-nav:
 *   bg var(--surface), border-bottom: 2px solid var(--primary),
 *   padding: 0 20px, position: sticky, top: 0, z-index: 1000,
 *   box-shadow: 0 4px 12px var(--shadow), backdrop-filter: blur(8px)
 *
 * .main-nav ul:
 *   list-style: none, flex, justify-center, align-center,
 *   height: 70px, gap: 15px
 *
 * .main-nav a:
 *   Cinzel, 0.85rem, tracking 0.1em, uppercase,
 *   padding: 10px 15px, rounded-md, transition 0.3s
 *
 * .main-content:
 *   flex-grow: 1, padding: 40px 20px, max-width: 1100px, margin: 0 auto,
 *   width: 100%, box-sizing: border-box
 */

import { cn } from "@/lib/utils";

interface PageLayoutProps {
  readonly nav?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly fullWidth?: boolean;
  readonly className?: string;
}

export function PageLayout({
  nav,
  children,
  fullWidth = false,
  className,
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        "text-center min-h-screen",
        "bg-[var(--bg)] text-[var(--text)]",
        "font-[family-name:var(--font-body)]",
        "flex flex-col",
        className,
      )}
    >
      {/* Navigation */}
      {nav && (
        <nav
          className={cn(
            "bg-[var(--surface)]",
            "border-b-2 border-[var(--primary)]",
            "px-5 sticky top-0 z-[1000]",
            "shadow-[0_4px_12px_var(--shadow)]",
            "backdrop-blur-lg",
          )}
        >
          {nav}
        </nav>
      )}

      {/* Main content */}
      {fullWidth ? (
        children
      ) : (
        <div
          className={cn(
            "grow",
            "py-10 px-5",
            "max-w-[1100px] mx-auto w-full box-border",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Page Card — content container with fantasy card styling.
 *
 * Ported from src/App.css .Home-page, .page-container, .character-creation-form:
 *   bg var(--surface), padding: 40px, rounded-lg,
 *   shadow 0 8px 32px var(--shadow), border 1px var(--border),
 *   position: relative, text-align: left
 *
 *   ::before pseudo-element: 3px gradient top border
 */
interface PageCardProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function PageCard({ children, className }: PageCardProps) {
  return (
    <div
      className={cn(
        "relative text-left",
        "bg-[var(--surface)]",
        "p-10 rounded-lg",
        "shadow-[0_8px_32px_var(--shadow)]",
        "border border-[var(--border)]",
        // Gradient top accent line (replacing ::before pseudo-element)
        "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0",
        "before:h-[3px]",
        "before:bg-gradient-to-r before:from-transparent before:via-[var(--primary)] before:to-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}
