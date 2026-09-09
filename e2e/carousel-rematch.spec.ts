import { test, expect } from "@playwright/test";
import { joinCarousel } from "./helpers";

test.describe("Kläffkarussell", () => {
  test("zwei Spieler werden sofort gepaart, spielen eine Begegnung und werden per Re-Pairing erneut gematcht", async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const a = await contextA.newPage();
    const b = await contextB.newPage();

    await joinCarousel(a);
    await joinCarousel(b);

    // Sofort gepaart, kein Countdown - der Match-Start folgt der Paarung so
    // unmittelbar, dass der Lobby-Screen oft nur einen Frame lang sichtbar
    // ist (nicht zuverlaessig testbar) - stattdessen direkt auf die erste
    // Runde warten, das belegt Pairing + Matchstart gemeinsam.
    await expect(a.getByText(/Runde 1/u)).toBeVisible({ timeout: 15000 });
    await expect(b.getByText(/Runde 1/u)).toBeVisible({ timeout: 15000 });

    // Hinweistext: nie die echte Stimme, siehe Auftrag.
    await expect(a.getByText(/niemand hört deine echte Stimme/u)).toBeVisible({ timeout: 10000 });

    // Begegnung = 2 Runden (jeder bellt einmal). Rundenreihenfolge =
    // Warteschlangen-Reihenfolge (siehe packages/protocol/src/carousel.ts):
    // A hat sich zuerst eingereiht, ist also zuerst dran. Explizit statt per
    // isVisible()-Race erkannt - siehe BLOCKERS.md fuer die Lehre daraus.
    for (const barkerPage of [a, b]) {
      const bellButton = barkerPage.getByRole("button", { name: /BELL!/u });
      await bellButton.waitFor({ state: "visible", timeout: 15000 });
      await bellButton.click();
      await a.waitForTimeout(3500);
    }

    await expect(a.getByText("Ergebnis")).toBeVisible({ timeout: 10000 });
    await expect(b.getByText("Ergebnis")).toBeVisible({ timeout: 10000 });

    // Re-Pairing: beide suchen sich einen "Nächsten Gegner" - da nur diese
    // zwei im Karussell warten, werden sie erneut miteinander gepaart. Das
    // prueft den kompletten Re-Pairing-Zyklus (Ergebnis -> erneuter
    // CAROUSEL_JOIN -> neue Begegnung); dass ein DRITTER, anderer Gegner bei
    // groesseren Warteschlangen bevorzugt wird, ist bereits durch die
    // Server-Integrationstests (game-server.test.ts) und die reinen
    // Warteschlangen-Tests (packages/protocol/test/carousel.test.ts) belegt.
    await a.getByRole("button", { name: "Nächster Gegner" }).click();
    await b.getByRole("button", { name: "Nächster Gegner" }).click();

    await expect(a.getByText(/Runde 1/u)).toBeVisible({ timeout: 15000 });
    await expect(b.getByText(/Runde 1/u)).toBeVisible({ timeout: 15000 });

    await a.screenshot({ path: "artifacts/e2e/carousel-rematch.png" });

    await contextA.close();
    await contextB.close();
  });
});
