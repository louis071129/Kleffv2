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
          {lobby.mode === "public" ? "Schnellsuche" : "Private Lobby"}
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
        {lobby.mode === "public" && ` - ab ${lobby.minPlayersToStart} startet der Countdown`}
      </p>

      {lobby.mode === "private" && isHost && (
        <Button
          type="button"
          variant="lime"
          className="w-full text-lg"
          disabled={lobby.players.length < lobby.minPlayersToStart}
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
