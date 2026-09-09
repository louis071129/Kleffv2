import type { AntiCheatFlag, BarkScore, CalibrationProfile } from "@klaeff/scoring";

export type PlayerId = string;
export type LobbyId = string;
export type MatchId = string;
export type DeviceUuid = string;

export interface AvatarSeed {
  readonly headShape: number; // 0..4
  readonly ears: number; // 0..5
  readonly furColor: number; // 0..3
  readonly furPattern: number; // 0..3
  readonly eyes: number; // 0..5
  readonly snout: number; // 0..3
  readonly collarColor: number; // 0..7
  readonly collarCharm: number; // 0..4
  /** 0 = kein Accessoire, 1..10 = Stil. */
  readonly accessory: number; // 0..10
  /** Seed fuer Idle-Animation-Rhythmus (Blinzeln, Schwanzwedeln), damit Avatare nicht synchron wirken. */
  readonly idleSeed: number;
}

export type LobbyMode = "public" | "private";
export type LobbyPhase = "waiting" | "countdown" | "in-progress" | "finished";

export interface Player {
  readonly id: PlayerId;
  readonly deviceUuid: DeviceUuid;
  readonly nickname: string;
  readonly avatar: AvatarSeed;
  readonly connected: boolean;
  readonly isHost: boolean;
  readonly joinedAt: number;
}

export interface Lobby {
  readonly id: LobbyId;
  readonly code: string | null;
  readonly mode: LobbyMode;
  readonly phase: LobbyPhase;
  readonly players: readonly Player[];
  readonly hostId: PlayerId | null;
  readonly maxPlayers: number;
  readonly minPlayersToStart: number;
  readonly countdownEndsAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RoundResult {
  readonly playerId: PlayerId;
  readonly roundIndex: number;
  readonly score: BarkScore;
  readonly calibration: CalibrationProfile;
}

export interface Match {
  readonly id: MatchId;
  readonly lobbyId: LobbyId;
  readonly playerOrder: readonly PlayerId[];
  readonly currentRoundIndex: number;
  readonly results: readonly RoundResult[];
  readonly phase: "in-progress" | "finished";
  readonly startedAt: number;
  readonly finishedAt: number | null;
}

export interface Standing {
  readonly playerId: PlayerId;
  readonly rank: number;
  readonly result: RoundResult | null;
}

export type PublicFlagLabel = AntiCheatFlag;
