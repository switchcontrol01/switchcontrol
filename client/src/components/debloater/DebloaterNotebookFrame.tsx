import React from "react";
import type { ReactNode } from "react";

/** Shared watercolor notebook framing used by the live Debloater and its browser fixture. */
export function DebloaterNotebookFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={["debloater-paper-mat", className].filter(Boolean).join(" ")} data-testid="debloater-paper-mat">
      {children}
    </section>
  );
}
