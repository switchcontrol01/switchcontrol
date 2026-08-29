import { useRef, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTranslation } from "@/lib/i18n";

const LINES = [
  "Most tweak apps just flip settings and hope.",
  "SwitchControl verifies real Windows state.",
  "Tweaks are tracked before they are changed.",
  "Rollback is built into the system.",
  "No fake FPS claims.",
  "No fake ping boosts.",
  "Real optimization needs proof.",
];

export default function ScrollFocusText() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  useEffect(() => {
    if (isMobile) return;
    const container = containerRef.current;
    if (!container) return;

    const lineEls = container.querySelectorAll("[data-focus-line]");
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null;
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute("data-index"));
          if (entry.isIntersecting && entry.intersectionRatio > (best?.ratio ?? 0)) {
            best = { index: idx, ratio: entry.intersectionRatio };
          }
        });
        if (best !== null) setActiveIndex(best.index);
      },
      { threshold: [0, 0.3, 0.5, 0.7, 1], rootMargin: "-30% 0px -30% 0px" }
    );

    lineEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile]);

  return (
    <section className="relative py-24 md:py-40 overflow-hidden" aria-label={t("Why SwitchControl is different")}>
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.015) 40px)",
            backgroundSize: "100% 40px",
          }}
        />
      </div>

      <div
        ref={containerRef}
        className="max-w-4xl mx-auto px-6 relative z-10"
      >
        <div className="mb-12 md:mb-16">
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-white/25 mb-3 block">
            {t("Verified Difference")}
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">
            {t("Why SwitchControl")}{" "}
            <span className="font-light italic text-white/60">{t("is different")}</span>
          </h2>
        </div>

        <div className="space-y-6 md:space-y-8">
          {LINES.map((line, i) => {
            const isActive = i === activeIndex && !isMobile;
            const isPast = i < activeIndex && !isMobile;
            return (
              <div
                key={line}
                data-focus-line
                data-index={i}
                className="transition-all duration-500 ease-out"
                style={{
                  opacity: isMobile ? 1 : isPast ? 0.25 : isActive ? 1 : 0.45,
                  transform: isMobile
                    ? "none"
                    : isActive
                    ? "translateX(12px)"
                    : "translateX(0px)",
                }}
              >
                <span
                  className="text-lg md:text-2xl lg:text-3xl font-medium leading-relaxed transition-colors duration-500"
                  style={{
                    color: isActive
                      ? "hsl(190,85%,60%)"
                      : isPast
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(255,255,255,0.55)",
                  }}
                >
                  {t(line)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
