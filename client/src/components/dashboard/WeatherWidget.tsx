import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeatherData {
  temp:          number;
  feelsLike:     number;
  humidity:      number;
  windKph:       number;
  rainChancePct: number;
  conditionCode: number;
  isDay:         number;
  city:          string;
  country:       string;
  fetchedAt:     number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_KEY = "sw_weather_v1";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── WMO code → condition slug ─────────────────────────────────────────────────
// https://open-meteo.com/en/docs#weathervariables

function wmoCondition(code: number): "clear" | "cloudy" | "rain" | "thunder" | "fog" | "snow" {
  if (code === 0 || code === 1)              return "clear";
  if (code <= 3)                             return "cloudy";
  if (code >= 45 && code <= 48)             return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 71 && code <= 77)             return "snow";
  if (code >= 95 && code <= 99)             return "thunder";
  return "cloudy";
}

// ── Subtle border tint per condition ─────────────────────────────────────────

function conditionTint(condition: string): string {
  switch (condition) {
    case "clear":   return "border-amber-500/20";
    case "rain":    return "border-blue-400/20";
    case "thunder": return "border-blue-500/25";
    case "snow":    return "border-cyan-400/20";
    case "fog":     return "border-slate-400/15";
    default:        return "border-white/[0.08]";
  }
}

// ── Inline SVG icons — geometric, SwitchControl visual language ───────────────

const WeatherIcon = memo(({ condition, isDay, size = 14 }: { condition: string; isDay: number; size?: number }) => {
  const c = size / 2;
  const sunColor  = isDay ? "#FCD34D" : "#94A3B8";
  const rainColor = "#60A5FA";
  const snowColor = "#BAE6FD";
  const fogColor  = "#9CA3AF";

  switch (condition) {
    case "clear":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3" fill={sunColor} />
          {[0,45,90,135,180,225,270,315].map(a => (
            <line
              key={a}
              x1={8 + Math.cos(a * Math.PI / 180) * 4.5}
              y1={8 + Math.sin(a * Math.PI / 180) * 4.5}
              x2={8 + Math.cos(a * Math.PI / 180) * 6.5}
              y2={8 + Math.sin(a * Math.PI / 180) * 6.5}
              stroke={sunColor} strokeWidth="1.5" strokeLinecap="round"
            />
          ))}
        </svg>
      );

    case "cloudy":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M12 10a3 3 0 0 0-2.83-4A4 4 0 1 0 5 14h7a3 3 0 0 0 0-6z"
            fill="#94A3B8" opacity="0.75"
          />
        </svg>
      );

    case "rain":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M11 8a2.5 2.5 0 0 0-2.3-3.5A3.5 3.5 0 1 0 4.5 11H11a2.5 2.5 0 0 0 0-5z"
            fill="#94A3B8" opacity="0.65"
          />
          <line x1="5.5" y1="13"  x2="4.5" y2="15.5"  stroke={rainColor} strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="8.5" y1="13"  x2="7.5" y2="15.5"  stroke={rainColor} strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="11.5" y1="13" x2="10.5" y2="15.5" stroke={rainColor} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      );

    case "thunder":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M11 7a2.5 2.5 0 0 0-2.3-3.5A3.5 3.5 0 1 0 4.5 10H11a2.5 2.5 0 0 0 0-5z"
            fill="#94A3B8" opacity="0.65"
          />
          <path d="M9 9.5l-2.5 3.5h2.5L7.5 16l4.5-5h-2.5L9 9.5z" fill="#FCD34D"/>
        </svg>
      );

    case "fog":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="5"  x2="14" y2="5"  stroke={fogColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
          <line x1="3" y1="8"  x2="13" y2="8"  stroke={fogColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
          <line x1="4" y1="11" x2="12" y2="11" stroke={fogColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
        </svg>
      );

    case "snow":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="8" y1="2"  x2="8" y2="14" stroke={snowColor} strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="2" y1="8"  x2="14" y2="8" stroke={snowColor} strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="4" y1="4"  x2="12" y2="12" stroke={snowColor} strokeWidth="1.1" strokeLinecap="round" opacity="0.6"/>
          <line x1="12" y1="4" x2="4"  y2="12" stroke={snowColor} strokeWidth="1.1" strokeLinecap="round" opacity="0.6"/>
          <circle cx="8" cy="8" r="1.2" fill={snowColor}/>
        </svg>
      );

    default:
      return null;
  }
});
WeatherIcon.displayName = "WeatherIcon";

