"use client";

import { motion } from "framer-motion";
import type { BarkScore } from "@klaeff/scoring";

const COMPONENTS: { key: keyof BarkScore["breakdown"]; label: string; max: number; color: string }[] = [
  { key: "loudness", label: "Lautstärke", max: 50, color: "var(--bark)" },
  { key: "attack", label: "Attack", max: 20, color: "var(--violet)" },
  { key: "crest", label: "Punch", max: 15, color: "var(--pink)" },
  { key: "character", label: "Bell-Charakter", max: 15, color: "var(--lime)" },
];

const FLAG_LABELS: Record<string, string> = {
  MIC_OVERLOAD: "Mikro übersteuert",
  REPLAY_SUSPECT: "Verdacht auf Wiederholung",
  CALIBRATION_MISMATCH: "Kalibrierung passt nicht mehr",
};

export function ScoreReveal({ score, nickname }: { readonly score: BarkScore; readonly nickname: string }): React.ReactElement {
  return (
    <div>
      <p className="text-center text-sm text-[var(--muted)]">{nickname}</p>
      <motion.p
        className="klaeff-score text-center"
        initial={{ scale: 1.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 320, damping: 24 }}
      >
        {Math.round(score.total)}
      </motion.p>
      <div className="mt-3 space-y-2">
        {COMPONENTS.map((c, i) => {
          const value = score.breakdown[c.key];
          const pct = Math.min(100, Math.max(0, (value / c.max) * 100));
          return (
            <div key={c.key}>
              <div className="flex justify-between text-xs">
                <span>{c.label}</span>
                <span>{value.toFixed(1)}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white">
                <motion.div
                  className="h-full"
                  style={{ background: c.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: i * 0.12, type: "spring", stiffness: 320, damping: 24 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {score.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {score.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full border-2 border-[var(--ink)] bg-[var(--violet)] px-2 py-1 text-[10px] font-semibold text-[var(--paper)]"
            >
              {FLAG_LABELS[flag] ?? flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
