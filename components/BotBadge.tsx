import type { BotDifficulty } from "@klaeff/protocol";

const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  welpe: "Welpe",
  klaeffer: "Kläffer",
  "alptraum-dogge": "Alptraum-Dogge",
};

export interface BotBadgeProps {
  readonly difficulty: BotDifficulty;
  readonly className?: string;
}

/**
 * Eindeutiges "BOT"-Abzeichen - nutzt nur bestehende Design-Tokens (siehe
 * Auftrag: keine neuen Farben). Ein Bot ist damit ueberall, wo dieses
 * Abzeichen sitzt, sofort und unmissverstaendlich als Bot erkennbar, nie
 * als Mensch dargestellt.
 */
export function BotBadge({ difficulty, className }: BotBadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 border-[var(--ink)] bg-[var(--violet)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--paper)] ${className ?? ""}`}
    >
      🤖 Bot · {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}
