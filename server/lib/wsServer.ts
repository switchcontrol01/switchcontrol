import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "url";
import { getCachedSnapshot, getSnapshot } from "./telemetry";
import { verifyJwt } from "./jwt";

let wss: WebSocketServer | null = null;
let broadcastInterval: NodeJS.Timeout | null = null;

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

    // Auth gate: reject unauthenticated clients before sending telemetry.
    // Telemetry carries live CPU temp, RAM usage, GPU state, disk I/O, network
    // throughput — only the authenticated app owner should see it.
    const token = getWsToken(req);
    if (!token) {
      console.warn("[WS] Rejected unauthenticated telemetry client (no token)");
      ws.close(1008, "Authentication required");
      return;
    }
    const payload = verifyJwt(token);
    if (!payload || !payload.sub) {
      console.warn("[WS] Rejected telemetry client (invalid or expired token)");
      ws.close(1008, "Invalid or expired token");
      return;
    }
    // Tag the socket with the verified user id for future per-user features
    (ws as any).__userId = payload.sub;
    console.log(`[WS] Authenticated telemetry client userId=${payload.sub}`);

    // Send cached snapshot immediately (no await, instant response)
    const cached = getCachedSnapshot();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "telemetry", data: cached }));
    }

    // Also send a fresh snapshot shortly after connect (covers the loading → ready transition)
    getSnapshot()
      .then((snap) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "telemetry", data: snap }));
        }
      })
      .catch(() => {});
  });

  // Broadcast cached snapshot to all clients every 5 seconds.
  // (background polling in telemetry.ts refreshes the cache independently)
  // 5 s keeps displays feeling live while keeping CPU+network budget low.
  broadcastInterval = setInterval(() => {
    if (!wss || wss.clients.size === 0) return;
    const snap = getCachedSnapshot();
    if (snap.status === "loading") return; // skip until we have real data
    const msg = JSON.stringify({ type: "telemetry", data: snap });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }, 5000);

  console.log("[WS] Live telemetry WebSocket server ready at /ws/telemetry (auth required)");
}

export function teardownWebSocketServer() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (wss) wss.close();
}
