import { describe, expect, it } from "vitest";
import { generateLobbyCode, isValidLobbyCode } from "../src/lobby-code.js";

describe("lobby-code", () => {
  it("erzeugt 6-stellige Codes ohne I, O, 0, 1", () => {
    let seedValue = 1;
    const rand = (): number => {
      seedValue = (seedValue * 9301 + 49297) % 233280;
      return seedValue / 233280;
    };
    for (let i = 0; i < 200; i += 1) {
      const code = generateLobbyCode(rand);
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[IO01]/);
      expect(isValidLobbyCode(code)).toBe(true);
    }
  });

  it("isValidLobbyCode lehnt falsche Laenge und verbotene Zeichen ab", () => {
    expect(isValidLobbyCode("ABC")).toBe(false);
    expect(isValidLobbyCode("ABCDEI")).toBe(false);
    expect(isValidLobbyCode("ABCDEF")).toBe(true);
  });
});
