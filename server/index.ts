import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { getGameServer } from "./game-server.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

async function main(): Promise<void> {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  getGameServer().attach(wss);

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, () => {
    console.info(`KLAEFF Server laeuft auf Port ${port} (dev=${dev})`);
  });
}

main().catch((error: unknown) => {
  console.error("Server-Start fehlgeschlagen:", error);
  process.exit(1);
});
