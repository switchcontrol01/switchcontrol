import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "url";
import { timingSafeEqual } from "crypto";
import { getCachedSnapshot, getSnapshot, refreshRamNow, telemetryClientConnected, telemetryClientDisconnected } from "./telemetry";
import { verifyJwt, jwtFingerprint, peekJwtExpiry } from "./jwt";
import { isKilled } from "./killSwitch";

let wss: WebSocketServer | null = null;
let broadcastInterval: NodeJS.Timeout | null = null;

// Per-user connection limit — prevents reconnect storms from Electron
const MAX_CONNECTIONS_PER_USER = 3;
const userConnectionCount = new Map<string, number>();

// Payload dedup — track the last broadcast snapshot timestamp.
// Comparing snap.ts is O(1) and avoids a full JSON.stringify on every 2s tick
// when telemetry hasn't updated (scheduler runs at 1.5s, so timestamps align).
let lastBroadcastTs: number | null = null;

/**
 * Strip expensive fields from the broadcast payload.
 * `processes` updates every 90 s, creates 40-80 KB payloads, and causes
 * renderer parse + Zustand rerender overhead on every tick. Consumers that
 * need process data should fetch it on-demand via the REST endpoint instead.
 */
function toBroadcastPayload(snap: any): any {
  const { processes: _omit, ...rest } = snap;
  return rest;
}

/**
 * Extract a JWT from an incoming WebSocket upgrade request.
 * Looks for ?jwt=<token> in the query string (Electron desktop)
 * or an Authorization: Bearer header (future browser support).
 */
function getWsToken(req: any): string | null {
  // Query string path (used by Electron desktop app)
  const parsed = parseUrl(req.url || "", true);
  const jwtParam = parsed.query?.jwt;
  if (typeof jwtParam === "string" && jwtParam.length > 0) {
    return jwtParam;
  }
  // Header path (used by browser / future expansion)
  const header = req.headers?.["sec-websocket-protocol"];
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.substring(7);
  }
  return null;
}

function getWsProtocols(req: any): string[] {
  const value = req.headers?.["sec-websocket-protocol"];
  if (typeof value !== "string") return [];
  return value.split(",").map((item: string) => item.trim()).filter(Boolean);
}

function capabilityMatches(expected: string, presented: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(presented);
  return expectedBytes.length === presentedBytes.length &&
    timingSafeEqual(expectedBytes, presentedBytes);
}

