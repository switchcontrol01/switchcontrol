import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { getCachedSnapshot, getSnapshot } from "./telemetry";

let wss: WebSocketServer | null = null;
let broadcastInterval: NodeJS.Timeout | null = null;

export function setupWebSocketServer(httpServer: HttpServer) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/telemetry" });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("error", () => {});

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

  // Broadcast cached snapshot to all clients every 1 second
  // (background polling in telemetry.ts refreshes the cache independently)
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
  }, 1000);

  console.log("[WS] Live telemetry WebSocket server ready at /ws/telemetry");
}

export function teardownWebSocketServer() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (wss) wss.close();
}
