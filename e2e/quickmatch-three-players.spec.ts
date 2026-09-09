import { test, expect } from "@playwright/test";
import { joinPublicQueue } from "./helpers";

test.describe("Schnellsuche mit drei Spielern", () => {
  test("drei Spieler ueber die Schnellsuche landen in derselben Lobby und das Match startet automatisch", async ({
    browser,
  }, testInfo) => {
    // 3x sequentielle Kalibrierung (~10s je Spieler) + 20s-Countdown liegen
    // schon allein bei ~50s - der globale 60s-Timeout reicht dafuer nicht.
    testInfo.setTimeout(150_000);
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map((c) => c.newPage()));

    // Alle drei nacheinander in die Schnellsuche schicken (Kalibrierung
    // braucht echte Zeit, daher sequentiell statt parallel gestartet -
    // die Warteschlange selbst laeuft serverseitig weiter).
    for (const page of pages) {
      await joinPublicQueue(page);
    }

    // Alle drei sehen dieselbe Lobby (mindestens 3 Spieler-Karten).
    for (const page of pages) {
      await expect(page.getByText(/3\/6 Spieler|4\/6 Spieler|5\/6 Spieler|6\/6 Spieler/u)).toBeVisible({
        timeout: 10000,
      });
    }

    // Der 20s-Countdown startet automatisch ab 3 Spielern und fuehrt zum Matchstart.
    await expect(pages[0]!.getByText(/Runde 1/u)).toBeVisible({ timeout: 30000 });
    for (const page of pages) {
      await expect(page.getByText(/Runde 1/u)).toBeVisible({ timeout: 5000 });
    }

    await pages[0]!.screenshot({ path: "artifacts/e2e/quickmatch-three-players.png" });

    for (const ctx of contexts) {
      await ctx.close();
    }
  });
});
