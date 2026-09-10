import type { AntiCheatFlag, BotDifficulty } from "@klaeff/scoring";

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

export type LobbyMode = "carousel" | "private";
export type LobbyPhase = "waiting" | "countdown" | "in-progress" | "finished";
/** Wahl des Hosts ab 3 Spielern in einer privaten Lobby (bei genau 2 immer automatisch "duell"). */
export type PrivateMatchMode = "duell" | "bracket" | "rudel";
/** "real" = unveraenderter Ton (privater Lobby-Standard), "synth" = Bark-Synth statt echter Stimme. */
export type AudioMode = "synth" | "real";

export interface Player {
  readonly id: PlayerId;
  readonly deviceUuid: DeviceUuid;
  readonly nickname: string;
  readonly avatar: AvatarSeed;
  readonly connected: boolean;
  readonly isHost: boolean;
  readonly joinedAt: number;
  /** Nur bei Bot-Spielern gesetzt (sonst undefined) - siehe protocol/src/bot.ts. Nie true fuer echte Spieler. */
  readonly botDifficulty?: BotDifficulty;
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
  /** Nur "private": null bis der Host waehlt (Pflicht ab 3 Spielern, bei 2 automatisch "duell"). */
  readonly matchMode: PrivateMatchMode | null;
  /** "real" = echter Ton (Standard bei "private"), "carousel" ist immer "synth". */
  readonly audioMode: AudioMode;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * "tugofwar": 2 Spieler (Kläffkarussell-Begegnung, Duell, ein Kläffduell-
 * Matchup) - Seilposition = Differenz der cumulativeScores, endet sofort
 * bei ±TUG_OF_WAR_LIVE_THRESHOLD. "rudel": 3+ Spieler gleichzeitig - jeder
 * akkumuliert unabhaengig, Match laeuft eine feste Dauer, Rangliste nach
 * cumulativeScore. Siehe live-match.ts.
 */
export type LiveMatchStyle = "tugofwar" | "rudel";

export interface LiveMatchState {
  readonly id: MatchId;
  readonly lobbyId: LobbyId;
  readonly participantIds: readonly PlayerId[];
  readonly style: LiveMatchStyle;
  /** Laufende Gesamtpunktzahl pro Spieler - Integral der Lautstaerke ueber die Zeit, siehe live-match.ts. */
  readonly cumulativeScores: Readonly<Record<PlayerId, number>>;
  readonly phase: "in-progress" | "finished";
  readonly startedAt: number;
  readonly finishedAt: number | null;
}

export interface Standing {
  readonly playerId: PlayerId;
  readonly rank: number;
  /** Finale Gesamtpunktzahl (Integral der Lautstaerke ueber die Matchdauer) - die einzige noch relevante Zahl, egal ob Tauzieh oder Rudel. */
  readonly cumulativeScore: number;
}

export type PublicFlagLabel = AntiCheatFlag;
