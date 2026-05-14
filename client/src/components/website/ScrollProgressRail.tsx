import { useScrollProgress } from "@/hooks/useScrollProgress";

export default function ScrollProgressRail() {
  const progress = useScrollProgress();

  return (
    <div
      aria-hidden="true"
      className="fixed right-3 top-1/2 -translate-y-1/2 z-40 hidden lg:block"
      style={{ height: "120px" }}
    >
      <div className="relative w-px h-full bg-white/[0.06] overflow-hidden rounded-full">
        <div
          className="absolute top-0 left-0 w-full rounded-full"
          style={{
            height: `${progress * 100}%`,
            background:
              "linear-gradient(180deg, hsl(190,90%,55%), hsl(270,70%,55%))",
            transition: "height 0.1s ease-out",
          }}
        />
      </div>
      <div
        className="absolute right-2 -translate-x-1/2 text-[9px] font-mono text-white/20 tracking-widest uppercase whitespace-nowrap"
        style={{ top: `${progress * 100}%`, transform: "translate(-50%, -50%)" }}
      >
        {Math.round(progress * 100)}%
      </div>
    </div>
  );
}
