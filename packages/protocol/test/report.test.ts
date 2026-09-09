import { describe, expect, it } from "vitest";
import { REPORT_RING_BUFFER_SIZE, addReport, createReportState, isDeviceExcludedFromPublicQueue } from "../src/report.js";

describe("report", () => {
  it("keine Sperre unter der Meldeschwelle", () => {
    let state = createReportState();
    state = addReport(state, { reporterId: "r1", targetDeviceUuid: "device-x", lobbyId: "lobbyA", at: 0 });
    state = addReport(state, { reporterId: "r2", targetDeviceUuid: "device-x", lobbyId: "lobbyB", at: 1 });
    expect(isDeviceExcludedFromPublicQueue(state, "device-x", 100)).toBe(false);
  });

  it("sperrt ab 3 Meldungen aus verschiedenen Lobbys innerhalb 24h", () => {
    let state = createReportState();
    state = addReport(state, { reporterId: "r1", targetDeviceUuid: "device-x", lobbyId: "lobbyA", at: 0 });
    state = addReport(state, { reporterId: "r2", targetDeviceUuid: "device-x", lobbyId: "lobbyB", at: 1 });
    state = addReport(state, { reporterId: "r3", targetDeviceUuid: "device-x", lobbyId: "lobbyC", at: 2 });
    expect(isDeviceExcludedFromPublicQueue(state, "device-x", 100)).toBe(true);
  });

  it("zaehlt mehrere Meldungen aus derselben Lobby nur einmal", () => {
    let state = createReportState();
    state = addReport(state, { reporterId: "r1", targetDeviceUuid: "device-x", lobbyId: "lobbyA", at: 0 });
    state = addReport(state, { reporterId: "r2", targetDeviceUuid: "device-x", lobbyId: "lobbyA", at: 1 });
    state = addReport(state, { reporterId: "r3", targetDeviceUuid: "device-x", lobbyId: "lobbyA", at: 2 });
    expect(isDeviceExcludedFromPublicQueue(state, "device-x", 100)).toBe(false);
  });

  it("Meldungen aelter als 24h zaehlen nicht mehr", () => {
    let state = createReportState();
    const dayMs = 24 * 60 * 60 * 1000;
    state = addReport(state, { reporterId: "r1", targetDeviceUuid: "device-x", lobbyId: "lobbyA", at: 0 });
    state = addReport(state, { reporterId: "r2", targetDeviceUuid: "device-x", lobbyId: "lobbyB", at: 1 });
    state = addReport(state, { reporterId: "r3", targetDeviceUuid: "device-x", lobbyId: "lobbyC", at: 2 });
    expect(isDeviceExcludedFromPublicQueue(state, "device-x", dayMs + 3)).toBe(false);
  });

  it("der Ringpuffer waechst nicht ueber die Maximalgroesse hinaus", () => {
    let state = createReportState();
    for (let i = 0; i < REPORT_RING_BUFFER_SIZE + 50; i += 1) {
      state = addReport(state, { reporterId: `r${i}`, targetDeviceUuid: "device-y", lobbyId: `lobby${i}`, at: i });
    }
    expect(state.entries.length).toBe(REPORT_RING_BUFFER_SIZE);
    expect(state.entries[0]?.reporterId).toBe("r50");
  });
});
