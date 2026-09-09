import { test, expect } from "@playwright/test";
import { createPrivateLobby, joinPrivateLobby } from "./helpers";

test.describe("Private Lobby: 2-Spieler-Duell mit echtem Ton", () => {
  test("zwei Spieler joinen per Code, spielen ein komplettes Best-of-5-Duell mit echtem Ton und sehen das Ergebnis", async ({
    browser,
  }) => {
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

    // Bei genau 2 Spielern startet automatisch der Duell-Modus: Best-of-5 =
    // 5 Zyklen a 2 Spieler = 10 einzelne Bell-Runden. Rundenreihenfolge =
    // Beitrittsreihenfolge (siehe packages/protocol/src/match.ts), also
    // abwechselnd Host, Gast, Host, Gast, ... Explizit statt per isVisible()-
    // Race erkannt, siehe BLOCKERS.md.
    for (let round = 0; round < 10; round += 1) {
      const barkerPage = round % 2 === 0 ? host : guest;
      const bellButton = barkerPage.getByRole("button", { name: /BELL!/u });
      await bellButton.waitFor({ state: "visible", timeout: 15000 });
      await bellButton.click();
      // Bellfenster dauert 3s, danach kommt das Rundenergebnis.
      await host.waitForTimeout(3500);
    }

    await expect(host.getByText("Ergebnis")).toBeVisible({ timeout: 10000 });
    await expect(guest.getByText("Ergebnis")).toBeVisible({ timeout: 10000 });

    await host.screenshot({ path: "artifacts/e2e/two-player-result.png" });

    await hostContext.close();
    await guestContext.close();
  });
});
