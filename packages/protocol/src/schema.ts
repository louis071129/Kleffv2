import { z } from "zod";

export const AvatarSeedSchema = z.object({
  headShape: z.number().int().min(0).max(4),
  ears: z.number().int().min(0).max(5),
  furColor: z.number().int().min(0).max(3),
  furPattern: z.number().int().min(0).max(3),
  eyes: z.number().int().min(0).max(5),
  snout: z.number().int().min(0).max(3),
  collarColor: z.number().int().min(0).max(7),
  collarCharm: z.number().int().min(0).max(4),
  accessory: z.number().int().min(0).max(10),
  idleSeed: z.number().int().min(0).max(1_000_000),
});

export const AudioFrameSchema = z.object({
  t: z.number().min(0),
  peakDbfs: z.number().finite(),
  rmsDbfs: z.number().finite(),
  centroidHz: z.number().min(0).finite(),
  flatness: z.number().min(0).max(1),
  clipped: z.boolean(),
});

export const CalibrationProfileSchema = z.object({
  noiseFloorDbfs: z.number().finite(),
  refVoiceDbfs: z.number().finite(),
  maxObservedDbfs: z.number().finite(),
  headroomDb: z.number().finite(),
  agcActive: z.boolean(),
  calibratedAt: z.number(),
});

export const AntiCheatFlagSchema = z.enum(["MIC_OVERLOAD", "REPLAY_SUSPECT", "CALIBRATION_MISMATCH"]);

export const StandingSchema = z.object({
  playerId: z.string(),
  rank: z.number(),
  /** Finale Gesamtpunktzahl (Integral der Lautstaerke ueber die Matchdauer) - siehe live-match.ts. */
  cumulativeScore: z.number(),
});

/** Die drei Bot-Schwierigkeitsstufen, siehe packages/scoring/src/bot.ts. */
export const BotDifficultySchema = z.enum(["welpe", "klaeffer", "alptraum-dogge"]);

export const EmoteSchema = z.enum([
  "WAU",
  "KNURR",
  "SCHWANZWEDELN",
  "WINSELN",
  "APPLAUS",
  "AUGENROLLEN",
  "HERZ",
  "SCHOCK",
]);

export const PlayerSchema = z.object({
  id: z.string(),
  nickname: z.string().min(1).max(20),
  avatar: AvatarSeedSchema,
  connected: z.boolean(),
  isHost: z.boolean(),
  joinedAt: z.number(),
  /** Nur bei Bot-Spielern gesetzt, sonst null - fuer das BOT-Abzeichen im UI. */
  botDifficulty: BotDifficultySchema.nullable().optional(),
});

export const PrivateMatchModeSchema = z.enum(["duell", "bracket", "rudel"]);
export const AudioModeSchema = z.enum(["synth", "real"]);

export const LobbySnapshotSchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  mode: z.enum(["carousel", "private"]),
  phase: z.enum(["waiting", "countdown", "in-progress", "finished"]),
  players: z.array(PlayerSchema),
  hostId: z.string().nullable(),
  maxPlayers: z.number().int(),
  minPlayersToStart: z.number().int(),
  countdownEndsAt: z.number().nullable(),
  matchMode: PrivateMatchModeSchema.nullable(),
  audioMode: AudioModeSchema,
});

export const BracketMatchupSchema = z.object({
  id: z.string(),
  round: z.number().int(),
  playerA: z.string(),
  playerB: z.string().nullable(),
  winnerId: z.string().nullable(),
});

