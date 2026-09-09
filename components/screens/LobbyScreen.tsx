"use client";

import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Card } from "../Card";
import { ConnectionDot } from "../ConnectionDot";
import { EmoteBubble } from "../EmoteBubble";
import { EmoteWheel } from "../EmoteWheel";
import { useGameStore } from "../../lib/store/game-store";
import { getKlaeffClient } from "../../lib/ws-client";

export function LobbyScreen({ onLeave }: { readonly onLeave: () => void }): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const playerId = useGameStore((s) => s.playerId);
  const status = useGameStore((s) => s.status);
  const countdownSeconds = useGameStore((s) => s.countdownSeconds);
  const levels = useGameStore((s) => s.levels);

  if (!lobby) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 py-10 text-center">
        <p className="font-display text-2xl">Verbinde...</p>
        <ConnectionDot status={status} />
      </main>
    );
  }

  const me = lobby.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl">
          {lobby.mode === "carousel" ? "Kläffkarussell" : "Private Lobby"}
        </h1>
        <ConnectionDot status={status} />
      </header>

      {lobby.mode === "private" && lobby.code && (
        <Card shadowColor="var(--violet)" className="text-center">
          <p className="text-xs uppercase tracking-wide">Einladungscode</p>
          <p className="font-display text-4xl tracking-[0.3em]">{lobby.code}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {typeof window !== "undefined" ? `${window.location.origin}/j/${lobby.code}` : `/j/${lobby.code}`}
          </p>
        </Card>
      )}

      {lobby.phase === "countdown" && (
        <Card shadowColor="var(--lime)" className="text-center">
          <p className="font-display text-3xl text-[var(--bark)]">{countdownSeconds ?? "..."}</p>
          <p className="text-sm">Das Match startet gleich - noch mehr Spieler können dazukommen.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        {lobby.players.map((player) => (
          <Card key={player.id} className="flex flex-col items-center gap-1 py-3" shadowColor="var(--bark)">
            <div className="relative">
              <EmoteBubble playerId={player.id} />
              <Avatar seed={player.avatar} size={64} mouthOpen={(levels[player.id] ?? 0) / 100} />
              <span
                className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[var(--ink)]"
                style={{ background: player.connected ? "var(--lime)" : "var(--muted)" }}
              />
            </div>
            <p className="max-w-[6rem] truncate text-sm font-semibold">{player.nickname}</p>
            {player.isHost && <span className="text-[10px] uppercase text-[var(--violet)]">Host</span>}
            {player.id !== playerId && (
              <div className="flex gap-2">
                {isHost && (
                  <button
                    type="button"
                    className="text-[10px] text-[var(--pink)] underline"
                    onClick={() => getKlaeffClient().send({ type: "LOBBY_KICK", targetPlayerId: player.id })}
                  >
                    Kicken
                  </button>
                )}
                <button
                  type="button"
                  className="text-[10px] text-[var(--muted)] underline"
                  onClick={() => getKlaeffClient().send({ type: "REPORT_PLAYER", targetPlayerId: player.id })}
                >
                  Melden
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-[var(--muted)]">
        {lobby.players.length}/{lobby.maxPlayers} Spieler
      </p>

      {lobby.mode === "private" && lobby.audioMode === "real" && (
        <p className="rounded-full border-2 border-[var(--ink)] bg-[var(--bark)]/15 px-3 py-1 text-center text-[10px]">
          🔊 Echter Ton: alle hier hören deine echte Aufnahme. Gilt nur in dieser Lobby.
        </p>
      )}

      {lobby.mode === "private" && isHost && lobby.phase === "waiting" && (
        <Card shadowColor="var(--violet)" className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide">Host-Einstellungen</p>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Spielerzahl-Limit</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="klaeff-btn klaeff-btn--secondary min-h-[36px] min-w-[36px] px-0 py-0"
                disabled={lobby.maxPlayers <= Math.max(2, lobby.players.length)}
                onClick={() => getKlaeffClient().send({ type: "LOBBY_SET_MAX_PLAYERS", maxPlayers: lobby.maxPlayers - 1 })}
              >
                −
              </button>
              <span className="w-6 text-center font-display">{lobby.maxPlayers}</span>
              <button
                type="button"
                className="klaeff-btn klaeff-btn--secondary min-h-[36px] min-w-[36px] px-0 py-0"
                disabled={lobby.maxPlayers >= 8}
                onClick={() => getKlaeffClient().send({ type: "LOBBY_SET_MAX_PLAYERS", maxPlayers: lobby.maxPlayers + 1 })}
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Echter Ton</span>
            <button
              type="button"
              className={`klaeff-btn min-h-[36px] px-3 py-1 text-xs ${lobby.audioMode === "real" ? "klaeff-btn--lime" : "klaeff-btn--secondary"}`}
              onClick={() =>
                getKlaeffClient().send({
                  type: "LOBBY_SET_AUDIO_MODE",
                  audioMode: lobby.audioMode === "real" ? "synth" : "real",
                })
              }
            >
              {lobby.audioMode === "real" ? "An" : "Aus (Bark-Synth)"}
            </button>
          </div>

          {lobby.players.length >= 3 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm">Modus (ab 3 Spielern Pflicht)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`klaeff-btn flex-1 min-h-[36px] px-2 py-1 text-xs ${lobby.matchMode === "bracket" ? "klaeff-btn--lime" : "klaeff-btn--secondary"}`}
                  onClick={() => getKlaeffClient().send({ type: "LOBBY_SET_MATCH_MODE", matchMode: "bracket" })}
                >
                  Kläffduell (K.o.)
                </button>
                <button
                  type="button"
                  className={`klaeff-btn flex-1 min-h-[36px] px-2 py-1 text-xs ${lobby.matchMode === "rudel" ? "klaeff-btn--lime" : "klaeff-btn--secondary"}`}
                  onClick={() => getKlaeffClient().send({ type: "LOBBY_SET_MATCH_MODE", matchMode: "rudel" })}
                >
                  Rudel (Ranking)
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {lobby.mode === "private" && isHost && (
        <Button
          type="button"
          variant="lime"
          className="w-full text-lg"
          disabled={
            lobby.players.length < lobby.minPlayersToStart || (lobby.players.length >= 3 && lobby.matchMode === null)
          }
          onClick={() => getKlaeffClient().send({ type: "LOBBY_START" })}
        >
          Match starten
        </Button>
      )}

      <Button type="button" variant="secondary" className="w-full" onClick={onLeave}>
        Lobby verlassen
      </Button>

      <div className="fixed bottom-6 right-5">
        <EmoteWheel />
      </div>
    </main>
  );
}
