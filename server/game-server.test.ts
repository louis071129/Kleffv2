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

  /** Wie waitFor, aber fuer zwei moegliche Nachrichtentypen - registriert genau EINEN Waiter statt zwei. */
  waitForEither<T1 extends ServerMessage["type"], T2 extends ServerMessage["type"]>(
    type1: T1,
    type2: T2,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { type: T1 | T2 }>> {
    const predicate = (m: ServerMessage): m is Extract<ServerMessage, { type: T1 | T2 }> => m.type === type1 || m.type === type2;
    const index = this.received.findIndex(predicate);
    if (index >= 0) {
      const [msg] = this.received.splice(index, 1);
      return Promise.resolve(msg as Extract<ServerMessage, { type: T1 | T2 }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout beim Warten auf ${type1}/${type2}`)), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T1 | T2 }>);
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

async function playFullMatch(
  players: { client: TestClient; playerId: string }[],
  totalRounds: number,
): Promise<void> {
  for (let round = 0; round < totalRounds; round += 1) {
    const roundStarted = await players[0]!.client.waitFor("ROUND_STARTED", 3000);
    const barker = players.find((p) => p.playerId === roundStarted.barkerPlayerId);
    expect(barker).toBeDefined();
    barker!.client.send({ type: "BARK_SUBMIT", frames: makeFrames(-5) });
    await players[0]!.client.waitFor("ROUND_RESULT", 3000);
  }
}

/**
 * Spielt ein Tauzieh-Match (Kläffkarussell/Duell/Kläffduell-Matchup) bis zum
 * MATCH_RESULT durch - die Rundenzahl ist dynamisch (Seil-Schwelle statt
 * fester Zyklenzahl), daher wird hier ueber ROUND_STARTED/MATCH_RESULT
 * geloopt statt eine feste Anzahl Runden anzunehmen. `peakForPlayer` steuert
 * pro Spieler deterministisch, wie laut gebellt wird - mit klar
 * unterschiedlichen Werten (siehe Score-Formel in packages/scoring) loest
 * sich die Seil-Schwelle in wenigen Runden auf statt in ein 0:0 oder den
 * Sudden-Death-Fallback zu laufen.
 */
async function playTugOfWarMatch(
  listener: TestClient,
  players: { client: TestClient; playerId: string }[],
  peakForPlayer: (playerId: string) => number,
  maxRounds = 30,
): Promise<Extract<ServerMessage, { type: "MATCH_RESULT" }>> {
  for (let i = 0; i < maxRounds; i += 1) {
    const next = await listener.waitForEither("ROUND_STARTED", "MATCH_RESULT", 3000);
    if (next.type === "MATCH_RESULT") {
      return next;
    }
    const barker = players.find((p) => p.playerId === next.barkerPlayerId);
    expect(barker).toBeDefined();
    barker!.client.send({ type: "BARK_SUBMIT", frames: makeFrames(peakForPlayer(next.barkerPlayerId)) });
    await listener.waitFor("ROUND_RESULT", 3000);
  }
  throw new Error("Tauzieh-Match nicht innerhalb der Sicherheitsgrenze entschieden");
}

/**
 * Spielt ein Match gegen einen Bot bis zum MATCH_RESULT durch: der Bot
 * bellt von selbst (server-seitiger Timer, siehe GameServer.maybeScheduleBotBark),
 * der Mensch bellt nur, wenn ER an der Reihe ist.
 */
async function playAgainstBot(
  listener: TestClient,
  human: { client: TestClient; playerId: string },
  maxRounds = 40,
): Promise<Extract<ServerMessage, { type: "MATCH_RESULT" }>> {
  for (let i = 0; i < maxRounds; i += 1) {
    const next = await listener.waitForEither("ROUND_STARTED", "MATCH_RESULT", 5000);
    if (next.type === "MATCH_RESULT") {
      return next;
    }
    if (next.barkerPlayerId === human.playerId) {
      human.client.send({ type: "BARK_SUBMIT", frames: makeFrames(-5) });
      await listener.waitFor("ROUND_RESULT", 5000);
    }
    // Sonst ist der Bot dran - der bellt serverseitig von selbst, nur warten.
  }
  throw new Error("Match gegen Bot nicht innerhalb der Sicherheitsgrenze entschieden");
}

describe("GameServer - Kläffkarussell (Integration, echte WebSocket-Clients)", () => {
  it("zwei wartende Spieler werden sofort gepaart und spielen eine komplette Begegnung (nie Rohaudio)", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const a = await harness.connect("device-a", "A");
    const b = await harness.connect("device-b", "B");
    a.client.send({ type: "CAROUSEL_JOIN" });
    await a.client.waitFor("CAROUSEL_QUEUED", 2000);
    b.client.send({ type: "CAROUSEL_JOIN" });
    await b.client.waitFor("CAROUSEL_QUEUED", 2000);

    const lobbyState = await a.client.waitFor("LOBBY_STATE", 2000);
    expect(lobbyState.lobby.mode).toBe("carousel");
    expect(lobbyState.lobby.audioMode).toBe("synth");
    expect(lobbyState.lobby.players).toHaveLength(2);

    const started = await a.client.waitFor("MATCH_STARTED", 2000);
    expect(started.style).toBe("tugofwar");

    // A bellt laut, B leise -> Seil zieht deterministisch zu A, kein Zufall.
    const result = await playTugOfWarMatch(a.client, [a, b], (playerId) => (playerId === a.playerId ? -5 : -45));
    expect(result.standings).toHaveLength(2);
    expect(result.standings[0]?.rank).toBe(1);
    expect(result.standings[0]?.playerId).toBe(a.playerId);
  }, 15000);

  it("bei 4 gleichzeitig wartenden Spielern entstehen zwei Paare", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const players = [];
    for (let i = 0; i < 4; i += 1) {
      players.push(await harness.connect(`device-q4-${i}`, `P${i}`));
    }
    for (const p of players) {
      p.client.send({ type: "CAROUSEL_JOIN" });
    }
    const lobbyIds = new Set<string>();
    for (const p of players) {
      const state = await p.client.waitFor("LOBBY_STATE", 2000);
      lobbyIds.add(state.lobby.id);
    }
    expect(lobbyIds.size).toBe(2);
  }, 10000);

  it("bei 6 gleichzeitig wartenden Spielern entstehen drei Paare", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const players = [];
    for (let i = 0; i < 6; i += 1) {
      players.push(await harness.connect(`device-q6-${i}`, `P${i}`));
    }
    for (const p of players) {
      p.client.send({ type: "CAROUSEL_JOIN" });
    }
    const lobbyIds = new Set<string>();
    for (const p of players) {
      const state = await p.client.waitFor("LOBBY_STATE", 2000);
      lobbyIds.add(state.lobby.id);
    }
    expect(lobbyIds.size).toBe(3);
  }, 10000);

  it("nach einer Begegnung fuehrt ein erneuter CAROUSEL_JOIN zu einem neuen Gegner (Re-Pairing)", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const a = await harness.connect("device-r1", "A");
    const b = await harness.connect("device-r2", "B");
    const c = await harness.connect("device-r3", "C");

    a.client.send({ type: "CAROUSEL_JOIN" });
    b.client.send({ type: "CAROUSEL_JOIN" });
    const firstLobby = await a.client.waitFor("LOBBY_STATE", 2000);
    await playTugOfWarMatch(a.client, [a, b], (playerId) => (playerId === a.playerId ? -5 : -45));
    await b.client.waitFor("MATCH_RESULT", 2000);

    // A sucht sich einen neuen Gegner, C wartet bereits.
    c.client.send({ type: "CAROUSEL_JOIN" });
    await c.client.waitFor("CAROUSEL_QUEUED", 2000);
    a.client.send({ type: "CAROUSEL_JOIN" });
    const secondLobby = await a.client.waitFor("LOBBY_STATE", 2000);

    expect(secondLobby.lobby.id).not.toBe(firstLobby.lobby.id);
    expect(secondLobby.lobby.players.map((p) => p.id).sort()).toEqual([a.playerId, c.playerId].sort());
  }, 15000);

  it("aktives Verlassen (CAROUSEL_LEAVE) entfernt aus der Warteschlange - kein Pairing mehr", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const a = await harness.connect("device-l1", "A");
    const b = await harness.connect("device-l2", "B");
    a.client.send({ type: "CAROUSEL_JOIN" });
    await a.client.waitFor("CAROUSEL_QUEUED", 2000);
    a.client.send({ type: "CAROUSEL_LEAVE" });

    b.client.send({ type: "CAROUSEL_JOIN" });
    await b.client.waitFor("CAROUSEL_QUEUED", 2000);
    // Kein Partner mehr da (A ist raus) - B bekommt kein LOBBY_STATE.
    await expect(b.client.waitFor("LOBBY_STATE", 500)).rejects.toThrow();
  }, 10000);

  it("Feature-Frames werden waehrend des Bellfensters live an den Gegner relayed (Grundlage fuer den Bark-Synth)", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const a = await harness.connect("device-f1", "A");
    const b = await harness.connect("device-f2", "B");
    a.client.send({ type: "CAROUSEL_JOIN" });
    b.client.send({ type: "CAROUSEL_JOIN" });
    const roundStarted = await a.client.waitFor("ROUND_STARTED", 2000);
    const barker = roundStarted.barkerPlayerId === a.playerId ? a : b;
    const listener = barker === a ? b : a;

    const liveFrame = { t: 20, peakDbfs: -12, rmsDbfs: -18, centroidHz: 1300, flatness: 0.4, clipped: false };
    barker.client.send({ type: "BARK_FRAME", frame: liveFrame });
    const broadcast = await listener.client.waitFor("BARK_FRAME_BROADCAST", 2000);
    expect(broadcast.playerId).toBe(barker.playerId);
    expect(broadcast.frame).toEqual(liveFrame);
  }, 10000);

  it("Melde-Schwelle: ab 3 Meldungen aus verschiedenen Lobbys wird das Kläffkarussell gesperrt", async () => {
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

    target.client.send({ type: "CAROUSEL_JOIN" });
    const error = await target.client.waitFor("ERROR", 2000);
    expect(error.code).toBe("CAROUSEL_EXCLUDED");
  }, 10000);

  it("wartet ein einzelner Spieler laenger als botFallbackMs ohne menschlichen Gegner, wird er mit einem Bot gepaart", async () => {
    const harness = await createHarness({ botFallbackMs: 150, botBarkDelayMs: [10, 30] });
    currentHarness = harness;

    const a = await harness.connect("device-solo", "Solo");
    a.client.send({ type: "CAROUSEL_JOIN" });
    await a.client.waitFor("CAROUSEL_QUEUED", 2000);

    const lobbyState = await a.client.waitFor("LOBBY_STATE", 2000);
    expect(lobbyState.lobby.players).toHaveLength(2);
    const bot = lobbyState.lobby.players.find((p) => p.id !== a.playerId);
    expect(bot).toBeDefined();
    expect(bot!.botDifficulty).not.toBeNull();
    expect(["welpe", "klaeffer", "alptraum-dogge"]).toContain(bot!.botDifficulty);

    const started = await a.client.waitFor("MATCH_STARTED", 2000);
    expect(started.style).toBe("tugofwar");
    expect(started.playerOrder).toContain(bot!.id);

    const result = await playAgainstBot(a.client, a);
    expect(result.standings).toHaveLength(2);
    expect(result.standings.some((s) => s.playerId === a.playerId)).toBe(true);
    expect(result.standings.some((s) => s.playerId === bot!.id)).toBe(true);
  }, 20000);
});

describe("GameServer - Private Lobby (Integration, echte WebSocket-Clients)", () => {
  it("2 Spieler: automatisch Duell-Modus, echter Ton per Default, Standings nach Rundensiegen", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-d1", "Host");
    const guest = await harness.connect("device-d2", "Gast");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    expect(hostLobby.lobby.audioMode).toBe("real");
    guest.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await guest.client.waitFor("LOBBY_STATE");
    await host.client.waitFor("LOBBY_STATE"); // Join-Broadcast auch beim Host abraeumen

    host.client.send({ type: "LOBBY_START" });
    const started = await host.client.waitFor("LOBBY_STATE", 2000);
    expect(started.lobby.matchMode).toBe("duell");
    const matchStarted = await host.client.waitFor("MATCH_STARTED", 2000);
    expect(matchStarted.style).toBe("tugofwar");

    // Host immer lauter als Gast -> Seil zieht deterministisch zum Host,
    // kein Zufall und kein fester Rundenzaehler entscheidet.
    const result = await playTugOfWarMatch(host.client, [host, guest], (playerId) =>
      playerId === host.playerId ? -3 : -30,
    );
    expect(result.standings).toHaveLength(2);
    expect(result.standings[0]?.playerId).toBe(host.playerId);
    expect(result.standings[0]?.rank).toBe(1);
    expect(result.standings[1]?.rank).toBe(2);
  }, 15000);

  it("Echter Ton: eine gesendete Audio-Aufnahme wird an den Mitspieler relayed", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-a1", "Host");
    const guest = await harness.connect("device-a2", "Gast");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    guest.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await guest.client.waitFor("LOBBY_STATE");

    host.client.send({
      type: "AUDIO_BLOB_SUBMIT",
      roundIndex: 0,
      mimeType: "audio/webm;codecs=opus",
      dataBase64: "ZmFrZS1hdWRpby1kYXRh",
    });
    const broadcast = await guest.client.waitFor("AUDIO_BLOB_BROADCAST", 2000);
    expect(broadcast.playerId).toBe(host.playerId);
    expect(broadcast.mimeType).toBe("audio/webm;codecs=opus");
    expect(broadcast.dataBase64).toBe("ZmFrZS1hdWRpby1kYXRh");
  }, 10000);

  it("Host kann 'Echter Ton' abschalten - danach kein Audio-Blob-Relay mehr", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-a3", "Host");
    const guest = await harness.connect("device-a4", "Gast");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    guest.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await guest.client.waitFor("LOBBY_STATE");
    await host.client.waitFor("LOBBY_STATE"); // Join-Broadcast auch beim Host abraeumen

    host.client.send({ type: "LOBBY_SET_AUDIO_MODE", audioMode: "synth" });
    const updated = await host.client.waitFor("LOBBY_STATE", 2000);
    expect(updated.lobby.audioMode).toBe("synth");

    host.client.send({ type: "AUDIO_BLOB_SUBMIT", roundIndex: 0, mimeType: "audio/webm", dataBase64: "eA==" });
    await expect(guest.client.waitFor("AUDIO_BLOB_BROADCAST", 500)).rejects.toThrow();
  }, 10000);

  it("ab 3 Spielern verlangt LOBBY_START vorher einen gewaehlten Modus (Rudel/Kläffduell)", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-m1", "Host");
    const p2 = await harness.connect("device-m2", "P2");
    const p3 = await harness.connect("device-m3", "P3");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    p2.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await p2.client.waitFor("LOBBY_STATE");
    p3.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await p3.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_START" });
    const error = await host.client.waitFor("ERROR", 2000);
    expect(error.code).toBe("MATCH_MODE_REQUIRED");
  }, 10000);

  it("Rudel (3 Spieler): rankt nach Summe ueber 3 Zyklen (9 Runden)", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-ru1", "Host");
    const p2 = await harness.connect("device-ru2", "P2");
    const p3 = await harness.connect("device-ru3", "P3");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    p2.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await p2.client.waitFor("LOBBY_STATE");
    p3.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await p3.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_SET_MATCH_MODE", matchMode: "rudel" });
    await host.client.waitFor("LOBBY_STATE", 2000);
    host.client.send({ type: "LOBBY_START" });
    const matchStarted = await host.client.waitFor("MATCH_STARTED", 2000);
    expect(matchStarted.totalRounds).toBe(9);

    await playFullMatch([host, p2, p3], 9);
    const result = await host.client.waitFor("MATCH_RESULT", 2000);
    expect(result.standings).toHaveLength(3);
    expect(result.standings[0]?.aggregateTotal).not.toBeNull();
  }, 20000);

  it("Kläffduell (Bracket, 3 Spieler): laeuft bis zu einem Champion durch", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-br1", "Host");
    const p2 = await harness.connect("device-br2", "P2");
    const p3 = await harness.connect("device-br3", "P3");
    host.client.send({ type: "LOBBY_CREATE" });
    const hostLobby = await host.client.waitFor("LOBBY_STATE");
    p2.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await p2.client.waitFor("LOBBY_STATE");
    p3.client.send({ type: "LOBBY_JOIN", code: hostLobby.lobby.code! });
    await p3.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_SET_MATCH_MODE", matchMode: "bracket" });
    await host.client.waitFor("LOBBY_STATE", 2000);
    host.client.send({ type: "LOBBY_START" });

    const players = [host, p2, p3];
    // Jeder Spieler bellt konstant unterschiedlich laut (Host am lautesten,
    // P3 am leisesten) -> jedes Matchup (Tauzieh) loest sich deterministisch
    // in wenigen Runden auf, unabhaengig davon wer das Freilos bekommt.
    // 60 Runden Sicherheitsgrenze ist grosszuegig fuer 2 Matchups.
    const peakByPlayer = new Map<string, number>([
      [host.playerId, -5],
      [p2.playerId, -20],
      [p3.playerId, -45],
    ]);
    const finalResult = await playTugOfWarMatch(host.client, players, (playerId) => peakByPlayer.get(playerId)!, 60);
    expect(finalResult.standings.find((s) => s.rank === 1)).toBeDefined();
    expect(finalResult.standings[0]?.playerId).toBe(host.playerId);
  }, 20000);

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

  it("Bot zu einer privaten Lobby hinzufuegen: Runde laeuft komplett durch, ohne zweiten Menschen (Solo-Test fuers iPad)", async () => {
    const harness = await createHarness({ botBarkDelayMs: [10, 30] });
    currentHarness = harness;

    const host = await harness.connect("device-bot1", "Host");
    host.client.send({ type: "LOBBY_CREATE" });
    await host.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_ADD_BOT", difficulty: "klaeffer" });
    const withBot = await host.client.waitFor("LOBBY_STATE", 2000);
    expect(withBot.lobby.players).toHaveLength(2);
    const bot = withBot.lobby.players.find((p) => p.id !== host.playerId);
    expect(bot?.botDifficulty).toBe("klaeffer");
    expect(bot?.nickname.startsWith("Kläffer")).toBe(true);

    host.client.send({ type: "LOBBY_START" });
    const started = await host.client.waitFor("MATCH_STARTED", 2000);
    expect(started.style).toBe("tugofwar");

    const result = await playAgainstBot(host.client, host);
    expect(result.standings).toHaveLength(2);
    expect(result.standings.some((s) => s.playerId === bot!.id)).toBe(true);
  }, 20000);

  it("Bot kann per LOBBY_KICK wieder aus der Lobby entfernt werden wie ein echter Spieler", async () => {
    const harness = await createHarness();
    currentHarness = harness;

    const host = await harness.connect("device-bot2", "Host");
    host.client.send({ type: "LOBBY_CREATE" });
    await host.client.waitFor("LOBBY_STATE");

    host.client.send({ type: "LOBBY_ADD_BOT", difficulty: "welpe" });
    const withBot = await host.client.waitFor("LOBBY_STATE", 2000);
    const bot = withBot.lobby.players.find((p) => p.id !== host.playerId)!;

    host.client.send({ type: "LOBBY_KICK", targetPlayerId: bot.id });
    const afterKick = await host.client.waitFor("LOBBY_STATE", 2000);
    expect(afterKick.lobby.players).toHaveLength(1);
  }, 10000);
});
