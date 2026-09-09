"use client";

import { motion } from "framer-motion";
import type { AvatarSeed } from "@klaeff/protocol";
import { Avatar } from "./Avatar";

export interface RudelProgressEntry {
  readonly playerId: string;
  readonly nickname: string;
  readonly avatar: AvatarSeed;
  readonly total: number;
}

export interface RudelProgressProps {
  readonly entries: readonly RudelProgressEntry[];
  readonly myPlayerId: string | null;
}

/**
 * Rudel ist kein 2-Seiten-Tauzieh (3+ Spieler), bekommt aber laut Auftrag
 * trotzdem ein "aehnlich klares Fortschrittselement": eine live nach
 * Score-Summe sortierte Rangliste mit Balken relativ zum Fuehrenden - man
 * sieht auf einen Blick, wer vorne liegt und wie gross der Abstand ist.
 */
export function RudelProgress({ entries, myPlayerId }: RudelProgressProps): React.ReactElement {
  const sorted = [...entries].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...sorted.map((e) => e.total));

  return (
    <div className="w-full space-y-1.5">
      <p className="text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">Rudel-Rangliste</p>
      {sorted.map((entry, index) => {
        const isMe = entry.playerId === myPlayerId;
        const isLeader = index === 0 && entry.total > 0;
        return (
          <div key={entry.playerId} className="flex items-center gap-2">
            <span className="w-4 text-center text-xs font-semibold">{index + 1}</span>
            <Avatar seed={entry.avatar} size={28} />
            <div className="relative h-5 flex-1 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white">
              <motion.div
                className={isLeader ? "h-full bg-[var(--lime)]" : "h-full bg-[var(--violet)]"}
                animate={{ width: `${(entry.total / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-[var(--ink)]">
                {entry.nickname}
                {isMe ? " (Du)" : ""}
              </span>
            </div>
            <span className="w-8 text-right text-xs font-semibold">{Math.round(entry.total)}</span>
          </div>
        );
      })}
    </div>
  );
}
