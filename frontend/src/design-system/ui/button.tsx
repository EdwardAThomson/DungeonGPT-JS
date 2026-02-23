/**
 * Button component — shadcn/Radix pattern, restyled with fantasy theme.
 *
 * Visual style ported from src/index.css button rules:
 *   - bg: var(--primary), color: var(--bg)
 *   - border: 1px solid var(--primary)
 *   - font-family: var(--header-font) (Cinzel)
 *   - letter-spacing: 0.1em, font-size: 0.9rem
 *   - hover: transparent bg, primary color
 *   - disabled: text-secondary bg, 0.5 opacity
 */

import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { forwardRef } from "react";

import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "rounded-[4px] cursor-pointer",
    "font-[family-name:var(--font-header)]",
    "text-[0.9rem] tracking-[0.1em] uppercase",
    "transition-all duration-200 ease-in-out",
    "shadow-[0_2px_4px_var(--shadow)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "active:translate-y-[1px]",
    "whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[var(--primary)] text-[var(--bg)]",
          "border border-[var(--primary)]",
          "hover:bg-transparent hover:text-[var(--primary)]",
          "disabled:bg-[var(--text-secondary)] disabled:border-[var(--text-secondary)]",
        ].join(" "),
        outline: [
          "bg-transparent text-[var(--primary)]",
          "border border-[var(--primary)]",
          "hover:bg-[var(--primary)] hover:text-[var(--bg)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--text)]",
          "border border-transparent shadow-none",
          "hover:bg-[var(--shadow)] hover:text-[var(--primary)]",
        ].join(" "),
        secondary: [
          "bg-[var(--bg)] text-[var(--text)]",
          "border border-[var(--border)]",
          "hover:bg-[var(--surface)] hover:border-[var(--primary)] hover:text-[var(--primary)]",
          "hover:-translate-y-[1px]",
        ].join(" "),
        destructive: [
          "bg-[#e74c3c] text-white",
          "border border-[#e74c3c]",
          "hover:bg-[#c0392b]",
        ].join(" "),
        success: [
          "bg-[#27ae60] text-white",
          "border border-[#27ae60]",
          "hover:bg-[#229954]",
        ].join(" "),
        link: [
          "bg-transparent text-[var(--primary)]",
          "border-none shadow-none underline-offset-4",
          "hover:underline",
        ].join(" "),
      },
      size: {
        default: "px-[24px] py-[10px]",
        sm: "px-[16px] py-[8px] text-[0.75rem]",
        lg: "px-[30px] py-[15px] text-[1.1rem]",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
