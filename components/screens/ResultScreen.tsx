"use client";

import { motion } from "framer-motion";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Card } from "../Card";
import { useGameStore } from "../../lib/store/game-store";

const PODIUM_HEIGHT: Record<number, string> = { 1: "9rem", 2: "6.5rem", 3: "4.5rem" };
const PODIUM_ORDER = [2, 1, 3];

export function ResultScreen({ onPlayAgain }: { readonly onPlayAgain: () => void }): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const standings = useGameStore((s) => s.matchStandings);
  const playerId = useGameStore((s) => s.playerId);

  const players = lobby?.players ?? [];
  const podium = (standings ?? []).filter((s) => s.rank <= 3);
  const rest = (standings ?? []).filter((s) => s.rank > 3);

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
              <p className="font-display text-lg">{entry.score ? Math.round(entry.score.total) : "-"}</p>
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
                <li key={entry.playerId} className="flex justify-between">
                  <span>
                    {entry.rank}. {player?.nickname}
                    {entry.playerId === playerId ? " (du)" : ""}
                  </span>
                  <span>{entry.score ? Math.round(entry.score.total) : "-"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Button type="button" variant="lime" className="w-full text-lg" onClick={onPlayAgain}>
        Nochmal!
      </Button>
    </main>
  );
}
