import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "../src/schema.js";

describe("schema", () => {
  it("akzeptiert gueltige Client-Nachrichten", () => {
    expect(() => parseClientMessage({ type: "CAROUSEL_JOIN" })).not.toThrow();
    expect(() => parseClientMessage({ type: "EMOTE", emote: "WAU" })).not.toThrow();
    expect(() => parseClientMessage({ type: "LEVEL_UPDATE", level: 42 })).not.toThrow();
  });

  it("lehnt unbekannte Nachrichtentypen ab", () => {
    expect(() => parseClientMessage({ type: "HACK_THE_SERVER" })).toThrow();
  });

  it("lehnt ungueltige Level-Werte ab (ausserhalb 0..100)", () => {
    expect(() => parseClientMessage({ type: "LEVEL_UPDATE", level: 150 })).toThrow();
    expect(() => parseClientMessage({ type: "LEVEL_UPDATE", level: -5 })).toThrow();
  });

  it("lehnt ungueltige Emotes ab", () => {
    expect(() => parseClientMessage({ type: "EMOTE", emote: "FREITEXT_CHAT" })).toThrow();
  });

  it("lehnt zu lange Lobby-Codes ab", () => {
    expect(() => parseClientMessage({ type: "LOBBY_JOIN", code: "TOOLONG" })).toThrow();
  });

  it("akzeptiert gueltige Server-Nachrichten", () => {
    expect(() =>
      parseServerMessage({
        type: "LIVE_MATCH_UPDATE",
        scores: [
          { playerId: "p1", cumulativeScore: 42.5 },
          { playerId: "p2", cumulativeScore: 30 },
        ],
        ropePosition: 12.5,
      }),
    ).not.toThrow();
  });

  it("akzeptiert MATCH_RESULT mit vereinfachten Standings (nur noch cumulativeScore)", () => {
    expect(() =>
      parseServerMessage({
        type: "MATCH_RESULT",
        standings: [
          { playerId: "p1", rank: 1, cumulativeScore: 120 },
          { playerId: "p2", rank: 2, cumulativeScore: 80 },
        ],
      }),
    ).not.toThrow();
  });
});
