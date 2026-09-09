"use client";

import { create } from "zustand";
import type { AntiCheatFlag, BarkScore } from "@klaeff/scoring";
import type { AvatarSeed, ServerMessage } from "@klaeff/protocol";
import { getKlaeffClient, type ConnectionStatus } from "../ws-client";
import { DEFAULT_AVATAR, getOrCreateDeviceUuid, loadAvatar, loadNickname, saveAvatar, saveNickname } from "../storage";

type LobbySnapshot = Extract<ServerMessage, { type: "LOBBY_STATE" }>["lobby"];
type MatchStandings = Extract<ServerMessage, { type: "MATCH_RESULT" }>["standings"];

export type Screen = "home" | "calibration" | "queue" | "lobby" | "match" | "result";

export interface EmoteEvent {
  readonly id: string;
  readonly playerId: string;
  readonly emote: string;
}

interface GameStoreState {
  status: ConnectionStatus;
  playerId: string | null;
  deviceUuid: string;
  nickname: string;
  avatar: AvatarSeed;
  screen: Screen;

  lobby: LobbySnapshot | null;
  matchId: string | null;
  totalRounds: number | null;
  currentRound: { roundIndex: number; barkerPlayerId: string; windowMs: number } | null;
  lastRoundResult: { roundIndex: number; playerId: string; score: BarkScore } | null;
  matchStandings: MatchStandings | null;
  levels: Record<string, number>;
  latestEmote: EmoteEvent | null;
  flagsByPlayer: Record<string, AntiCheatFlag[]>;
  errorMessage: string | null;
  countdownSeconds: number | null;

  setNickname: (nickname: string) => void;
  setAvatar: (avatar: AvatarSeed) => void;
  connect: () => void;
  goHome: () => void;
  setScreen: (screen: Screen) => void;
  /** Laedt Nickname/Avatar/Device-UUID aus localStorage. Nur client-seitig nach dem Mount aufrufen. */
  hydrate: () => void;
}

let wired = false;

export const useGameStore = create<GameStoreState>((set, get) => {
  function wireClientOnce(): void {
    if (wired) return;
    wired = true;
    const client = getKlaeffClient();

    client.onStatusChange((status) => set({ status }));

    client.on("WELCOME", (msg) => set({ playerId: msg.playerId }));

    client.on("CAROUSEL_QUEUED", () => set({ screen: "queue" }));

    client.on("LOBBY_STATE", (msg) => {
      const screen = get().screen;
      set({
        lobby: msg.lobby,
        screen: screen === "home" || screen === "calibration" ? "lobby" : screen,
      });
    });

    client.on("COUNTDOWN_UPDATE", (msg) => set({ countdownSeconds: msg.secondsRemaining }));

    client.on("MATCH_STARTED", (msg) =>
      set({ matchId: msg.matchId, totalRounds: msg.totalRounds, screen: "match", matchStandings: null }),
    );

    client.on("ROUND_STARTED", (msg) =>
      set({
        currentRound: { roundIndex: msg.roundIndex, barkerPlayerId: msg.barkerPlayerId, windowMs: msg.windowMs },
      }),
    );

    client.on("ROUND_RESULT", (msg) =>
      set({ lastRoundResult: { roundIndex: msg.roundIndex, playerId: msg.playerId, score: msg.score } }),
    );

    client.on("MATCH_RESULT", (msg) => set({ matchStandings: msg.standings, screen: "result", currentRound: null }));

    client.on("LEVEL_BROADCAST", (msg) =>
      set((state) => ({ levels: { ...state.levels, [msg.playerId]: msg.level } })),
    );

    client.on("EMOTE_BROADCAST", (msg) =>
      set({ latestEmote: { id: `${msg.playerId}-${Date.now()}`, playerId: msg.playerId, emote: msg.emote } }),
    );

    client.on("FLAG_BROADCAST", (msg) =>
      set((state) => ({ flagsByPlayer: { ...state.flagsByPlayer, [msg.playerId]: msg.flags } })),
    );

    client.on("ERROR", (msg) => set({ errorMessage: msg.message }));

    client.on("NICKNAME_REJECTED", (msg) => {
      set({ nickname: msg.fallbackNickname });
      saveNickname(msg.fallbackNickname);
    });
  }

  return {
    status: "disconnected",
    playerId: null,
    // Bewusst IMMER dieselben Defaults, egal ob Server- oder Client-Render:
    // localStorage existiert beim SSR-Durchlauf nicht, ein Zweig hier wuerde
    // einen Hydration-Mismatch erzeugen. Echte Werte kommen ueber hydrate()
    // aus einem useEffect nach dem Mount (siehe GameApp).
    deviceUuid: "",
    nickname: "",
    avatar: DEFAULT_AVATAR,
    screen: "home",

    lobby: null,
    matchId: null,
    totalRounds: null,
    currentRound: null,
    lastRoundResult: null,
    matchStandings: null,
    levels: {},
    latestEmote: null,
    flagsByPlayer: {},
    errorMessage: null,
    countdownSeconds: null,

    setNickname: (nickname) => {
      saveNickname(nickname);
      set({ nickname });
    },
    setAvatar: (avatar) => {
      saveAvatar(avatar);
      set({ avatar });
      getKlaeffClient().send({ type: "SET_AVATAR", avatar });
    },
    connect: () => {
      wireClientOnce();
      const { deviceUuid, nickname, avatar } = get();
      getKlaeffClient().connect(deviceUuid, nickname || "Spieler", avatar);
    },
    goHome: () =>
      set({ screen: "home", lobby: null, matchId: null, totalRounds: null, currentRound: null, matchStandings: null }),
    setScreen: (screen) => set({ screen }),
    hydrate: () => {
      set({
        deviceUuid: getOrCreateDeviceUuid(),
        nickname: loadNickname() ?? "",
        avatar: loadAvatar(),
      });
    },
  };
});
