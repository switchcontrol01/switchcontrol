import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { getSnapshot } from "./telemetry";

let wss: WebSocketServer | null = null;
let broadcastInterval: NodeJS.Timeout | null = null;

export function setupWebSocketServer(httpServer: HttpServer) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/telemetry" });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("error", () => {});

    // send one snapshot immediately on connect
    getSnapshot()
      .then((snap) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "telemetry", data: snap }));
        }
      })
      .catch(() => {});
  });

  // Broadcast to all clients every 1.5 seconds
  broadcastInterval = setInterval(async () => {
    if (!wss || wss.clients.size === 0) return;
    try {
      const snap = await getSnapshot();
      const msg = JSON.stringify({ type: "telemetry", data: snap });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
    } catch {}
  }, 1500);

  console.log("[WS] Live telemetry WebSocket server ready at /ws/telemetry");
}

export function teardownWebSocketServer() {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (wss) wss.close();
}
