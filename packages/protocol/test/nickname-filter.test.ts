import { describe, expect, it } from "vitest";
import { generateFallbackNickname, isNicknameBlocked, sanitizeNickname } from "../src/nickname-filter.js";

describe("nickname-filter", () => {
  it("blockt bekannte Begriffe (deutsch und englisch)", () => {
    expect(isNicknameBlocked("Hurensohn")).toBe(true);
    expect(isNicknameBlocked("fuckboy")).toBe(true);
    expect(isNicknameBlocked("nazi123")).toBe(true);
  });

  it("erkennt Leetspeak-Umschreibungen (3->e, 1->i, 0->o, @->a, $->s)", () => {
    expect(isNicknameBlocked("h1tl3r")).toBe(true);
    expect(isNicknameBlocked("f@ggot")).toBe(true);
    expect(isNicknameBlocked("$chlampe")).toBe(true);
  });

  it("laesst harmlose Nicknames durch", () => {
    expect(isNicknameBlocked("Bello99")).toBe(false);
    expect(isNicknameBlocked("Kläffender Keks")).toBe(false);
    expect(isNicknameBlocked("Assassin")).toBe(false); // enthaelt "ass" aber ist kein Treffer in unserer Liste
  });

  it("sanitizeNickname ersetzt gesperrte Namen durch einen generierten Fallback", () => {
    const result = sanitizeNickname("Hurensohn", 42);
    expect(result.wasBlocked).toBe(true);
    expect(isNicknameBlocked(result.nickname)).toBe(false);
    expect(result.nickname.length).toBeGreaterThan(0);
  });

  it("sanitizeNickname laesst gueltige Namen unveraendert", () => {
    const result = sanitizeNickname("  Wuffi  ", 1);
    expect(result.wasBlocked).toBe(false);
    expect(result.nickname).toBe("Wuffi");
  });

  it("generateFallbackNickname ist deterministisch fuer denselben Seed", () => {
    expect(generateFallbackNickname(7)).toBe(generateFallbackNickname(7));
  });

  it("lehnt zu kurze und zu lange Namen ab (werden zu Fallback)", () => {
    expect(sanitizeNickname("a", 1).wasBlocked).toBe(true);
    expect(sanitizeNickname("a".repeat(30), 1).wasBlocked).toBe(true);
  });
});