// --- Client -> Server ---

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HELLO"),
    deviceUuid: z.string().min(1).max(100),
    nickname: z.string().min(1).max(40),
    avatar: AvatarSeedSchema,
  }),
  z.object({ type: z.literal("SET_NICKNAME"), nickname: z.string().min(1).max(40) }),
  z.object({ type: z.literal("SET_AVATAR"), avatar: AvatarSeedSchema }),
  z.object({ type: z.literal("CAROUSEL_JOIN") }),
  z.object({ type: z.literal("CAROUSEL_LEAVE") }),
  z.object({ type: z.literal("LOBBY_CREATE") }),
  z.object({ type: z.literal("LOBBY_JOIN"), code: z.string().length(6) }),
  z.object({ type: z.literal("LOBBY_LEAVE") }),
  z.object({ type: z.literal("LOBBY_KICK"), targetPlayerId: z.string() }),
  // Host fuegt einen Bot in einen freien Slot ein (nur private Lobby,
  // waehrend "waiting") - Entfernen laeuft ueber das bestehende LOBBY_KICK.
  z.object({ type: z.literal("LOBBY_ADD_BOT"), difficulty: BotDifficultySchema }),
  z.object({ type: z.literal("LOBBY_SET_MAX_PLAYERS"), maxPlayers: z.number().int().min(2).max(8) }),
  z.object({ type: z.literal("LOBBY_SET_MATCH_MODE"), matchMode: PrivateMatchModeSchema }),
  z.object({ type: z.literal("LOBBY_SET_AUDIO_MODE"), audioMode: AudioModeSchema }),
  z.object({ type: z.literal("LOBBY_START") }),
  z.object({ type: z.literal("LEVEL_UPDATE"), level: z.number().min(0).max(100) }),
  z.object({ type: z.literal("CALIBRATION_SUBMIT"), profile: CalibrationProfileSchema }),
  // Durchgehendes Live-Streaming waehrend des ganzen Matches (kein 3s-Fenster
  // mehr, kein Knopf) - treibt sowohl die serverseitige Live-Wertung als auch
  // den Bark-Synth beim Gegner im Kläffkarussell. Nie Rohaudio.
  z.object({ type: z.literal("BARK_FRAME"), frame: AudioFrameSchema }),
  // Echter Ton in privaten Lobbys: durchgehende komprimierte Aufnahme in
  // kurzen Chunks (kein Binaer-WS-Rahmen noetig fuer die kleinen Chunks).
  // Server haelt das nur in-memory, siehe server/game-server.ts.
  z.object({
    type: z.literal("AUDIO_BLOB_SUBMIT"),
    chunkSeq: z.number().int(),
    mimeType: z.string().min(1).max(100),
    dataBase64: z.string().min(1).max(2_000_000),
  }),
  z.object({ type: z.literal("EMOTE"), emote: EmoteSchema }),
  z.object({ type: z.literal("REPORT_PLAYER"), targetPlayerId: z.string() }),
  z.object({ type: z.literal("HEARTBEAT_PONG") }),
  z.object({ type: z.literal("RECONNECT"), sessionToken: z.string(), playerId: z.string() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- Server -> Client ---

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("WELCOME"), playerId: z.string(), sessionToken: z.string() }),
  z.object({ type: z.literal("NICKNAME_ACCEPTED"), nickname: z.string() }),
  z.object({ type: z.literal("NICKNAME_REJECTED"), fallbackNickname: z.string() }),
  z.object({ type: z.literal("CAROUSEL_QUEUED") }),
  z.object({ type: z.literal("LOBBY_STATE"), lobby: LobbySnapshotSchema }),
  z.object({ type: z.literal("COUNTDOWN_UPDATE"), secondsRemaining: z.number() }),
  z.object({
    type: z.literal("MATCH_STARTED"),
    matchId: z.string(),
    participantIds: z.array(z.string()),
    // "tugofwar": 2 Spieler (Kläffkarussell/Duell/Kläffduell-Matchup) - Seil,
    // endet sofort bei ±100. "rudel": 3+ Spieler gleichzeitig, feste Dauer,
    // Rangliste nach cumulativeScore. Siehe packages/protocol/src/live-match.ts.
    style: z.enum(["tugofwar", "rudel"]),
  }),
  z.object({ type: z.literal("LEVEL_BROADCAST"), playerId: z.string(), level: z.number() }),
  // Live-Relay der Feature-Frames waehrend des ganzen Matches (Kläffkarussell:
  // treibt den Bark-Synth beim Gegner). Nie Rohaudio.
  z.object({ type: z.literal("BARK_FRAME_BROADCAST"), playerId: z.string(), frame: AudioFrameSchema }),
  z.object({
    type: z.literal("AUDIO_BLOB_BROADCAST"),
    playerId: z.string(),
    chunkSeq: z.number().int(),
    mimeType: z.string(),
    dataBase64: z.string(),
  }),
  // Tick-Update des laufenden Live-Matches (alle TICK_MS, siehe live-match.ts) -
  // treibt die Tauzieh-Skala/Rudel-Rangliste live, ohne dass ein Knopf
  // gedrueckt werden muss. ropePosition nur bei style "tugofwar" gesetzt.
  z.object({
    type: z.literal("LIVE_MATCH_UPDATE"),
    scores: z.array(z.object({ playerId: z.string(), cumulativeScore: z.number() })),
    ropePosition: z.number().nullable(),
  }),
  z.object({
    type: z.literal("MATCH_RESULT"),
    standings: z.array(StandingSchema),
  }),
  z.object({ type: z.literal("BRACKET_STATE"), matchups: z.array(BracketMatchupSchema), champion: z.string().nullable() }),
  z.object({ type: z.literal("EMOTE_BROADCAST"), playerId: z.string(), emote: EmoteSchema }),
  z.object({ type: z.literal("FLAG_BROADCAST"), playerId: z.string(), flags: z.array(AntiCheatFlagSchema) }),
  z.object({ type: z.literal("REPORT_ACK") }),
  z.object({ type: z.literal("ERROR"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("HEARTBEAT_PING") }),
  z.object({
    type: z.literal("PRESENCE_STATUS"),
    playerId: z.string(),
    status: z.enum(["connected", "reconnecting", "disconnected"]),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessageSchema.parse(raw);
}

export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessageSchema.parse(raw);
}