// ── Stat row inside the hover panel ──────────────────────────────────────────

const StatCell = memo(({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
    <span className="text-[9px] text-[#3D4552] uppercase tracking-wider font-medium">{label}</span>
    <span className="text-xs font-medium text-[#8A95A3]">{value}</span>
  </div>
));
StatCell.displayName = "StatCell";

// ── Main widget ───────────────────────────────────────────────────────────────
// Isolated component — React.memo prevents any parent rerender from
// propagating here. localStorage cache means the API is hit at most
// once per 15 minutes. No intervals faster than 15 min.

const WeatherWidget = memo(() => {
  const [data, setData]       = useState<WeatherData | null>(null);
  const [failed, setFailed]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    // 1. Check localStorage first — no network request if cache is fresh
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: WeatherData = JSON.parse(raw);
        if (Date.now() - cached.fetchedAt < CACHE_TTL) {
          setData(cached);
          return;
        }
      }
    } catch {}

    // 2. Fetch from server (which has its own 15-min server-side cache)
    try {
      const res = await apiGet<{ ok: boolean; data: WeatherData }>("/weather");
      if (res.ok && res.data) {
        setData(res.data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(res.data)); } catch {}
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // Defer first fetch so it never blocks dashboard render or telemetry
    const init = setTimeout(load, 400);
    // Background refresh — only fires every 15 minutes, never sooner
    const interval = setInterval(load, CACHE_TTL);
    return () => { clearTimeout(init); clearInterval(interval); };
  }, [load]);

  // Silent failure — widget disappears, dashboard unaffected
  if (failed || !data) return null;

  const condition = wmoCondition(data.conditionCode);
  const tint      = conditionTint(condition);
  const location  = data.city || data.country || "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.55, ease: "easeOut", delay: 0.3 }}
      className="hidden md:block relative"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* ── Compact chip ─────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
          bg-white/[0.04] border ${tint} backdrop-blur-sm
          cursor-default select-none transition-colors duration-300`}
        data-testid="widget-weather-chip"
      >
        <WeatherIcon condition={condition} isDay={data.isDay} size={13} />
        <span className="text-xs font-medium text-[#6B7380]">{data.temp}°C</span>
      </div>

      {/* ── Hover-expand detail panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2 z-50 w-52 p-3 rounded-xl
              bg-[#0a0a12]/95 backdrop-blur-2xl border border-white/[0.07]"
            style={{
              boxShadow: "0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)"
            }}
            data-testid="widget-weather-panel"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <WeatherIcon condition={condition} isDay={data.isDay} size={18} />
                <div>
                  <div className="text-sm font-semibold text-[#D4D8E0] leading-tight">
                    {data.temp}°C
                  </div>
                  {location && (
                    <div className="text-[10px] text-[#3D4552] truncate max-w-[100px] mt-0.5">
                      {location}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-[#4B5563] capitalize tracking-wide font-medium">
                {condition}
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.05] mb-2.5" />

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-1.5">
              <StatCell label="Feels like"  value={`${data.feelsLike}°C`} />
              <StatCell label="Humidity"    value={`${data.humidity}%`} />
              <StatCell label="Wind"        value={`${data.windKph} km/h`} />
              <StatCell label="Rain chance" value={`${data.rainChancePct}%`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
WeatherWidget.displayName = "WeatherWidget";

export { WeatherWidget };
