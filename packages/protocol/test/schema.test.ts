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
        type: "ROUND_RESULT",
        roundIndex: 0,
        playerId: "p1",
        score: {
          total: 80,
          breakdown: { loudness: 40, attack: 20, crest: 10, character: 10 },
          flags: [],
          peakDbfs: -3,
          peakTimeMs: 120,
          activeDurationMs: 500,
        },
      }),
    ).not.toThrow();
  });
});
