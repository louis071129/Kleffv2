"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Card } from "../Card";
import { ScoreReveal } from "../ScoreReveal";
import { useGameStore } from "../../lib/store/game-store";
import { getAudioSession } from "../../lib/audio/session";

export function MatchScreen(): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const playerId = useGameStore((s) => s.playerId);
  const currentRound = useGameStore((s) => s.currentRound);
  const lastRoundResult = useGameStore((s) => s.lastRoundResult);
  const levels = useGameStore((s) => s.levels);
  const [barking, setBarking] = useState(false);

  const players = lobby?.players ?? [];
  const barkerId = currentRound?.barkerPlayerId ?? null;
  const barker = players.find((p) => p.id === barkerId) ?? null;
  const audience = players.filter((p) => p.id !== barkerId);
  const isMyTurn = barkerId === playerId;

  useEffect(() => {
    setBarking(false);
  }, [currentRound?.roundIndex]);

  async function handleBark(): Promise<void> {
    if (!currentRound) return;
    setBarking(true);
    try {
      await getAudioSession().captureBarkWindow(currentRound.windowMs);
    } finally {
      setBarking(false);
    }
  }

  const audienceLevel =
    audience.length > 0
      ? Math.round(audience.reduce((sum, p) => sum + (levels[p.id] ?? 0), 0) / audience.length)
      : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 px-5 py-8">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        Runde {(currentRound?.roundIndex ?? 0) + 1} / {players.length}
      </p>

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
        {barker && (
          <motion.div
            key={barker.id}
            className="flex flex-col items-center gap-2"
            animate={
              isMyTurn && barking
                ? { x: [0, -2, 2, -3, 3, 0], transition: { duration: 0.3, repeat: Infinity } }
                : {}
            }
          >
            <Avatar seed={barker.avatar} size={200} mouthOpen={(levels[barker.id] ?? 0) / 100} />
            <p className="font-display text-2xl">{barker.nickname}</p>
            {isMyTurn && <span className="text-xs text-[var(--lime)]">Du bist dran!</span>}
          </motion.div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {audience.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1 opacity-90">
              <Avatar seed={p.avatar} size={56} mouthOpen={(levels[p.id] ?? 0) / 100} />
              <p className="max-w-[4rem] truncate text-[10px]">{p.nickname}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Publikumsmeter - reine Show, kein Einfluss auf die Wertung. */}
      <div className="w-full">
        <p className="text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">Publikum</p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white">
          <motion.div
            className="h-full bg-[var(--violet)]"
            animate={{ width: `${audienceLevel}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </div>
      </div>

      {isMyTurn && currentRound && (
        <Button type="button" variant="lime" className="w-full text-xl" disabled={barking} onClick={handleBark}>
          {barking ? "🐕 Bell läuft..." : "🐕 BELL!"}
        </Button>
      )}

      <AnimatePresence>
        {lastRoundResult && lastRoundResult.roundIndex === currentRound?.roundIndex && (
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card shadowColor="var(--lime)">
              <ScoreReveal
                score={lastRoundResult.score}
                nickname={players.find((p) => p.id === lastRoundResult.playerId)?.nickname ?? ""}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
