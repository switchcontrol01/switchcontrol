import type { HTMLAttributes } from 'react';

type EvidenceReadoutProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: string;
  note: string;
};

export function EvidenceReadout({ label, value, note, className = '', ...props }: EvidenceReadoutProps) {
  return (
    <div className={`scd-readout ${className}`.trim()} {...props}>
      <div className="scd-readout__label">{label}</div>
      <div className="scd-readout__value">{value}</div>
      <div className="scd-readout__note">{note}</div>
    </div>
  );
}
