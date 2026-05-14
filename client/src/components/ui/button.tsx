import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#00D4FF] text-[#071014] font-semibold shadow-sm hover:bg-[#33E0FF] hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]",
        brand:
          "bg-[#00D4FF] text-[#071014] font-semibold shadow-sm hover:bg-[#33E0FF] hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]",
        destructive:
          "bg-[#EF4444] text-white shadow-sm hover:bg-[#F87171]",
        outline:
          "border border-[#2A313A] bg-[#21262D] text-[#E6EAF0] shadow-sm hover:bg-[#2A313A] hover:border-[#3A414D] hover:text-white transition-all duration-200",
        secondary:
          "bg-[#21262D] text-[#E6EAF0] border border-[#2A313A] shadow-sm hover:bg-[#2A313A] hover:text-white",
        ghost: "hover:bg-[#2A313A] hover:text-[#E6EAF0] text-[#A0A8B3]",
        link: "text-[#00D4FF] underline-offset-4 hover:underline",
        cyan: "bg-[#00D4FF] text-[#071014] font-semibold shadow-sm hover:bg-[#33E0FF] hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]",
        warning:
          "bg-[#F59E0B] text-[#071014] font-semibold shadow-sm hover:bg-[#FBBF24] hover:shadow-[0_0_16px_rgba(245,158,11,0.25)]",
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
