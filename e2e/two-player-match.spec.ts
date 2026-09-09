import { test, expect } from "@playwright/test";
import { createPrivateLobby, joinPrivateLobby, playTugOfWarUntilResult } from "./helpers";

test.describe("Private Lobby: 2-Spieler-Duell mit echtem Ton", () => {
  test("zwei Spieler joinen per Code, spielen ein komplettes Tauzieh-Duell mit echtem Ton und sehen das Ergebnis", async ({
    browser,
  }, testInfo) => {
    // Alle E2E-Kontexte teilen dieselbe Fake-Audio-Datei -> das Tauzieh-Match
    // wird ueber den Sudden-Death-Fallback entschieden (bis zu 15 Runden,
    // siehe playTugOfWarUntilResult) - grosszuegiger Timeout dafuer.
    testInfo.setTimeout(150_000);
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    const code = await createPrivateLobby(host);
    expect(code).toHaveLength(6);

    await joinPrivateLobby(guest, code);

    // Beide sehen die Lobby mit zwei Spielern.
    await expect(host.getByText("2/8 Spieler")).toBeVisible({ timeout: 10000 });
    await expect(guest.getByText("2/8 Spieler")).toBeVisible({ timeout: 10000 });

    // "Echter Ton" ist bei privaten Lobbys der Standard, siehe Auftrag.
    await expect(host.getByText("🔊 Echter Ton", { exact: false })).toBeVisible();

    await host.getByRole("button", { name: "Match starten" }).click();

    // Bei genau 2 Spielern startet automatisch der Duell-Modus: Tauzieh mit
    // dynamischer Rundenzahl (Seil-Schwelle statt fester Zyklenzahl, siehe
    // packages/protocol/src/tug-of-war.ts) statt eines festen Best-of-N.
    await playTugOfWarUntilResult([host, guest]);

    await expect(host.getByText(/SIEG!|NIEDERLAGE/u)).toBeVisible({ timeout: 10000 });
    await expect(guest.getByText(/SIEG!|NIEDERLAGE/u)).toBeVisible({ timeout: 10000 });

    await host.screenshot({ path: "artifacts/e2e/two-player-result.png" });

    await hostContext.close();
    await guestContext.close();
  });
});
