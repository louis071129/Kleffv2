import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { GameServer } from "./game-server.js";
import type { AvatarSeed, ClientMessage, ServerMessage } from "@klaeff/protocol";

const TEST_AVATAR: AvatarSeed = {
  headShape: 0,
  ears: 0,
  furColor: 0,
  furPattern: 0,
  eyes: 0,
  snout: 0,
  collarColor: 0,
  collarCharm: 0,
  accessory: 0,
  idleSeed: 1,
};

function makeFrames(
  peakDbfs: number,
  count = 20,
): { t: number; peakDbfs: number; rmsDbfs: number; centroidHz: number; flatness: number; clipped: boolean }[] {
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    frames.push({ t: i * 20, peakDbfs, rmsDbfs: peakDbfs - 8, centroidHz: 1400, flatness: 0.3, clipped: false });
  }
  return frames;
}

/**
 * Kleiner Test-Client um einen echten WebSocket. `waitFor` konsumiert die
 * gefundene Nachricht (entfernt sie aus dem Puffer) - so wartet ein zweiter
 * Aufruf fuer denselben Typ garantiert auf ein NEUES Vorkommen, ohne dass
 * Tests den Puffer manuell leeren muessen.
 */
class TestClient {
  readonly ws: WebSocket;
  readonly received: ServerMessage[] = [];
  private readonly waiters: { predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      const waiterIndex = this.waiters.findIndex((w) => w.predicate(msg));
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        waiter!.resolve(msg);
      } else {
        this.received.push(msg);
      }
    });
  }

  waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  waitFor<T extends ServerMessage["type"]>(type: T, timeoutMs = 3000): Promise<Extract<ServerMessage, { type: T }>> {
    const predicate = (m: ServerMessage): m is Extract<ServerMessage, { type: T }> => m.type === type;
    const index = this.received.findIndex(predicate);
    if (index >= 0) {
      const [msg] = this.received.splice(index, 1);
      return Promise.resolve(msg as Extract<ServerMessage, { type: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout beim Warten auf ${type}`)), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

interface TestHarness {
  httpServer: Server;
  gameServer: GameServer;
  url: string;
  clients: TestClient[];
  connect(deviceUuid: string, nickname: string): Promise<{ client: TestClient; playerId: string; sessionToken: string }>;
}

async function createHarness(overrides: ConstructorParameters<typeof GameServer>[0] = {}): Promise<TestHarness> {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const gameServer = new GameServer({
    roundTimeoutMs: 400,
    countdownMs: 300,
    tickIntervalMs: 30,
    disconnectGraceMs: 300,
    heartbeatIntervalMs: 60_000,
    ...overrides,
  });
  gameServer.attach(wss);
  gameServer.start();

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const url = `ws://127.0.0.1:${port}/ws`;

  const clients: TestClient[] = [];

  return {
    httpServer,
    gameServer,
    url,
    clients,
    async connect(deviceUuid: string, nickname: string) {
      const client = new TestClient(url);
      clients.push(client);
      await client.waitForOpen();
      client.send({ type: "HELLO", deviceUuid, nickname, avatar: TEST_AVATAR });
      const welcome = await client.waitFor("WELCOME");
      return { client, playerId: welcome.playerId, sessionToken: welcome.sessionToken };
    },
  };
}

function closeHarness(harness: TestHarness): Promise<void> {
  for (const client of harness.clients) {
    client.close();
  }
  harness.gameServer.stop();
  return new Promise((resolve) => harness.httpServer.close(() => resolve()));
}

let currentHarness: TestHarness | null = null;

afterEach(async () => {
  if (currentHarness) {
    await closeHarness(currentHarness);
    currentHarness = null;
  }
});

describe("GameServer - Integration (echte WebSocket-Clients)", () => {
  it("fuenf Spieler finden sich ueber die Schnellsuche und spielen ein komplettes Match durch", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const players = [];
    for (let i = 0; i < 5; i += 1) {
      players.push(await harness.connect(`device-${i}`, `Spieler${i}`));
    }
    for (const p of players) {
      p.client.send({ type: "QUICKMATCH_JOIN" });
    }

    const started = await players[0]!.client.waitFor("MATCH_STARTED", 5000);
    expect(started.playerOrder).toHaveLength(5);

    for (let round = 0; round < 5; round += 1) {
      const roundStarted = await players[0]!.client.waitFor("ROUND_STARTED", 3000);
      const barker = players.find((p) => p.playerId === roundStarted.barkerPlayerId);
      expect(barker).toBeDefined();
      barker!.client.send({ type: "BARK_SUBMIT", frames: makeFrames(-5) });
      await players[0]!.client.waitFor("ROUND_RESULT", 3000);
    }

    const result = await players[0]!.client.waitFor("MATCH_RESULT", 3000);
    expect(result.standings).toHaveLength(5);
    expect(result.standings[0]?.rank).toBe(1);
  }, 15000);

  it("Nachfuellen bis 6 Spieler resettet den Countdown nicht (Backfill)", async () => {
    const harness = await createHarness({ countdownMs: 1000 });
    currentHarness = harness;

    const players = [];
    for (let i = 0; i < 3; i += 1) {
      const p = await harness.connect(`device-b${i}`, `B${i}`);
      players.push(p);
      p.client.send({ type: "QUICKMATCH_JOIN" });
    }
    const countdownState = await players[0]!.client.waitFor("LOBBY_STATE", 2000);
    expect(countdownState.lobby.phase === "countdown" || countdownState.lobby.phase === "waiting").toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const fourth = await harness.connect("device-b3", "B3");
    fourth.client.send({ type: "QUICKMATCH_JOIN" });
    const afterJoin = await fourth.client.waitFor("LOBBY_STATE", 2000);
    expect(afterJoin.lobby.players.length).toBeGreaterThanOrEqual(4);
  }, 10000);

  it("Disconnect mitten in der Runde, dann Reconnect mit Sitzung", async () => {
    const harness = await createHarness({ roundTimeoutMs: 3000, disconnectGraceMs: 1500 });
    currentHarness = harness;

    const host = await harness.connect("device-h1", "Host");
    const guest = await harness.connect("device-h2", "Gast");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    const code = hostLobby.lobby.code!;
    guest.client.send({ type: "LOBBY_JOIN", code });
    await guest.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_START" });
    const roundStarted = await guest.client.waitFor("ROUND_STARTED", 2000);
    const barker = roundStarted.barkerPlayerId === host.playerId ? host : guest;
    const other = barker === host ? guest : host;

    barker.client.close();
    await other.client.waitFor("PRESENCE_STATUS", 2000);

    const reconnectClient = new TestClient(harness.url);
    harness.clients.push(reconnectClient);
    await reconnectClient.waitForOpen();
    reconnectClient.send({ type: "RECONNECT", sessionToken: barker.sessionToken, playerId: barker.playerId });
    const welcome = await reconnectClient.waitFor("WELCOME", 2000);
    expect(welcome.playerId).toBe(barker.playerId);

    reconnectClient.send({ type: "BARK_SUBMIT", frames: makeFrames(-5) });
    const result = await other.client.waitFor("ROUND_RESULT", 3000);
    expect(result.playerId).toBe(barker.playerId);
  }, 10000);

  it("Host verlaesst eine private Lobby - der naechste Spieler wird Host", async () => {
    const harness = await createHarness({ disconnectGraceMs: 300 });
    currentHarness = harness;

    const host = await harness.connect("device-p1", "Host");
    const guest = await harness.connect("device-p2", "Gast");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    guest.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await guest.client.waitFor("LOBBY_STATE");

    host.client.close();

    const afterHostLeft = await guest.client.waitFor("LOBBY_STATE", 2000);
    expect(afterHostLeft.lobby.players).toHaveLength(1);
    expect(afterHostLeft.lobby.hostId).toBe(guest.playerId);
  }, 10000);

  it("doppelter Join mit derselben Device-UUID (zwei Tabs) fuehrt nicht zum Absturz", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const tabA = await harness.connect("device-same", "Doppel");
    const tabB = await harness.connect("device-same", "Doppel");
    tabA.client.send({ type: "LOBBY_CREATE" });
    const lobbyState = await tabA.client.waitFor("LOBBY_STATE");
    tabB.client.send({ type: "LOBBY_JOIN", code: lobbyState.lobby.code! });
    const joined = await tabB.client.waitFor("LOBBY_STATE", 2000);

    expect(joined.lobby.players).toHaveLength(2);
    expect(tabA.playerId).not.toBe(tabB.playerId);
  }, 10000);

  it("Spieler sendet keine Frames - die Runde timed out automatisch mit Score 0", async () => {
    const harness = await createHarness({ roundTimeoutMs: 200 });
    currentHarness = harness;

    const host = await harness.connect("device-t1", "Host");
    const guest = await harness.connect("device-t2", "Gast");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    guest.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await guest.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_START" });
    const result = await host.client.waitFor("ROUND_RESULT", 3000);
    expect(result.score.total).toBe(0);
  }, 10000);

  it("Nickname-Filter: gesperrter Name wird beim Handshake durch Fallback ersetzt", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const client = new TestClient(harness.url);
    harness.clients.push(client);
    await client.waitForOpen();
    client.send({ type: "HELLO", deviceUuid: "device-n1", nickname: "Hurensohn", avatar: TEST_AVATAR });
    await client.waitFor("WELCOME");
    const rejected = await client.waitFor("NICKNAME_REJECTED", 2000);
    expect(rejected.fallbackNickname).not.toMatch(/hurensohn/iu);
  }, 10000);

  it("Melde-Schwelle: ab 3 Meldungen aus verschiedenen Lobbys wird die Schnellsuche gesperrt", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const target = await harness.connect("device-reported", "Zielspieler");

    for (let i = 0; i < 3; i += 1) {
      const reporter = await harness.connect(`device-reporter-${i}`, `Melder${i}`);
      reporter.client.send({ type: "LOBBY_CREATE" });
      await reporter.client.waitFor("LOBBY_STATE");
      reporter.client.send({ type: "REPORT_PLAYER", targetPlayerId: target.playerId });
      await reporter.client.waitFor("REPORT_ACK", 2000);
    }

    target.client.send({ type: "QUICKMATCH_JOIN" });
    const error = await target.client.waitFor("ERROR", 2000);
    expect(error.code).toBe("PUBLIC_QUEUE_EXCLUDED");
  }, 10000);
});
