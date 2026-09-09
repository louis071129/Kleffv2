"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { AvatarSeed } from "@klaeff/protocol";
import { Avatar } from "./Avatar";

export interface TugOfWarBarProps {
  /** -1 (Gegner fuehrt voll) .. +1 (ich fuehre voll), 0 = neutral. */
  readonly fraction: number;
  readonly meNickname: string;
  readonly meAvatar: AvatarSeed;
  readonly opponentNickname: string;
  readonly opponentAvatar: AvatarSeed;
}

const NEAR_WIN_THRESHOLD = 0.7;

/**
 * Tauzieh-Skala: zeigt live, wer gerade gewinnt - das Seil wandert bei jedem
 * Bark deterministisch zur staerkeren Seite (siehe computeTugOfWarState in
 * packages/protocol). Bewusst als einzige, sofort lesbare Skala statt
 * Rundenzahlen: der Auftrag war explizit "klar erkennbar, wer gewinnt".
 */
export function TugOfWarBar({
  fraction,
  meNickname,
  meAvatar,
  opponentNickname,
  opponentAvatar,
}: TugOfWarBarProps): React.ReactElement {
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(-1, Math.min(1, fraction));
  // Ich stehe links (0%), Gegner rechts (100%) - der Knoten wandert bei
  // meinem Vorsprung zu MIR (wie beim echten Tauziehen: wer zieht, holt den
  // Knoten auf die eigene Seite).
  const knotPercent = 50 - clamped * 50;
  const iAmWinning = clamped > 0.02;
  const opponentWinning = clamped < -0.02;
  const nearWin = Math.abs(clamped) >= NEAR_WIN_THRESHOLD;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
        <span className={iAmWinning ? "text-[var(--lime)]" : "text-[var(--muted)]"}>{meNickname} (Du)</span>
        <span className={opponentWinning ? "text-[var(--pink)]" : "text-[var(--muted)]"}>{opponentNickname}</span>
      </div>

      <div className="relative h-9 w-full overflow-hidden rounded-full border-3 border-[var(--ink)]">
        {/* Gradient-Untergrund: meine Farbe links, Gegnerfarbe rechts. */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, var(--lime) 0%, var(--paper) 50%, var(--pink) 100%)" }}
        />
        {/* Sieg-Zonen an beiden Enden, sichtbar schraffiert. */}
        <div className="absolute inset-y-0 left-0 w-[15%] bg-[var(--lime)]/40" />
        <div className="absolute inset-y-0 right-0 w-[15%] bg-[var(--pink)]/40" />
        <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[var(--ink)]/40" />

        {/* Der Knoten - Position live aus dem echten Score berechnet, nie zufaellig. */}
        <motion.div
          className="absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-3 border-[var(--ink)] text-base"
          style={{ background: iAmWinning ? "var(--lime)" : opponentWinning ? "var(--pink)" : "var(--paper)" }}
          animate={{
            left: `calc(${knotPercent}% - 14px)`,
            scale: !reducedMotion && nearWin ? [1, 1.18, 1] : 1,
          }}
          transition={
            nearWin && !reducedMotion
              ? { left: { type: "spring", stiffness: 260, damping: 22 }, scale: { duration: 0.5, repeat: Infinity } }
              : { type: "spring", stiffness: 260, damping: 22 }
          }
        >
          🪢
        </motion.div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Avatar seed={meAvatar} size={40} />
        {nearWin && (
          <p className={`font-display text-sm ${iAmWinning ? "text-[var(--lime)]" : "text-[var(--pink)]"}`}>
            {iAmWinning ? "Gleich gewonnen!" : "Gleich verloren!"}
          </p>
        )}
        <Avatar seed={opponentAvatar} size={40} />
      </div>
    </div>
  );
}
