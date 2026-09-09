"use client";

import { motion } from "framer-motion";
import { Button } from "../Button";
import { Card } from "../Card";

export function CarouselQueueScreen({ onLeave }: { readonly onLeave: () => void }): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <Card shadowColor="var(--violet)">
        <motion.p
          className="text-5xl"
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          🎠
        </motion.p>
        <h2 className="mt-2 font-display text-2xl">Suche Gegner...</h2>
        <p className="mt-2 text-sm">
          Sobald jemand anderes auch im Kläffkarussell wartet, geht es direkt los - kein
          Countdown.
        </p>
      </Card>
      <Button type="button" variant="secondary" className="w-full" onClick={onLeave}>
        Kläffkarussell verlassen
      </Button>
    </main>
  );
}
