import type { DeviceUuid, LobbyId, PlayerId } from "./types.js";

export interface ReportEntry {
  readonly reporterId: PlayerId;
  readonly targetDeviceUuid: DeviceUuid;
  readonly lobbyId: LobbyId;
  readonly at: number;
}

export interface ReportState {
  readonly entries: readonly ReportEntry[];
}

export const REPORT_RING_BUFFER_SIZE = 500;
export const REPORT_EXCLUSION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REPORT_EXCLUSION_THRESHOLD_LOBBIES = 3;

export function createReportState(): ReportState {
  return { entries: [] };
}

export function addReport(state: ReportState, entry: ReportEntry): ReportState {
  const entries = [...state.entries, entry];
  const overflow = entries.length - REPORT_RING_BUFFER_SIZE;
  return { entries: overflow > 0 ? entries.slice(overflow) : entries };
}

/**
 * Ab 3 Meldungen aus verschiedenen Lobbys innerhalb von 24h wird die
 * Device-UUID aus der oeffentlichen Schnellsuche ausgeschlossen. Private
 * Lobbys bleiben erlaubt (siehe README.md - eine UUID im localStorage ist
 * trivial umgehbar, das ist eine Reibungsbremse, kein Bann).
 */
export function isDeviceExcludedFromPublicQueue(state: ReportState, deviceUuid: DeviceUuid, now: number): boolean {
  const windowStart = now - REPORT_EXCLUSION_WINDOW_MS;
  const distinctLobbies = new Set(
    state.entries
      .filter((e) => e.targetDeviceUuid === deviceUuid && e.at >= windowStart && e.at <= now)
      .map((e) => e.lobbyId),
  );
  return distinctLobbies.size >= REPORT_EXCLUSION_THRESHOLD_LOBBIES;
}
