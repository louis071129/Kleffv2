"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getKlaeffClient } from "../lib/ws-client";
import { sfxTap } from "../lib/audio/sfx";
import { vibrate, HAPTIC_TAP } from "../lib/haptics";
import { EMOTES, type Emote } from "../lib/emotes";

export function EmoteWheel(): React.ReactElement {
  const [open, setOpen] = useState(false);

  function send(emote: Emote): void {
    getKlaeffClient().send({ type: "EMOTE", emote });
    sfxTap();
    vibrate(HAPTIC_TAP);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <AnimatePresence>
        {open && (
          <motion.div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              right: 0,
              display: "grid",
              gridTemplateColumns: "repeat(4, 44px)",
              gap: 8,
              borderRadius: 16,
              border: "3px solid var(--ink)",
              background: "var(--paper)",
              padding: 12,
              boxShadow: "6px 6px 0 0 var(--ink)",
            }}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            {EMOTES.map((e) => (
              <button
                key={e.key}
                type="button"
                aria-label={e.label}
                title={e.label}
                onClick={() => send(e.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 44,
                  width: 44,
                  borderRadius: 12,
                  border: "2px solid var(--ink)",
                  background: "white",
                  fontSize: "1.25rem",
                }}
              >
                {e.icon}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label="Emote-Rad öffnen"
        onClick={() => setOpen((v) => !v)}
        className="klaeff-btn klaeff-btn--secondary rounded-full text-2xl"
        style={{ height: 56, width: 56, padding: 0 }}
      >
        😀
      </button>
    </div>
  );
}
