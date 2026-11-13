import type { HTMLAttributes, PropsWithChildren } from 'react';

type InstrumentFrameProps = PropsWithChildren<HTMLAttributes<HTMLElement> & {
  variant?: 'frame' | 'panel' | 'inset';
}>;

export function InstrumentFrame({
  children,
  className = '',
  variant = 'panel',
  ...props
}: InstrumentFrameProps) {
  return (
    <section className={`scd-${variant} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
