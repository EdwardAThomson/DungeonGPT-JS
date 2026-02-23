/**
 * Command component — simple command palette / search input.
 *
 * This is a lightweight implementation for DungeonGPT that does not
 * depend on cmdk (keeping dependencies minimal). It provides a styled
 * search input and filterable list matching the fantasy theme.
 *
 * For a full command palette, cmdk can be added later.
 */

import { Search } from "lucide-react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const CommandInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-[var(--border)] px-3">
    <Search className="mr-2 size-4 shrink-0 text-[var(--text-secondary)]" />
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full bg-transparent py-3",
        "text-sm text-[var(--text)]",
        "placeholder:text-[var(--text-secondary)]",
        "outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = "CommandInput";

function CommandList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-h-[300px] overflow-y-auto overflow-x-hidden p-1",
        className,
      )}
      role="listbox"
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "py-6 text-center text-sm text-[var(--text-secondary)]",
        className,
      )}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden p-1",
        "[&_[data-command-group-heading]]:px-2 [&_[data-command-group-heading]]:py-1.5",
        "[&_[data-command-group-heading]]:text-xs [&_[data-command-group-heading]]:font-[family-name:var(--font-header)]",
        "[&_[data-command-group-heading]]:text-[var(--text-secondary)] [&_[data-command-group-heading]]:uppercase",
        "[&_[data-command-group-heading]]:tracking-[0.05em]",
        className,
      )}
      role="group"
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer items-center gap-2",
        "rounded-[4px] px-2 py-2",
        "text-sm text-[var(--text)]",
        "outline-none",
        "hover:bg-[var(--shadow)] hover:text-[var(--primary)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      role="option"
      aria-selected={false}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("-mx-1 my-1 h-px bg-[var(--border)]", className)}
      {...props}
    />
  );
}

export {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
};
