export function PageBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 20% 10%, hsl(252 30% 14% / 0.6) 0%, transparent 55%)',
        }}
      />
    </div>
  );
}
