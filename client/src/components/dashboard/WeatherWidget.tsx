import { useState, useEffect, useCallback, memo } from "react";
import { motion } from "framer-motion";
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

// v3: client-side IP geolocation fallback so Electron never defaults to London
const CACHE_KEY = "sw_weather_v3";
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

// ── Geolocation helpers ────────────────────────────────────────────────────────

interface Coords { lat: number; lon: number; city?: string; country?: string }

/** Fetch ip-api.com directly from the renderer.
 *  Works in Electron (outbound request uses real external IP, not 127.0.0.1).
 *  Works in browsers that allow CORS to ip-api.com.
 *  Returns null silently on any failure. */
async function ipApiCoords(): Promise<Coords | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(
      "https://ip-api.com/json/?fields=status,lat,lon,city,country",
      { signal: ctrl.signal }
    );
    if (!r.ok) return null;
    const geo = await r.json();
    if (geo.status === "success" && isFinite(geo.lat)) {
      return { lat: geo.lat, lon: geo.lon, city: geo.city || "", country: geo.country || "" };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Resolve the best available coordinates.
 *  Priority: GPS → client-side IP geo (fixes Electron loopback bug) → null (server decides). */
async function resolveCoords(): Promise<Coords | null> {
  // 1. Try browser/OS GPS
  if (navigator.geolocation) {
    const gps = await new Promise<Coords | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 6000, maximumAge: 5 * 60 * 1000 }
      );
    });
    if (gps) return gps;
  }

  // 2. GPS unavailable/denied — fetch ip-api.com from the renderer so we get
  //    the user's real external IP (crucial in Electron where the server only
  //    sees 127.0.0.1 and always falls back to London).
  return ipApiCoords();
}

// ── Main widget ───────────────────────────────────────────────────────────────
// Isolated component — React.memo prevents any parent rerender from
// propagating here. localStorage cache means the API is hit at most
// once per 15 minutes. No intervals faster than 15 min.

const WeatherWidget = memo(() => {
  const [data, setData]       = useState<WeatherData | null>(null);
  const [failed, setFailed]   = useState(false);

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

    // 2. Resolve coordinates (GPS first, then client-side IP geo as fallback)
    const coords = await resolveCoords();

    // Build query — pass city/country if we got them from ip-api so the
    // server can label the response without doing its own geo lookup.
    const params = new URLSearchParams();
    if (coords) {
      params.set("lat", String(coords.lat));
      params.set("lon", String(coords.lon));
      if (coords.city)    params.set("city",    coords.city);
      if (coords.country) params.set("country", coords.country);
    }
    const query = coords ? `?${params.toString()}` : "";

    // 3. Fetch from server (which has its own 15-min server-side cache per lat/lon)
    try {
      const res = await apiGet<{ ok: boolean; data: WeatherData }>(`/weather${query}`);
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.55, ease: "easeOut", delay: 0.3 }}
      className="hidden md:block"
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
    </motion.div>
  );
});
WeatherWidget.displayName = "WeatherWidget";

export { WeatherWidget };
