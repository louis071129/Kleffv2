"use client";

import { useState } from "react";
import { Button } from "../Button";
import { Card } from "../Card";
import { Avatar } from "../Avatar";
import { LegalFooter } from "../LegalFooter";
import { CookieNotice } from "../CookieNotice";
import { useGameStore } from "../../lib/store/game-store";
import { randomAvatarSeed } from "../../lib/storage";

export interface HomeScreenProps {
  readonly initialCode?: string;
  readonly onStart: (mode: "carousel" | "create" | "join", code?: string) => void;
}

export function HomeScreen({ initialCode, onStart }: HomeScreenProps): React.ReactElement {
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const avatar = useGameStore((s) => s.avatar);
  const setAvatar = useGameStore((s) => s.setAvatar);
  const [code, setCode] = useState(initialCode ?? "");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-6 px-5 py-10">
      <h1 className="font-display text-center text-5xl text-[var(--lime)] sm:text-6xl">KLÄFF</h1>
      <p className="text-center text-sm text-[var(--muted)]">
        Bell-Wettkampf im Browser. Drei Sekunden, dein bester Bell, ein Sieger.
      </p>

      <Card className="w-full" shadowColor="var(--violet)">
        <div className="flex items-center gap-4">
          <Avatar seed={avatar} size={72} />
          <div className="flex-1">
            <label htmlFor="nickname" className="block text-xs font-semibold uppercase tracking-wide">
              Dein Name
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              placeholder="Wuffi99"
              className="mt-1 w-full min-h-[44px] rounded-lg border-2 border-[var(--ink)] bg-white px-3 py-2 text-[var(--ink)]"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => setAvatar(randomAvatarSeed())}
        >
          🎲 Neuer Look
        </Button>
      </Card>

      <div className="flex w-full flex-col gap-3">
        <Button type="button" variant="lime" className="w-full text-lg" onClick={() => onStart("carousel")}>
          🎠 Kläffkarussell
        </Button>
        <Button type="button" variant="violet" className="w-full" onClick={() => onStart("create")}>
          🔒 Private Lobby erstellen
        </Button>
      </div>

      <Card className="w-full" shadowColor="var(--pink)">
        <label htmlFor="join-code" className="block text-xs font-semibold uppercase tracking-wide">
          Mit Code beitreten
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ABCDEF"
            className="min-h-[44px] flex-1 rounded-lg border-2 border-[var(--ink)] bg-white px-3 py-2 font-display text-xl tracking-widest text-[var(--ink)]"
          />
          <Button type="button" variant="pink" disabled={code.length !== 6} onClick={() => onStart("join", code)}>
            Los
          </Button>
        </div>
      </Card>

      <p className="text-center text-xs text-[var(--muted)]">
        Im Kläffkarussell hört niemand deine echte Stimme - nur ein computergenerierter
        Bell-Sound. In privaten Lobbys läuft standardmäßig echter Ton, abschaltbar vom Host.
        Kein Freitext-Chat - nur ein Emote-Rad.
      </p>
      <LegalFooter />
      <CookieNotice />
    </main>
  );
}
