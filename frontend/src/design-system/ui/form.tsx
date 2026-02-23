/**
 * Form component — Label + form field layout helpers, restyled with fantasy theme.
 *
 * Visual style ported from src/index.css label rules:
 *   - font-family: Cinzel, font-size: 0.85rem
 *   - letter-spacing: 0.05em, color: var(--text-secondary)
 *   - font-weight: 600
 *
 * This provides simple layout components for forms. TanStack Form handles
 * validation and state; these are presentation wrappers only.
 */

import * as LabelPrimitive from "@radix-ui/react-label";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const Label = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "block mb-2",
      "font-[family-name:var(--font-header)]",
      "text-[0.85rem] font-semibold",
      "tracking-[0.05em]",
      "text-[var(--text-secondary)]",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

function FormField({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-5", className)} {...props} />;
}

function FormMessage({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  if (!children) {
    return null;
  }
  return (
    <p
      className={cn(
        "text-[0.85rem] text-[#e74c3c] mt-1",
        "font-[family-name:var(--font-ui)]",
        className,
      )}
      role="alert"
      {...props}
    >
      {children}
    </p>
  );
}

function FormDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[0.85rem] text-[var(--text-secondary)] mt-1",
        className,
      )}
      {...props}
    />
  );
}

export { FormDescription, FormField, FormMessage, Label };
