import { test, expect } from "@playwright/test";
import { createPrivateLobby, joinPrivateLobby } from "./helpers";

test.describe("Zwei-Spieler-Match (private Lobby)", () => {
  test("zwei Spieler joinen per Code, spielen ein komplettes Match und sehen das Ergebnis", async ({ browser }) => {
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

    await host.getByRole("button", { name: "Match starten" }).click();

    // Rundenreihenfolge = Beitrittsreihenfolge (siehe packages/protocol/src/match.ts):
    // Host hat die Lobby erstellt und ist damit zuerst dran, dann der Gast. Explizit
    // statt per isVisible()-Race erkannt: isVisible() wartet nicht, ist also anfaellig
    // dafuer, VOR dem ROUND_STARTED-Broadcast auszuwerten und dann auf der falschen
    // Seite auf einen Button zu warten, der dort nie erscheint (siehe BLOCKERS.md).
    for (const barkerPage of [host, guest]) {
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
