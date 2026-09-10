import type { LiveMatchState, LiveMatchStyle, LobbyId, MatchId, PlayerId, Standing } from "./types.js";

/** Wie beim bisherigen (diskreten) Tauzieh: Seil reicht von -100 bis +100, siehe Auftrag. */
export const TUG_OF_WAR_LIVE_THRESHOLD = 100;
/**
 * Deterministischer Sudden-Death-Fallback fuer ein Tauzieh-Match (2 Spieler):
 * steht das Seil nach dieser Zeit noch nicht bei ±100, entscheidet, wer
 * gerade vorne liegt - nie zufaellig. Verhindert Endlos-Matches zwischen
 * sehr gleichwertigen Spielern.
 */
export const TUG_OF_WAR_SUDDEN_DEATH_MS = 25_000;
/** Rudel (3+ Spieler gleichzeitig) hat kein Schwellenwert-Konzept - fest laufende Matchdauer, danach Rangliste nach cumulativeScore. */
export const RUDEL_LIVE_DURATION_MS = 18_000;

function nextId(prefix: string, rand: () => number): string {
  return `${prefix}_${Math.floor(rand() * 1e12).toString(36)}`;
}

export function createLiveMatch(
  lobbyId: LobbyId,
  participantIds: readonly PlayerId[],
  style: LiveMatchStyle,
  now: number,
  rand: () => number = Math.random,
): LiveMatchState {
  const cumulativeScores: Record<PlayerId, number> = {};
  for (const id of participantIds) {
    cumulativeScores[id] = 0;
  }
  return {
    id: nextId("match", rand) as MatchId,
    lobbyId,
    participantIds,
    style,
    cumulativeScores,
    phase: "in-progress",
    startedAt: now,
    finishedAt: null,
  };
}

/**
 * Addiert das Ergebnis eines Ticks (Intensitaet 0..100 je Spieler, siehe
 * computeLiveIntensity in @klaeff/scoring) zur laufenden Gesamtpunktzahl.
 * "Laenger durchhalten" ergibt sich allein daraus, dass hier ueber die Zeit
 * aufsummiert wird - keine eigene Dauer-Logik noetig.
 */
export function applyLiveTick(state: LiveMatchState, intensityByPlayer: Readonly<Record<PlayerId, number>>): LiveMatchState {
  const cumulativeScores: Record<PlayerId, number> = { ...state.cumulativeScores };
  for (const playerId of state.participantIds) {
    const intensity = intensityByPlayer[playerId] ?? 0;
    cumulativeScores[playerId] = (cumulativeScores[playerId] ?? 0) + intensity;
  }
  return { ...state, cumulativeScores };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Optionale Uebersteuerung der Zeit-/Schwellenwerte unten - nur fuer Tests
 * gedacht (schnellere Matches ohne echte Wartezeit), im Produktivbetrieb
 * bleiben immer die Standardwerte aktiv. Siehe GameServerOptions.
 */
export interface LiveMatchTuning {
  readonly tugOfWarThreshold?: number;
  readonly suddenDeathMs?: number;
  readonly rudelDurationMs?: number;
}

/** Nur fuer style "tugofwar" sinnvoll - Differenz der cumulativeScores der zwei Teilnehmer, auf ±threshold geklemmt. */
export function ropePositionOf(state: LiveMatchState, threshold: number = TUG_OF_WAR_LIVE_THRESHOLD): number | null {
  if (state.style !== "tugofwar") {
    return null;
  }
  const [a, b] = state.participantIds;
  if (!a || !b) {
    return 0;
  }
  const raw = (state.cumulativeScores[a] ?? 0) - (state.cumulativeScores[b] ?? 0);
  return clamp(raw, -threshold, threshold);
}

/**
 * Prueft, ob ein laufendes Live-Match beendet ist. Tauzieh: Seil hat die
 * Schwelle erreicht, ODER der Sudden-Death-Zeitpunkt ist erreicht UND das
 * Seil ist nicht exakt 0 (dann entscheidet, wer gerade vorne liegt - nie
 * zufaellig). Rudel: die feste Matchdauer ist um.
 */
export function isLiveMatchFinished(state: LiveMatchState, now: number, tuning: LiveMatchTuning = {}): boolean {
  const threshold = tuning.tugOfWarThreshold ?? TUG_OF_WAR_LIVE_THRESHOLD;
  const suddenDeathMs = tuning.suddenDeathMs ?? TUG_OF_WAR_SUDDEN_DEATH_MS;
  const rudelDurationMs = tuning.rudelDurationMs ?? RUDEL_LIVE_DURATION_MS;
  const elapsedMs = now - state.startedAt;
  if (state.style === "rudel") {
    return elapsedMs >= rudelDurationMs;
  }
  const rope = ropePositionOf(state, threshold) ?? 0;
  if (Math.abs(rope) >= threshold) {
    return true;
  }
  return elapsedMs >= suddenDeathMs && rope !== 0;
}

/**
 * Rangliste nach cumulativeScore absteigend - gilt fuer beide Stile
 * gleichermassen (bei "tugofwar" ist das aequivalent dazu, wer das Seil zu
 * sich gezogen hat). Bei einem exakten Gleichstand am Sudden-Death-Zeitpunkt
 * (astronomisch unwahrscheinlich bei echtem Mikrofon-Rauschen, aber nicht
 * unmoeglich wenn beide durchgehend still sind) entscheidet deterministisch
 * die Beitrittsreihenfolge (participantIds[0] zuerst) - nie der Zufall.
 */
export function computeLiveStandings(state: LiveMatchState): Standing[] {
  const ranked = [...state.participantIds].sort((a, b) => {
    const diff = (state.cumulativeScores[b] ?? 0) - (state.cumulativeScores[a] ?? 0);
    if (diff !== 0) return diff;
    return state.participantIds.indexOf(a) - state.participantIds.indexOf(b);
  });
  return ranked.map((playerId, index) => ({
    playerId,
    rank: index + 1,
    cumulativeScore: state.cumulativeScores[playerId] ?? 0,
  }));
}
