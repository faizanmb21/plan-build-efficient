import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 overflow-hidden isolate before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(120%_60%_at_50%_-20%,oklch(1_0_0/0.25)_0%,transparent_55%)] before:opacity-80 before:transition-opacity hover:before:opacity-100 [&>*]:relative [&>*]:z-[1]",
  {
    variants: {
      variant: {
        default:
          "bg-primary/85 text-primary-foreground border border-white/10 backdrop-blur-md shadow-[0_4px_16px_-4px_oklch(0.62_0.24_268/0.5),inset_0_1px_0_0_oklch(1_0_0/0.2)] hover:bg-primary hover:shadow-[0_8px_24px_-6px_oklch(0.62_0.24_268/0.7),inset_0_1px_0_0_oklch(1_0_0/0.25)]",
        destructive:
          "bg-destructive/85 text-destructive-foreground border border-white/10 backdrop-blur-md shadow-[0_4px_16px_-4px_oklch(0.65_0.22_22/0.5),inset_0_1px_0_0_oklch(1_0_0/0.2)] hover:bg-destructive",
        outline:
          "border border-white/15 bg-white/5 text-foreground backdrop-blur-md shadow-[inset_0_1px_0_0_oklch(1_0_0/0.12)] hover:bg-white/10 hover:border-white/25",
        secondary:
          "bg-white/8 text-secondary-foreground border border-white/10 backdrop-blur-md shadow-[inset_0_1px_0_0_oklch(1_0_0/0.15)] hover:bg-white/12",
        ghost:
          "border border-transparent hover:bg-white/8 hover:border-white/10 hover:backdrop-blur-md",
        link: "text-accent underline-offset-4 hover:underline before:hidden",
      },
      size: {
        default: "h-9 px-5 py-2",
        sm: "h-8 rounded-full px-4 text-xs",
        lg: "h-11 rounded-full px-8",
        icon: "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
