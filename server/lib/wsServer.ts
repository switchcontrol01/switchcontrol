import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "url";
import { getCachedSnapshot, getSnapshot } from "./telemetry";
import { verifyJwt, jwtFingerprint, peekJwtExpiry } from "./jwt";
import { isKilled } from "./killSwitch";

let wss: WebSocketServer | null = null;
let broadcastInterval: NodeJS.Timeout | null = null;

// Per-user connection limit — prevents reconnect storms from Electron
const MAX_CONNECTIONS_PER_USER = 3;
const userConnectionCount = new Map<string, number>();

// Payload dedup — skip broadcast when nothing has changed
let lastBroadcastPayload: string | null = null;

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
  wss = new WebSocketServer({ server: httpServer, path: "/ws/telemetry" });

  wss.on("connection", (ws: WebSocket, req: any) => {
    ws.on("error", () => {});

    // Kill switch — if telemetry is disabled, reject new connections gracefully
    if (isKilled("telemetry")) {
      ws.close(1001, "Telemetry temporarily disabled");
      return;
    }

    // Auth gate
    const token = getWsToken(req);
    if (!token) {
      console.warn("[WS:auth] phase=rejected reason=no_token");
      ws.close(1008, "Authentication required");
      return;
    }

    const tokenFp = jwtFingerprint(token);

    // ── Phase: validating ──────────────────────────────────────────────────────
    console.log(`[WS:auth] phase=validating tokenFp=${tokenFp}`);

    const payload = verifyJwt(token);

    if (!payload || !payload.sub) {
      // Distinguish expired from invalid-signature for better client-side handling
      const expiryStatus = peekJwtExpiry(token);
      const iss = peekIss(token);

      if (expiryStatus === "expired") {
        console.warn(`[WS:auth] phase=rejected reason=token_expired tokenFp=${tokenFp} iss=${iss}`);
        ws.close(1008, "token_expired");
      } else if (expiryStatus === "malformed") {
        console.warn(`[WS:auth] phase=rejected reason=token_malformed tokenFp=${tokenFp} iss=${iss}`);
        ws.close(1008, "token_malformed");
      } else {
        // Structurally valid and not expired → wrong signature (secret drift)
        console.warn(`[WS:auth] phase=rejected reason=invalid_signature tokenFp=${tokenFp} iss=${iss}`);
        ws.close(1008, "token_invalid_signature");
      }
      return;
    }

    const userId = payload.sub;
    const iss = payload.iss || "(missing)";

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

    ws.on("close", (code, reason) => {
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

    // Send cached snapshot immediately
    const cached = getCachedSnapshot();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "telemetry", data: cached }));
    }

    // Send a fresh snapshot shortly after connect
    getSnapshot()
      .then((snap) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "telemetry", data: snap }));
        }
      })
      .catch(() => {});
  });

  // Broadcast every 2 seconds — skip if payload unchanged (dedup)
  broadcastInterval = setInterval(() => {
    if (!wss || wss.clients.size === 0) return;
    if (isKilled("telemetry")) return;
    const snap = getCachedSnapshot();
    if (snap.status === "loading") return;
    const msg = JSON.stringify({ type: "telemetry", data: snap });
    if (msg === lastBroadcastPayload) return; // nothing changed, skip
    lastBroadcastPayload = msg;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }, 2000);

  console.log("[WS] Live telemetry WebSocket server ready at /ws/telemetry (auth required)");
}

export function teardownWebSocketServer() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (wss) wss.close();
}
