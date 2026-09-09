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

export const BarkScoreSchema = z.object({
  total: z.number(),
  breakdown: z.object({
    loudness: z.number(),
    attack: z.number(),
    crest: z.number(),
    character: z.number(),
  }),
  flags: z.array(AntiCheatFlagSchema),
  peakDbfs: z.number(),
  peakTimeMs: z.number(),
  activeDurationMs: z.number(),
});

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
});

export const LobbySnapshotSchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  mode: z.enum(["public", "private"]),
  phase: z.enum(["waiting", "countdown", "in-progress", "finished"]),
  players: z.array(PlayerSchema),
  hostId: z.string().nullable(),
  maxPlayers: z.number().int(),
  minPlayersToStart: z.number().int(),
  countdownEndsAt: z.number().nullable(),
});

// --- Client -> Server ---

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SET_NICKNAME"), nickname: z.string().min(1).max(40) }),
  z.object({ type: z.literal("SET_AVATAR"), avatar: AvatarSeedSchema }),
  z.object({ type: z.literal("QUICKMATCH_JOIN") }),
  z.object({ type: z.literal("QUICKMATCH_LEAVE") }),
  z.object({ type: z.literal("LOBBY_CREATE") }),
  z.object({ type: z.literal("LOBBY_JOIN"), code: z.string().length(6) }),
  z.object({ type: z.literal("LOBBY_LEAVE") }),
  z.object({ type: z.literal("LOBBY_KICK"), targetPlayerId: z.string() }),
  z.object({ type: z.literal("LOBBY_START") }),
  z.object({ type: z.literal("LEVEL_UPDATE"), level: z.number().min(0).max(100) }),
  z.object({ type: z.literal("CALIBRATION_SUBMIT"), profile: CalibrationProfileSchema }),
  z.object({ type: z.literal("BARK_SUBMIT"), frames: z.array(AudioFrameSchema).min(1).max(200) }),
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
  z.object({ type: z.literal("QUICKMATCH_QUEUED"), lobbyId: z.string() }),
  z.object({ type: z.literal("LOBBY_STATE"), lobby: LobbySnapshotSchema }),
  z.object({ type: z.literal("COUNTDOWN_UPDATE"), secondsRemaining: z.number() }),
  z.object({ type: z.literal("MATCH_STARTED"), matchId: z.string(), playerOrder: z.array(z.string()) }),
  z.object({ type: z.literal("ROUND_STARTED"), roundIndex: z.number(), barkerPlayerId: z.string(), windowMs: z.number() }),
  z.object({ type: z.literal("LEVEL_BROADCAST"), playerId: z.string(), level: z.number() }),
  z.object({
    type: z.literal("ROUND_RESULT"),
    roundIndex: z.number(),
    playerId: z.string(),
    score: BarkScoreSchema,
  }),
  z.object({
    type: z.literal("MATCH_RESULT"),
    standings: z.array(z.object({ playerId: z.string(), rank: z.number(), score: BarkScoreSchema.nullable() })),
  }),
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
