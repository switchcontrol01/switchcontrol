import { Router } from "express";
import { requireJwt } from "../middleware/requireCloudAuth";

const router = Router();

// ── In-memory caches ─────────────────────────────────────────────────────────
// Keyed by IP for geo, by "lat,lon" (2dp) for weather data.
// TTLs are long: geo rarely changes; weather refreshes every 15 min max.

interface GeoEntry  { lat: number; lon: number; city: string; country: string; ts: number }
interface WxEntry   { data: WeatherPayload; ts: number }

const geoCache = new Map<string, GeoEntry>();
const wxCache  = new Map<string, WxEntry>();

const GEO_TTL = 60 * 60 * 1000;       // 1 hour — city doesn't move
const WX_TTL  = 15 * 60 * 1000;       // 15 minutes

export interface WeatherPayload {
  temp:          number;
  feelsLike:     number;
  humidity:      number;
  windKph:       number;
  rainChancePct: number;
  conditionCode: number; // WMO weather code
  isDay:         number;
  city:          string;
  country:       string;
  fetchedAt:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function clientIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  return (forwarded ? forwarded.split(",")[0] : "").trim()
    || req.socket?.remoteAddress
    || "";
}

// ── GET /api/weather ──────────────────────────────────────────────────────────
// Accepts optional ?lat=&lon= query params.
// If not supplied, resolves from client IP via ip-api.com (cached 1h).
// Weather data from open-meteo.com (free, no key, cached 15m per location).

router.get("/", requireJwt, async (req, res) => {
  try {
    let lat = parseFloat(req.query.lat as string);
    let lon = parseFloat(req.query.lon as string);
    let city = "";
    let country = "";

    // ── Geolocation ─────────────────────────────────────────────────────────
    if (!isFinite(lat) || !isFinite(lon)) {
      const ip = clientIp(req);
      const geoHit = ip ? geoCache.get(ip) : undefined;

      if (geoHit && Date.now() - geoHit.ts < GEO_TTL) {
        ({ lat, lon, city, country } = geoHit);
      } else if (ip) {
        try {
          const geoRes = await fetchWithTimeout(
            `http://ip-api.com/json/${ip}?fields=status,lat,lon,city,country`,
            4000
          );
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo.status === "success" && isFinite(geo.lat)) {
              lat = geo.lat; lon = geo.lon;
              city = geo.city || ""; country = geo.country || "";
              geoCache.set(ip, { lat, lon, city, country, ts: Date.now() });
            }
          }
        } catch {
          // geo lookup failed — fall through to default below
        }
      }

      // Ultimate fallback: London
      if (!isFinite(lat)) {
        lat = 51.5; lon = -0.13; country = "";
      }
    }

    // ── Weather lookup ───────────────────────────────────────────────────────
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const wxHit = wxCache.get(cacheKey);
    if (wxHit && Date.now() - wxHit.ts < WX_TTL) {
      return res.json({ ok: true, data: wxHit.data });
    }

    const wxUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature` +
      `,is_day,precipitation_probability,wind_speed_10m,weather_code` +
      `&wind_speed_unit=kmh&timezone=auto`;

    const wxRes = await fetchWithTimeout(wxUrl, 6000);
    if (!wxRes.ok) throw new Error(`open-meteo HTTP ${wxRes.status}`);
    const j = await wxRes.json();
    const c = j.current;

    const data: WeatherPayload = {
      temp:          Math.round(c.temperature_2m),
      feelsLike:     Math.round(c.apparent_temperature),
      humidity:      c.relative_humidity_2m ?? 0,
      windKph:       Math.round(c.wind_speed_10m ?? 0),
      rainChancePct: c.precipitation_probability ?? 0,
      conditionCode: c.weather_code ?? 0,
      isDay:         c.is_day ?? 1,
      city,
      country,
      fetchedAt:     Date.now(),
    };

    wxCache.set(cacheKey, { data, ts: Date.now() });
    res.json({ ok: true, data });

  } catch (err: any) {
    // Never crash the dashboard — return a clean 503
    console.warn("[weather] fetch failed:", err?.message);
    res.status(503).json({ ok: false, error: "Weather temporarily unavailable" });
  }
});

export default router;
