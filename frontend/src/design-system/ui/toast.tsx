/**
 * Toast component — Sonner integration, restyled with fantasy theme.
 *
 * Uses Sonner's Toaster with custom theme tokens applied.
 */

import { Toaster as SonnerToaster } from "sonner";

import type { ComponentProps } from "react";

type ToasterProps = ComponentProps<typeof SonnerToaster>;

function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerToaster
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: [
            "group toast",
            "group-[.toaster]:bg-[var(--surface)]",
            "group-[.toaster]:text-[var(--text)]",
            "group-[.toaster]:border-[var(--border)]",
            "group-[.toaster]:shadow-[0_8px_32px_var(--shadow)]",
            "group-[.toaster]:rounded-lg",
            "group-[.toaster]:font-[family-name:var(--font-body)]",
          ].join(" "),
          description: "group-[.toast]:text-[var(--text-secondary)]",
          actionButton: [
            "group-[.toast]:bg-[var(--primary)]",
            "group-[.toast]:text-[var(--bg)]",
            "group-[.toast]:font-[family-name:var(--font-header)]",
            "group-[.toast]:uppercase",
            "group-[.toast]:tracking-[0.1em]",
          ].join(" "),
          cancelButton:
            "group-[.toast]:bg-[var(--bg)] group-[.toast]:text-[var(--text-secondary)]",
          error: "group-[.toaster]:border-[#e74c3c] group-[.toaster]:text-[#e74c3c]",
          success: "group-[.toaster]:border-[#27ae60]",
          warning: "group-[.toaster]:border-[#f39c12]",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
