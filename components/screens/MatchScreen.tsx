"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { AudioFrame } from "@klaeff/scoring";
import { computeEnvelopeParams } from "@klaeff/bark-synth";
import { computeTugOfWarState, TUG_OF_WAR_THRESHOLD, type Match } from "@klaeff/protocol";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Card } from "../Card";
import { ScoreReveal } from "../ScoreReveal";
import { EmoteBubble } from "../EmoteBubble";
import { EmoteWheel } from "../EmoteWheel";
import { TugOfWarBar } from "../TugOfWarBar";
import { RudelProgress } from "../RudelProgress";
import { useGameStore } from "../../lib/store/game-store";
import { getAudioSession } from "../../lib/audio/session";
import { getBarkSynthVoice } from "../../lib/audio/bark-synth-voice";
import { base64ToBlob, isAudioRecordingSupported } from "../../lib/audio/recorder";
import { getKlaeffClient } from "../../lib/ws-client";
import { sfxRoundResult, sfxRoundStart } from "../../lib/audio/sfx";
import { HAPTIC_ROUND_RESULT, HAPTIC_ROUND_START, vibrate } from "../../lib/haptics";

const MAX_SHAKE_PX = 8;

export function MatchScreen(): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const playerId = useGameStore((s) => s.playerId);
  const currentRound = useGameStore((s) => s.currentRound);
  const lastRoundResult = useGameStore((s) => s.lastRoundResult);
  const totalRounds = useGameStore((s) => s.totalRounds);
  const matchStyle = useGameStore((s) => s.matchStyle);
  const matchPlayerOrder = useGameStore((s) => s.matchPlayerOrder);
  const matchRoundResults = useGameStore((s) => s.matchRoundResults);
  const levels = useGameStore((s) => s.levels);
  const [barking, setBarking] = useState(false);
  const reducedMotion = useReducedMotion();
  const announcedRoundRef = useRef<number | null>(null);
  const announcedResultRoundRef = useRef<number | null>(null);
  const synthFramesRef = useRef<AudioFrame[]>([]);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);

  const players = lobby?.players ?? [];
  const barkerId = currentRound?.barkerPlayerId ?? null;
  const barker = players.find((p) => p.id === barkerId) ?? null;
  const audience = players.filter((p) => p.id !== barkerId);
  const isMyTurn = barkerId === playerId;
  const barkerLevel = barker ? (levels[barker.id] ?? 0) : 0;
  const isSynthMode = lobby?.audioMode === "synth";
  const isCarousel = lobby?.mode === "carousel";

  // Tauzieh (Kläffkarussell/Duell/Kläffduell-Matchup): dieselbe geteilte
  // Funktion wie serverseitig, live aus den bisher empfangenen ROUND_RESULTs
  // berechnet - keine eigene Client-Logik, keine Abweichung vom autoritativen
  // Server-Ergebnis.
  const tugOfWarState = useMemo(() => {
    if (matchStyle !== "tugofwar" || matchPlayerOrder.length < 2) return null;
    const fakeMatch: Match = {
      id: "client-preview",
      lobbyId: "",
      playerOrder: matchPlayerOrder,
      currentRoundIndex: 0,
      results: matchRoundResults,
      phase: "in-progress",
      startedAt: 0,
      finishedAt: null,
    };
    return computeTugOfWarState(fakeMatch);
  }, [matchStyle, matchPlayerOrder, matchRoundResults]);

  const myTugFraction =
    tugOfWarState && playerId
      ? (playerId === tugOfWarState.playerA ? tugOfWarState.ropePosition : -tugOfWarState.ropePosition) /
        TUG_OF_WAR_THRESHOLD
      : 0;
  const tugOpponent = tugOfWarState
    ? players.find((p) => p.id === (playerId === tugOfWarState.playerA ? tugOfWarState.playerB : tugOfWarState.playerA))
    : null;
  const me = players.find((p) => p.id === playerId) ?? null;

  const rudelEntries = useMemo(() => {
    if (matchStyle !== "sequence" || players.length < 3) return null;
    const totals = new Map<string, number>();
    for (const result of matchRoundResults) {
      totals.set(result.playerId, (totals.get(result.playerId) ?? 0) + result.score.total);
    }
    return players.map((p) => ({ playerId: p.id, nickname: p.nickname, avatar: p.avatar, total: totals.get(p.id) ?? 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchStyle, matchRoundResults, lobby?.players]);

  useEffect(() => {
    setBarking(false);
    synthFramesRef.current = [];
    if (currentRound && announcedRoundRef.current !== currentRound.roundIndex) {
      announcedRoundRef.current = currentRound.roundIndex;
      sfxRoundStart();
      if (isMyTurn) vibrate(HAPTIC_ROUND_START);
    }
    if (!isMyTurn) {
      getBarkSynthVoice().silence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.roundIndex]);

  useEffect(() => {
    if (lastRoundResult && announcedResultRoundRef.current !== lastRoundResult.roundIndex) {
      announcedResultRoundRef.current = lastRoundResult.roundIndex;
      sfxRoundResult();
      vibrate(HAPTIC_ROUND_RESULT);
      getBarkSynthVoice().silence();
    }
  }, [lastRoundResult]);

  // Bark-Synth: rendert die live gestreamten Feature-Frames des Gegners -
  // niemals die eigenen. Nur relevant, wenn diese Lobby ueberhaupt im
  // Synth-Modus laeuft (Kläffkarussell, oder private Lobby ohne "Echter Ton").
  useEffect(() => {
    if (!isSynthMode) {
      return;
    }
    const voice = getBarkSynthVoice();
    voice.start();
    const unsubscribe = getKlaeffClient().on("BARK_FRAME_BROADCAST", (msg) => {
      if (msg.playerId === playerId) {
        return; // niemals die eigene Stimme abspielen
      }
      synthFramesRef.current = [...synthFramesRef.current, msg.frame].slice(-200);
      const envelope = computeEnvelopeParams(synthFramesRef.current);
      voice.updateFrame(msg.frame, envelope.attackSharpness);
    });
    return () => {
      unsubscribe();
      voice.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynthMode]);

  // Echter Ton: empfangene Aufnahme des Gegners abspielen.
  useEffect(() => {
    if (isSynthMode) {
      return;
    }
    const unsubscribe = getKlaeffClient().on("AUDIO_BLOB_BROADCAST", (msg) => {
      if (msg.playerId === playerId) {
        return;
      }
      const blob = base64ToBlob(msg.dataBase64, msg.mimeType);
      const url = URL.createObjectURL(blob);
      audioPlaybackRef.current?.pause();
      const audio = new Audio(url);
      audioPlaybackRef.current = audio;
      void audio.play().catch(() => {
        // Autoplay kann blockiert sein - kein kritischer Pfad, das Scoring
        // laeuft unabhaengig davon ueber die Feature-Frames.
      });
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynthMode]);

  async function handleBark(): Promise<void> {
    if (!currentRound || !lobby) return;
    setBarking(true);
    try {
      const recordAudio = lobby.mode === "private" && lobby.audioMode === "real";
      await getAudioSession().captureBarkWindow(currentRound.windowMs, currentRound.roundIndex, recordAudio);
    } finally {
      setBarking(false);
    }
  }

  const audienceLevel =
    audience.length > 0
      ? Math.round(audience.reduce((sum, p) => sum + (levels[p.id] ?? 0), 0) / audience.length)
      : 0;

  const shakeAmplitude = reducedMotion ? 0 : Math.min(MAX_SHAKE_PX, (barkerLevel / 100) * MAX_SHAKE_PX);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 px-5 py-8">
      {tugOfWarState ? (
        me &&
        tugOpponent && (
          <TugOfWarBar
            fraction={myTugFraction}
            meNickname={me.nickname}
            meAvatar={me.avatar}
            opponentNickname={tugOpponent.nickname}
            opponentAvatar={tugOpponent.avatar}
          />
        )
      ) : (
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Runde {(currentRound?.roundIndex ?? 0) + 1} / {totalRounds ?? players.length}
        </p>
      )}
      {rudelEntries && <RudelProgress entries={rudelEntries} myPlayerId={playerId} />}

      {isCarousel && (
        <p className="rounded-full border-2 border-[var(--ink)] bg-[var(--violet)]/15 px-3 py-1 text-center text-[10px]">
          🎙️→🐕 Kläffkarussell: niemand hört deine echte Stimme, nur den Bell-Sound
        </p>
      )}
      {!isCarousel && lobby?.audioMode === "real" && (
        <p className="rounded-full border-2 border-[var(--ink)] bg-[var(--bark)]/15 px-3 py-1 text-center text-[10px]">
          🔊 Echter Ton: alle hier hören deine echte Aufnahme
        </p>
      )}

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
        {barker && (
          <motion.div
            key={barker.id}
            className="relative flex flex-col items-center gap-2"
            animate={
              isMyTurn && barking && shakeAmplitude > 0.2
                ? {
                    x: [0, -shakeAmplitude, shakeAmplitude, -shakeAmplitude * 0.6, 0],
                    transition: { duration: 0.25, repeat: Infinity },
                  }
                : { x: 0 }
            }
          >
            <EmoteBubble playerId={barker.id} />
            <Avatar seed={barker.avatar} size={200} mouthOpen={barkerLevel / 100} />
            <p className="font-display text-2xl">{barker.nickname}</p>
            {isMyTurn && <span className="text-xs text-[var(--lime)]">Du bist dran!</span>}
          </motion.div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {audience.map((p) => (
            <div key={p.id} className="relative flex flex-col items-center gap-1 opacity-90">
              <EmoteBubble playerId={p.id} />
              <Avatar seed={p.avatar} size={56} mouthOpen={(levels[p.id] ?? 0) / 100} />
              <p className="max-w-[4rem] truncate text-[10px]">{p.nickname}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Publikumsmeter - reine Show, kein Einfluss auf die Wertung. */}
      <div className="w-full">
        <p className="text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">Publikum</p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white">
          <motion.div
            className="h-full bg-[var(--violet)]"
            animate={{ width: `${audienceLevel}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </div>
      </div>

      {isMyTurn && currentRound && (
        <>
          {!isCarousel && lobby?.audioMode === "real" && !isAudioRecordingSupported() && (
            <p className="text-center text-[10px] text-[var(--muted)]">
              Dein Browser kann keine Sprachaufnahme - andere hören dich nicht, dein Score zählt trotzdem.
            </p>
          )}
          <Button type="button" variant="lime" className="w-full text-xl" disabled={barking} onClick={handleBark}>
            {barking ? "🐕 Bell läuft..." : "🐕 BELL!"}
          </Button>
        </>
      )}

      <AnimatePresence>
        {lastRoundResult && lastRoundResult.roundIndex === currentRound?.roundIndex && (
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card shadowColor="var(--lime)">
              <ScoreReveal
                score={lastRoundResult.score}
                nickname={players.find((p) => p.id === lastRoundResult.playerId)?.nickname ?? ""}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-5">
        <EmoteWheel />
      </div>
    </main>
  );
}