function decodeLocalUser(protocols: string[]): string | null {
  const item = protocols.find(protocol => protocol.startsWith("switchcontrol-user."));
  if (!item) return null;
  try {
    const encoded = item.substring("switchcontrol-user.".length);
    const decoded = Buffer.from(encoded, "base64url").toString("utf8").trim();
    return decoded.length > 0 && decoded.length <= 256 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Peek at the token's iss claim without verifying the signature.
 * Used only for diagnostic logging when validation fails.
 */
function peekIss(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return "(malformed)";
    const raw = Buffer.from(parts[1], "base64").toString("utf-8");
    const peek = JSON.parse(raw) as Record<string, unknown>;
    return typeof peek.iss === "string" ? peek.iss : "(missing)";
  } catch {
    return "(error)";
  }
}

export function setupWebSocketServer(httpServer: HttpServer) {
  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/telemetry",
    // Compress telemetry frames — saves ~40–60% bandwidth on repetitive JSON.
    perMessageDeflate: {
      zlibDeflateOptions: { level: 1 }, // fastest compression, low CPU cost
      threshold: 256,                   // skip tiny frames
      concurrencyLimit: 10,
      serverNoContextTakeover: true,
    },
    // Electron requests a constant application protocol plus private auth
    // protocols. Echo only the constant protocol; never echo the capability.
    handleProtocols: (protocols) =>
      protocols.has("switchcontrol") ? "switchcontrol" : false,
  });

  wss.on("connection", (ws: WebSocket, req: any) => {
    ws.on("error", () => {});

    // Kill switch — if telemetry is disabled, reject new connections gracefully
    if (isKilled("telemetry")) {
      ws.close(1001, "Telemetry temporarily disabled");
      return;
    }

    // Auth gate
    // The packaged backend has no cloud JWT secret. Authenticate its loopback
    // telemetry socket with a cryptographically random per-launch capability
    // delivered through Electron IPC instead of trusting an unverified JWT.
    const isElectronBackend = process.env.ELECTRON_BACKEND === "1";

    let userId: string;
    let iss: string;
    let tokenFp = "(local-capability)";

    if (isElectronBackend) {
      const protocols = getWsProtocols(req);
      const capabilityProtocol = protocols.find(protocol =>
        protocol.startsWith("switchcontrol-capability.")
      );
      const presentedCapability = capabilityProtocol?.substring("switchcontrol-capability.".length) ?? "";
      const expectedCapability = process.env.ELECTRON_LOCAL_CAPABILITY ?? "";
      if (!expectedCapability || !presentedCapability ||
          !capabilityMatches(expectedCapability, presentedCapability)) {
        console.warn("[WS:auth] phase=rejected reason=invalid_local_capability");
        ws.close(1008, "Authentication required");
        return;
      }

      const localUserId = decodeLocalUser(protocols);
      if (!localUserId) {
        console.warn("[WS:auth] phase=rejected reason=missing_local_user");
        ws.close(1008, "Authentication required");
        return;
      }
      userId = localUserId;
      iss = "electron-local-capability";
    } else {
      const token = getWsToken(req);
      if (!token) {
        console.warn("[WS:auth] phase=rejected reason=no_token");
        ws.close(1008, "Authentication required");
        return;
      }
      tokenFp = jwtFingerprint(token);
      // ── Phase: validating (cloud) ────────────────────────────────────────────
      console.log(`[WS:auth] phase=validating tokenFp=${tokenFp}`);

      const payload = verifyJwt(token);

      if (!payload || !payload.sub) {
        const expiryStatus = peekJwtExpiry(token);
        const issLocal = peekIss(token);

        if (expiryStatus === "expired") {
          console.warn(`[WS:auth] phase=rejected reason=token_expired tokenFp=${tokenFp} iss=${issLocal}`);
          ws.close(1008, "token_expired");
        } else if (expiryStatus === "malformed") {
          console.warn(`[WS:auth] phase=rejected reason=token_malformed tokenFp=${tokenFp} iss=${issLocal}`);
          ws.close(1008, "token_malformed");
        } else {
          console.warn(`[WS:auth] phase=rejected reason=invalid_signature tokenFp=${tokenFp} iss=${issLocal}`);
          ws.close(1008, "token_invalid_signature");
        }
        return;
      }

      userId = payload.sub;
      iss = payload.iss || "(missing)";
      console.log(`[WS:auth] phase=accepted userId=${userId} connections=${(userConnectionCount.get(userId) ?? 0) + 1} tokenFp=${tokenFp} iss=${iss}`);
    }

    // Per-user connection limit — prevents Electron reconnect storms
    const current = userConnectionCount.get(userId) ?? 0;
    if (current >= MAX_CONNECTIONS_PER_USER) {
      console.warn(`[WS:auth] phase=rejected reason=too_many_connections userId=${userId} count=${current}`);
      ws.close(1008, "Too many connections");
      return;
    }
    userConnectionCount.set(userId, current + 1);

    // ── Phase: accepted ────────────────────────────────────────────────────────
    console.log(`[WS:auth] phase=accepted userId=${userId} connections=${current + 1} tokenFp=${tokenFp} iss=${iss}`);

    (ws as any).__userId = userId;

    // Connection-aware telemetry: a live consumer is now attached — ensure the
    // scheduler is running. Balanced by telemetryClientDisconnected() on close.
    telemetryClientConnected();

    ws.on("close", (code, reason) => {
      telemetryClientDisconnected();

      const n = (userConnectionCount.get(userId) ?? 1) - 1;
      if (n <= 0) userConnectionCount.delete(userId);
      else userConnectionCount.set(userId, n);

      // Always log disconnect — the reason and code are essential for reconnect diagnosis
      const reasonStr = reason?.toString() || "(none)";
      if (code === 1000 || code === 1001) {
        // Clean close — log at info level
        console.log(`[WS:disconnect] userId=${userId} code=${code} reason=${reasonStr} type=clean`);
      } else {
        // Unexpected close — log at warn level so it stands out
        console.warn(`[WS:disconnect] userId=${userId} code=${code} reason=${reasonStr} type=unexpected`);
      }
    });

    // Send cached snapshot immediately (without processes to keep the initial payload small)
    const cached = getCachedSnapshot();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "telemetry", data: toBroadcastPayload(cached) }));
    }

    // Send a fresh snapshot shortly after connect
    getSnapshot()
      .then((snap) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "telemetry", data: toBroadcastPayload(snap) }));
        }
      })
      .catch(() => {});
  });

  // Broadcast every 2 seconds — dedup by snapshot timestamp BEFORE stringify.
  // Comparing snap.ts is O(1); JSON.stringify of a 40-80 KB payload is not.
  broadcastInterval = setInterval(() => {
    if (!wss || wss.clients.size === 0) return;
    if (isKilled("telemetry")) return;
    const snap = getCachedSnapshot();
    if (snap.status === "loading") return;

    // Skip if the snapshot hasn't been refreshed since the last broadcast.
    if (snap.ts === lastBroadcastTs) return;
    lastBroadcastTs = snap.ts;

    const msg = JSON.stringify({ type: "telemetry", data: toBroadcastPayload(snap) });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }, 2000);

  console.log("[WS] Live telemetry WebSocket server ready at /ws/telemetry (auth required)");
}

// broadcastNow: force a fresh RAM reading then immediately broadcast to all
// connected clients. Used after memory clean so the dashboard updates instantly.
export async function broadcastNow(): Promise<void> {
  await refreshRamNow();
  if (!wss || wss.clients.size === 0) return;
  const snap = getCachedSnapshot();
  if (snap.status === "loading") return;
  lastBroadcastTs = snap.ts; // update dedup reference
  const msg = JSON.stringify({ type: "telemetry", data: toBroadcastPayload(snap) });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

export function teardownWebSocketServer() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (wss) wss.close();
}
