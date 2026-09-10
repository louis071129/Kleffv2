import { test, expect } from "@playwright/test";
import { joinCarousel, playTugOfWarUntilResult } from "./helpers";

test.describe("Kläffkarussell", () => {
  test("zwei Spieler werden sofort gepaart, spielen ein Tauzieh-Match und werden per Re-Pairing erneut gematcht", async ({
    browser,
  }, testInfo) => {
    // Alle E2E-Kontexte teilen dieselbe Fake-Audio-Datei -> das Tauzieh-Match
    // wird ueber den Sudden-Death-Fallback entschieden (bis zu 15 Runden,
    // siehe playTugOfWarUntilResult), zweimal hintereinander (Erstbegegnung +
    // Re-Pairing) - grosszuegiger Timeout dafuer.
    testInfo.setTimeout(240_000);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const a = await contextA.newPage();
    const b = await contextB.newPage();

    // Parallel statt nacheinander beitreten: jeder Join braucht eine echte
    // Kalibrierung (~9s), sequenziell wuerde der zuerst fertige Spieler laenger
    // als botFallbackMs (Default 6s, siehe GameServerOptions) allein in der
    // Warteschlange stehen und faelschlich mit einem Bot statt dem anderen
    // Menschen gepaart werden - das hier ist ein Test fuer zwei echte
    // Menschen, siehe Auftrag ("bestehende Tests bleiben unveraendert gruen").
    await Promise.all([joinCarousel(a), joinCarousel(b)]);

    // Sofort gepaart, kein Countdown - der Match-Start folgt der Paarung so
    // unmittelbar, dass der Lobby-Screen oft nur einen Frame lang sichtbar
    // ist (nicht zuverlaessig testbar) - stattdessen direkt auf die
    // Tauzieh-Skala warten, das belegt Pairing + Matchstart gemeinsam.
    await expect(a.getByText(/\(Du\)/u)).toBeVisible({ timeout: 15000 });
    await expect(b.getByText(/\(Du\)/u)).toBeVisible({ timeout: 15000 });

    // Hinweistext: nie die echte Stimme, siehe Auftrag.
    await expect(a.getByText(/niemand hört deine echte Stimme/u)).toBeVisible({ timeout: 10000 });

    // Begegnung = Tauzieh-Match, dynamische Rundenzahl (Seil-Schwelle statt
    // fester Zyklenzahl, siehe packages/protocol/src/tug-of-war.ts) - nie
    // zufaellig entschieden.
    await playTugOfWarUntilResult([a, b]);

    await expect(a.getByText(/SIEG!|NIEDERLAGE/u)).toBeVisible({ timeout: 10000 });
    await expect(b.getByText(/SIEG!|NIEDERLAGE/u)).toBeVisible({ timeout: 10000 });

    // Re-Pairing: beide suchen sich einen "Nächsten Gegner" - da nur diese
    // zwei im Karussell warten, werden sie erneut miteinander gepaart. Das
    // prueft den kompletten Re-Pairing-Zyklus (Ergebnis -> erneuter
    // CAROUSEL_JOIN -> neue Begegnung); dass ein DRITTER, anderer Gegner bei
    // groesseren Warteschlangen bevorzugt wird, ist bereits durch die
    // Server-Integrationstests (game-server.test.ts) und die reinen
    // Warteschlangen-Tests (packages/protocol/test/carousel.test.ts) belegt.
    await a.getByRole("button", { name: "Nächster Gegner" }).click();
    await b.getByRole("button", { name: "Nächster Gegner" }).click();

    await expect(a.getByText(/\(Du\)/u)).toBeVisible({ timeout: 15000 });
    await expect(b.getByText(/\(Du\)/u)).toBeVisible({ timeout: 15000 });

    await a.screenshot({ path: "artifacts/e2e/carousel-rematch.png" });

    await contextA.close();
    await contextB.close();
  });
});
