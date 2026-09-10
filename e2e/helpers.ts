import type { Page } from "@playwright/test";
import { GATE_COOKIE_NAME, GATE_COOKIE_VALUE } from "../lib/gate";

/**
 * Setzt das Passwort-Gate-Cookie direkt (statt sich durch den "Bald
 * verfuegbar"-Screen zu klicken) - hier geht es um die Spiel-Flows, das
 * Gate selbst hat einen eigenen Test (gate.spec.ts).
 */
export async function unlockGate(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: GATE_COOKIE_NAME,
      value: GATE_COOKIE_VALUE,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}

/**
 * Klickt sich durch Mikro-Freigabe und Kalibrierung (3 echte 3s-Schritte,
 * ausgewertet aus der Fake-Audio-Datei die Chromium ueber
 * --use-file-for-fake-audio-capture einspeist). Muss aufgerufen werden,
 * NACHDEM auf der Startseite Kläffkarussell/Lobby-erstellen/Lobby-beitreten
 * geklickt wurde.
 */
export async function completeMicAndCalibration(page: Page): Promise<void> {
  await page.getByRole("button", { name: "🎙️ Mikro freigeben" }).click();
  await page.getByRole("button", { name: "Ja, gehört" }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: "Ja, gehört" }).click();
  // Kalibrierung: 3 Schritte a 3s = 9s, plus etwas Puffer fuer die Auswertung.
  await page.getByRole("button", { name: "Weiter" }).waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: "Weiter" }).click();
}

export async function joinCarousel(page: Page): Promise<void> {
  await unlockGate(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Kläffkarussell" }).click();
  await completeMicAndCalibration(page);
}

export async function createPrivateLobby(page: Page): Promise<string> {
  await unlockGate(page);
  await page.goto("/");
  await page.getByText("Private Lobby erstellen").click();
  await completeMicAndCalibration(page);
  const codeLocator = page.locator("p.font-display.text-4xl");
  await codeLocator.waitFor({ state: "visible", timeout: 10000 });
  const code = (await codeLocator.textContent())?.trim() ?? "";
  return code;
}

export async function joinPrivateLobby(page: Page, code: string): Promise<void> {
  await unlockGate(page);
  await page.goto(`/j/${code}`);
  await page.getByRole("button", { name: "Los" }).click();
  await completeMicAndCalibration(page);
}

/**
 * Wartet, bis das laufende Live-Match beendet ist (SIEG!/NIEDERLAGE
 * erscheint) - kein Knopf mehr zu klicken, alle Beteiligten (Menschen wie
 * Bots) bellen ab Matchstart automatisch durchgehend (Menschen ueber die per
 * --use-file-for-fake-audio-capture eingespeiste Fake-Audio-Datei, siehe
 * playwright.config.ts). Alle E2E-Kontexte teilen sich dieselbe Datei, ein
 * 1v1 zwischen zwei echten Browsern wird also praktisch immer erst ueber den
 * deterministischen Sudden-Death-Fallback (nie zufaellig, siehe
 * TUG_OF_WAR_SUDDEN_DEATH_MS) entschieden - daher der grosszuegige Timeout.
 */
export async function waitForMatchResult(pages: readonly Page[], timeoutMs = 40_000): Promise<void> {
  await Promise.all(
    pages.map((page) =>
      page
        .getByText(/SIEG!|NIEDERLAGE/u)
        .first()
        .waitFor({ state: "visible", timeout: timeoutMs }),
    ),
  );
}
