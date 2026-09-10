"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Avatar } from "../Avatar";
import { BotBadge } from "../BotBadge";
import { Button } from "../Button";
import { Card } from "../Card";
import { useGameStore } from "../../lib/store/game-store";
import { sfxWin } from "../../lib/audio/sfx";
import { HAPTIC_WIN, vibrate } from "../../lib/haptics";

const PODIUM_HEIGHT: Record<number, string> = { 1: "9rem", 2: "6.5rem", 3: "4.5rem" };
const PODIUM_ORDER = [2, 1, 3];

export interface ResultScreenProps {
  readonly onPlayAgain: () => void;
  /** Nur fuer das Kläffkarussell relevant - "Verlassen" statt "Nochmal!" als zweite Option. */
  readonly onLeave?: () => void;
}

export function ResultScreen({ onPlayAgain, onLeave }: ResultScreenProps): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const standings = useGameStore((s) => s.matchStandings);
  const playerId = useGameStore((s) => s.playerId);
  const announced = useRef(false);
  const isCarousel = lobby?.mode === "carousel";
  // Kläffduell-Gesamtplatzierung (K.-o.-Ausscheidung) hat keinen echten
  // cumulativeScore je Spieler (nur die Ausscheidungsrunde zaehlt, siehe
  // finishBracket in server/game-server.ts) - dort "-" statt einer
  // irrefuehrenden 0 anzeigen.
  const isBracketFinal = lobby?.matchMode === "bracket";

  const players = lobby?.players ?? [];
  const podium = (standings ?? []).filter((s) => s.rank <= 3);
  const rest = (standings ?? []).filter((s) => s.rank > 3);
  const won = podium.find((s) => s.rank === 1)?.playerId === playerId;
  // Tauzieh (2 Spieler, egal ob Kläffkarussell/Duell oder ein 2-Spieler-
  // Kläffduell): eindeutiger Sieg/Niederlage-Moment statt Podium - der
  // Auftrag verlangt explizit, dass der Gewinnmoment sofort klar ist.
  const isTugOfWarResult = (standings?.length ?? 0) === 2;

  useEffect(() => {
    if (!announced.current && standings) {
      announced.current = true;
      sfxWin();
      if (won) vibrate(HAPTIC_WIN);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standings]);

  if (isTugOfWarResult && standings) {
    const winnerEntry = standings.find((s) => s.rank === 1);
    const loserEntry = standings.find((s) => s.rank === 2);
    const winner = players.find((p) => p.id === winnerEntry?.playerId);
    const loser = players.find((p) => p.id === loserEntry?.playerId);
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-8 px-5 py-8">
        <motion.h1
          className={`font-display text-6xl ${won ? "text-[var(--lime)]" : "text-[var(--pink)]"}`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          {won ? "SIEG!" : "NIEDERLAGE"}
        </motion.h1>

        <div className="flex w-full items-center justify-center gap-6">
          {winner && (
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <Avatar seed={winner.avatar} size={110} />
              <p className="font-display text-lg text-[var(--lime)]">
                {winner.nickname}
                {winner.id === playerId ? " (Du)" : ""}
              </p>
              {winner.botDifficulty && <BotBadge difficulty={winner.botDifficulty} />}
              <span className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-2 py-0.5 text-[10px] font-bold">
                🏆 GEWINNER
              </span>
            </motion.div>
          )}
          {loser && (
            <motion.div
              className="flex flex-col items-center gap-2 opacity-70"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 0.7 }}
              transition={{ delay: 0.15 }}
            >
              <Avatar seed={loser.avatar} size={70} />
              <p className="font-display text-sm">
                {loser.nickname}
                {loser.id === playerId ? " (Du)" : ""}
              </p>
              {loser.botDifficulty && <BotBadge difficulty={loser.botDifficulty} />}
            </motion.div>
          )}
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button type="button" variant="lime" className="w-full text-lg" onClick={onPlayAgain}>
            {isCarousel ? "🎠 Nächster Gegner" : "Nochmal!"}
          </Button>
          {isCarousel && onLeave && (
            <Button type="button" variant="secondary" className="w-full" onClick={onLeave}>
              Kläffkarussell verlassen
            </Button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 px-5 py-8">
      <h1 className="font-display text-4xl text-[var(--lime)]">Ergebnis</h1>

      <div className="flex items-end gap-3">
        {PODIUM_ORDER.map((rank) => {
          const entry = podium.find((s) => s.rank === rank);
          if (!entry) return null;
          const player = players.find((p) => p.id === entry.playerId);
          return (
            <motion.div
              key={rank}
              className="flex flex-col items-center gap-2"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: rank * 0.15, type: "spring", stiffness: 320, damping: 24 }}
            >
              {player && <Avatar seed={player.avatar} size={rank === 1 ? 80 : 60} />}
              <p className="max-w-[5rem] truncate text-center text-xs font-semibold">{player?.nickname}</p>
              {player?.botDifficulty && <BotBadge difficulty={player.botDifficulty} className="text-[7px]" />}
              <p className="font-display text-lg">{isBracketFinal ? "-" : Math.round(entry.cumulativeScore)}</p>
              <div
                className="flex w-16 items-start justify-center rounded-t-lg border-3 border-[var(--ink)] bg-[var(--paper)] pt-2 text-[var(--ink)]"
                style={{ height: PODIUM_HEIGHT[rank] }}
              >
                <span className="font-display text-2xl">{rank}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <Card className="w-full" shadowColor="var(--violet)">
          <ul className="space-y-1 text-sm">
            {rest.map((entry) => {
              const player = players.find((p) => p.id === entry.playerId);
              return (
                <li key={entry.playerId} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1">
                    {entry.rank}. {player?.nickname}
                    {entry.playerId === playerId ? " (du)" : ""}
                    {player?.botDifficulty && <BotBadge difficulty={player.botDifficulty} className="text-[7px]" />}
                  </span>
                  <span>{isBracketFinal ? "-" : Math.round(entry.cumulativeScore)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Button type="button" variant="lime" className="w-full text-lg" onClick={onPlayAgain}>
        {isCarousel ? "🎠 Nächster Gegner" : "Nochmal!"}
      </Button>
      {isCarousel && onLeave && (
        <Button type="button" variant="secondary" className="w-full" onClick={onLeave}>
          Kläffkarussell verlassen
        </Button>
      )}
    </main>
  );
}
