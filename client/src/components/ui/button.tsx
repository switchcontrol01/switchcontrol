import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 btn-shine",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(190,90%,50%)] text-black font-semibold shadow-lg shadow-[hsl(190,90%,50%,0.25)] hover:bg-[hsl(190,90%,45%)] hover:shadow-xl hover:shadow-[hsl(190,90%,50%,0.35)] hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0",
        brand:
          "bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,55%,50%)] text-white shadow-lg shadow-[hsl(270,60%,55%,0.2)] hover:shadow-xl hover:shadow-[hsl(270,60%,55%,0.4)] hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 border border-white/10",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:scale-[1.02] active:scale-[0.98]",
        outline:
          "border border-[hsl(270,60%,55%,0.2)] bg-black/20 shadow-sm hover:bg-[hsl(270,60%,55%,0.08)] hover:text-accent-foreground hover:border-[hsl(270,60%,55%,0.4)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300",
        secondary:
          "bg-[hsl(190,90%,50%)] text-black font-semibold shadow-sm hover:bg-[hsl(190,90%,45%)] hover:-translate-y-0.5 active:translate-y-0",
        ghost: "hover:bg-[hsl(270,60%,55%,0.1)] hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        cyan: "bg-[hsl(190,90%,50%)] text-black font-semibold shadow-lg shadow-[hsl(190,90%,50%,0.25)] hover:bg-[hsl(190,90%,45%)] hover:shadow-xl hover:shadow-[hsl(190,90%,50%,0.35)] hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
