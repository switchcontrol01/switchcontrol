interface Props {
  active: boolean;
}

export function StartupPulse({ active }: Props) {
  return (
    <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-white/5">
      {active && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            style={{ animation: "st-pulse-sweep 1.8s ease-in-out infinite" }}
          />
          <style>{`
            @keyframes st-pulse-sweep {
              0%   { transform: translateX(-120%); opacity: 0; }
              25%  { opacity: 1; }
              75%  { opacity: 1; }
              100% { transform: translateX(420%); opacity: 0; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
