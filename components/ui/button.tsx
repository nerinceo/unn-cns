import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

// `unn-pressable` (app/globals.css) supplies the transition set and the 1px
// travel on :active. It is a class rather than utilities because the travel
// needs `:active:not(:disabled)`, which Tailwind cannot express as a variant
// pair, and because prefers-reduced-motion has to switch it off.
const buttonVariants = cva(
  "unn-pressable inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium tracking-[-0.006em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Flat, and every variant carries a border so they all occupy exactly
        // the same box — a bordered `outline` next to an unbordered `default`
        // is 2px shorter and the pair visibly fails to line up. The filled
        // variants border in their own colour, so the edge reads as part of
        // the fill rather than as an outline.
        //
        // No shadows: see the "flat surfaces" note in app/globals.css. A
        // shadow in this app means "floats above the page and can be
        // dismissed", and a Save button is not that.
        default: "bg-primary text-white border border-primary hover:bg-primary/90",
        destructive:
          "bg-secondary text-white border border-secondary hover:bg-secondary/90",
        outline:
          "border border-border bg-white text-foreground hover:bg-muted hover:border-[color:var(--line-strong)]",
        ghost: "border border-transparent hover:bg-muted text-foreground",
        link: "border border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
