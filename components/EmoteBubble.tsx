"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../lib/store/game-store";
import { EMOTE_ICON } from "../lib/emotes";

const VISIBLE_MS = 2200;

/** Zeigt das zuletzt gesendete Emote eines bestimmten Spielers kurz ueber dessen Avatar. */
export function EmoteBubble({ playerId }: { readonly playerId: string }): React.ReactElement | null {
  const latestEmote = useGameStore((s) => s.latestEmote);
  const [visibleId, setVisibleId] = useState<string | null>(null);

  useEffect(() => {
    if (latestEmote && latestEmote.playerId === playerId) {
      setVisibleId(latestEmote.id);
      const timer = setTimeout(() => setVisibleId(null), VISIBLE_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [latestEmote, playerId]);

  const emote = latestEmote && latestEmote.id === visibleId ? latestEmote.emote : null;

  return (
    <AnimatePresence>
      {emote && (
        <motion.div
          className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--ink)] bg-white px-2 py-1 text-lg"
          initial={{ opacity: 0, y: 6, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 320, damping: 20 }}
        >
          {EMOTE_ICON[emote as keyof typeof EMOTE_ICON]}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
