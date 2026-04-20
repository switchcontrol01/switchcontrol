import { Reveal } from "@/lib/motion";
import { ReactNode } from "react";

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

function AnimateIn({ children, delay = 0, className = "" }: AnimateInProps) {
  return (
    <Reveal delay={delay / 1000} className={className}>
      {children}
    </Reveal>
  );
}

export default AnimateIn;
export { AnimateIn };
