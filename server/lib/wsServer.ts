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
      console.warn("[WS] Rejected unauthenticated telemetry client (no token)");
      ws.close(1008, "Authentication required");
      return;
    }

    const tokenFp = jwtFingerprint(token);
    const payload = verifyJwt(token);

    if (!payload || !payload.sub) {
      // Distinguish expired from invalid-signature for better client-side handling
      const expiryStatus = peekJwtExpiry(token);
      if (expiryStatus === "expired") {
        console.warn(`[WS] Rejected telemetry client — token expired | tokenFp=${tokenFp}`);
        ws.close(1008, "token_expired");
      } else if (expiryStatus === "malformed") {
        console.warn(`[WS] Rejected telemetry client — token malformed | tokenFp=${tokenFp}`);
        ws.close(1008, "token_malformed");
      } else {
        // Structurally valid and not expired → wrong signature (secret drift)
        console.warn(`[WS] Rejected telemetry client — invalid signature | tokenFp=${tokenFp}`);
        ws.close(1008, "token_invalid_signature");
      }
      return;
    }

    const userId = payload.sub;

    // Per-user connection limit — prevents Electron reconnect storms
    const current = userConnectionCount.get(userId) ?? 0;
    if (current >= MAX_CONNECTIONS_PER_USER) {
      console.warn(`[WS] Connection limit hit userId=${userId} count=${current} — rejecting`);
      ws.close(1008, "Too many connections");
      return;
    }
    userConnectionCount.set(userId, current + 1);
    console.log(`[WS] Authenticated userId=${userId} connections=${current + 1} tokenFp=${tokenFp}`);

    (ws as any).__userId = userId;

    ws.on("close", (code, reason) => {
      const n = (userConnectionCount.get(userId) ?? 1) - 1;
      if (n <= 0) userConnectionCount.delete(userId);
      else userConnectionCount.set(userId, n);
      if (code !== 1000 && code !== 1001) {
        console.log(`[WS] userId=${userId} disconnected code=${code} reason=${reason?.toString() || "(none)"}`);
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
