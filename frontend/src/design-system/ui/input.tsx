/**
 * Input component — restyled with fantasy theme.
 *
 * Visual style ported from src/index.css input rules:
 *   - padding: 12px
 *   - border: 1px solid var(--border)
 *   - bg: var(--surface), color: var(--text)
 *   - border-radius: 4px
 *   - font-family: var(--font-ui) (Inter)
 *   - focus: border-color var(--primary), shadow ring
 */

import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "w-full px-3 py-3",
          "border border-[var(--border)]",
          "bg-[var(--surface)] text-[var(--text)]",
          "rounded-[4px]",
          "font-[family-name:var(--font-ui)] text-base",
          "transition-[border-color] duration-200 ease-in-out",
          "focus:outline-none focus:border-[var(--primary)]",
          "focus:shadow-[0_0_0_2px_var(--shadow)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "placeholder:text-[var(--text-secondary)]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
