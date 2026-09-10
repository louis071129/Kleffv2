"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AudioFrame } from "@klaeff/scoring";
import { computeEnvelopeParams } from "@klaeff/bark-synth";
import { TUG_OF_WAR_LIVE_THRESHOLD } from "@klaeff/protocol";
import { Avatar } from "../Avatar";
import { BotBadge } from "../BotBadge";
import { EmoteBubble } from "../EmoteBubble";
import { EmoteWheel } from "../EmoteWheel";
import { TugOfWarBar } from "../TugOfWarBar";
import { RudelProgress } from "../RudelProgress";
import { useGameStore } from "../../lib/store/game-store";
import { getAudioSession } from "../../lib/audio/session";
import { getBarkSynthVoice } from "../../lib/audio/bark-synth-voice";
import { base64ToBytes, isAudioRecordingSupported, LiveAudioPlayer } from "../../lib/audio/recorder";
import { getKlaeffClient } from "../../lib/ws-client";
import { DEFAULT_AVATAR } from "../../lib/storage";

const MAX_SHAKE_PX = 8;

/**
 * Kein Knopf, kein Abwechseln: alle bellen ab Matchstart gleichzeitig und
 * durchgehend, die Tauzieh-Skala/Rudel-Rangliste bewegt sich live mit -
 * siehe live-match.ts (Server) und die LIVE_MATCH_UPDATE-Verdrahtung im
 * Store. startLiveBarking/stopLiveBarking (lib/audio/session.ts) laufen
 * automatisch fuer die gesamte Match-Lebensdauer dieser Komponente.
 */
export function MatchScreen(): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const playerId = useGameStore((s) => s.playerId);
  const liveMatch = useGameStore((s) => s.liveMatch);
  const levels = useGameStore((s) => s.levels);
  const reducedMotion = useReducedMotion();
  const synthFramesRef = useRef<AudioFrame[]>([]);
  const audioPlayersRef = useRef<Map<string, LiveAudioPlayer>>(new Map());

  const players = lobby?.players ?? [];
  const isSynthMode = lobby?.audioMode === "synth";
  const isCarousel = lobby?.mode === "carousel";
  const isTugOfWar = liveMatch?.style === "tugofwar";
  const isRudel = liveMatch?.style === "rudel";

  const me = players.find((p) => p.id === playerId) ?? null;
  const [aId, bId] = liveMatch?.participantIds ?? [];
  const opponentId = playerId === aId ? bId : aId;
  const opponent = opponentId ? (players.find((p) => p.id === opponentId) ?? null) : null;

  const myTugFraction = useMemo(() => {
    if (!isTugOfWar || !liveMatch || liveMatch.ropePosition === null || !playerId) {
      return 0;
    }
    const sign = playerId === aId ? 1 : -1;
    return (sign * liveMatch.ropePosition) / TUG_OF_WAR_LIVE_THRESHOLD;
  }, [isTugOfWar, liveMatch, playerId, aId]);

  const rudelEntries = useMemo(() => {
    if (!isRudel || !liveMatch) {
      return null;
    }
    return liveMatch.participantIds.map((id) => {
      const player = players.find((p) => p.id === id);
      return {
        playerId: id,
        nickname: player?.nickname ?? "?",
        avatar: player?.avatar ?? DEFAULT_AVATAR,
        total: liveMatch.scores[id] ?? 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRudel, liveMatch]);

  // Startet/stoppt das durchgehende Bellen fuer genau die Lebensdauer dieser
  // Komponente (= genau die Matchdauer, siehe GameApp: MatchScreen wird nur
  // waehrend screen==="match" gerendert).
  useEffect(() => {
    const recordAudio = lobby?.mode === "private" && lobby.audioMode === "real";
    getAudioSession().startLiveBarking(recordAudio);
    return () => {
      getAudioSession().stopLiveBarking();
      getBarkSynthVoice().silence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Echter Ton: durchgehende Chunk-Stroeme der anderen Teilnehmer luecken-
  // los abspielen (je Spieler ein eigener LiveAudioPlayer - bei Rudel koennen
  // mehrere gleichzeitig senden, siehe Auftrag "wirklich ueberall").
  useEffect(() => {
    if (isSynthMode) {
      return;
    }
    const audioPlayers = audioPlayersRef.current;
    const unsubscribe = getKlaeffClient().on("AUDIO_BLOB_BROADCAST", (msg) => {
      if (msg.playerId === playerId) {
        return;
      }
      let player = audioPlayers.get(msg.playerId);
      if (!player) {
        player = new LiveAudioPlayer();
        player.start(msg.mimeType);
        audioPlayers.set(msg.playerId, player);
      }
      player.pushChunk(base64ToBytes(msg.dataBase64));
    });
    return () => {
      unsubscribe();
      for (const player of audioPlayers.values()) {
        player.stop();
      }
      audioPlayers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynthMode]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 px-5 py-8">
      {isTugOfWar && me && opponent && (
        <TugOfWarBar
          fraction={myTugFraction}
          meNickname={me.nickname}
          meAvatar={me.avatar}
          opponentNickname={opponent.botDifficulty ? `🤖 ${opponent.nickname}` : opponent.nickname}
          opponentAvatar={opponent.avatar}
        />
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
      {!isCarousel && lobby?.audioMode === "real" && !isAudioRecordingSupported() && (
        <p className="text-center text-[10px] text-[var(--muted)]">
          Dein Browser kann keine Sprachaufnahme - andere hören dich nicht, dein Score zählt trotzdem.
        </p>
      )}

      <p className="text-center text-xs uppercase tracking-wide text-[var(--lime)]">
        🐕 Einfach drauf los bellen - lauter und länger durchhalten gewinnt!
      </p>

      <div className="flex w-full flex-1 flex-wrap items-center justify-center gap-6">
        {players.map((p) => {
          const isMe = p.id === playerId;
          const level = levels[p.id] ?? 0;
          const shakeAmplitude = reducedMotion ? 0 : Math.min(MAX_SHAKE_PX, (level / 100) * MAX_SHAKE_PX);
          return (
            <motion.div
              key={p.id}
              className="relative flex flex-col items-center gap-2"
              animate={
                shakeAmplitude > 0.2
                  ? {
                      x: [0, -shakeAmplitude, shakeAmplitude, -shakeAmplitude * 0.6, 0],
                      transition: { duration: 0.25, repeat: Infinity },
                    }
                  : { x: 0 }
              }
            >
              <EmoteBubble playerId={p.id} />
              <Avatar seed={p.avatar} size={isMe ? 160 : 110} mouthOpen={level / 100} />
              <p className="font-display text-lg">{p.nickname}</p>
              {p.botDifficulty && <BotBadge difficulty={p.botDifficulty} />}
            </motion.div>
          );
        })}
      </div>

      <div className="fixed bottom-6 right-5">
        <EmoteWheel />
      </div>
    </main>
  );
}
