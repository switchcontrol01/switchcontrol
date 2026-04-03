export function AppBackground() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Single very subtle radial gradient — no animation */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 40% 30%, hsl(252 30% 15% / 0.5) 0%, transparent 60%)',
        }}
      />

      {/* Fine dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, hsl(252 30% 55% / 0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
    </div>
  );
}
