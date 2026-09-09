"use client";

import { useEffect, useRef, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen";
import { MicPermissionScreen } from "./screens/MicPermissionScreen";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { CarouselQueueScreen } from "./screens/CarouselQueueScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MatchScreen } from "./screens/MatchScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { useGameStore } from "../lib/store/game-store";
import { getKlaeffClient } from "../lib/ws-client";
import { getAudioSession } from "../lib/audio/session";
import { WakeLockController } from "../lib/wake-lock";
import type { ClientMessage } from "@klaeff/protocol";

type LocalStep = "home" | "mic" | "calibration";

const wakeLock = new WakeLockController();

export function GameApp({ initialCode }: { readonly initialCode?: string }): React.ReactElement {
  const [localStep, setLocalStep] = useState<LocalStep>("home");
  const [agcActive, setAgcActive] = useState(false);
  const pendingActionRef = useRef<ClientMessage | null>(null);
  const screen = useGameStore((s) => s.screen);
  const status = useGameStore((s) => s.status);
  const connect = useGameStore((s) => s.connect);
  const goHome = useGameStore((s) => s.goHome);
  const hydrate = useGameStore((s) => s.hydrate);

  // Nickname/Avatar/Device-UUID kommen aus localStorage - erst nach dem Mount
  // laden, sonst weicht die erste Client-Render von der Server-HTML ab.
  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen === "match") {
      void wakeLock.acquire();
    } else {
      void wakeLock.release();
    }
  }, [screen]);

  function proceed(action: ClientMessage): void {
    if (status === "connected") {
      getKlaeffClient().send(action);
      return;
    }
    pendingActionRef.current = action;
    connect();
    const unsubscribe = getKlaeffClient().onStatusChange((newStatus) => {
      if (newStatus === "connected" && pendingActionRef.current) {
        getKlaeffClient().send(pendingActionRef.current);
        pendingActionRef.current = null;
        unsubscribe();
      }
    });
  }

  function startFlow(mode: "carousel" | "create" | "join", code?: string): void {
    const action: ClientMessage =
      mode === "carousel"
        ? { type: "CAROUSEL_JOIN" }
        : mode === "create"
          ? { type: "LOBBY_CREATE" }
          : { type: "LOBBY_JOIN", code: (code ?? "").toUpperCase() };

    // Schon in dieser Sitzung kalibriert? Dann nicht nochmal durch Mikro-
    // Freigabe + Kalibrierung schicken (z.B. bei "Nochmal!" nach einem Match).
    const session = getAudioSession();
    if (session.isActive() && session.getCalibration()) {
      proceed(action);
      return;
    }

    pendingActionRef.current = action;
    setLocalStep("mic");
  }

  function afterCalibration(): void {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      proceed(action);
    }
    setLocalStep("home");
  }

  if (screen === "queue") {
    return (
      <CarouselQueueScreen
        onLeave={() => {
          getKlaeffClient().send({ type: "CAROUSEL_LEAVE" });
          goHome();
        }}
      />
    );
  }
  if (screen === "lobby") return <LobbyScreen onLeave={goHome} />;
  if (screen === "match") return <MatchScreen />;
  if (screen === "result") {
    return (
      <ResultScreen
        onPlayAgain={() => proceed({ type: "CAROUSEL_JOIN" })}
        onLeave={() => {
          getKlaeffClient().send({ type: "CAROUSEL_LEAVE" });
          goHome();
        }}
      />
    );
  }

  if (localStep === "mic") {
    return (
      <MicPermissionScreen
        onGranted={(agc) => {
          setAgcActive(agc);
          setLocalStep("calibration");
        }}
        onCancel={() => setLocalStep("home")}
      />
    );
  }

  if (localStep === "calibration") {
    return (
      <CalibrationScreen agcActive={agcActive} onDone={afterCalibration} onCancel={() => setLocalStep("home")} />
    );
  }

  return <HomeScreen initialCode={initialCode} onStart={startFlow} />;
}
