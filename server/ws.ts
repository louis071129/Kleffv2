import type { WebSocketServer } from "ws";

export function attachGameServer(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    ws.on("close", () => {
      // Wird in Phase 3 mit echtem Match-State verbunden.
    });
  });
}
