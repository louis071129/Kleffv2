import { test, expect } from "@playwright/test";
import { createPrivateLobby, waitForMatchResult } from "./helpers";

test.describe("Bots: allein gegen einen Bot spielen", () => {
  test("ein einzelner Browser-Context erstellt eine private Lobby, fuegt einen Bot hinzu und spielt ein komplettes Match ohne zweiten Menschen", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);

    await createPrivateLobby(page);

    // Genau der Weg, den der Besitzer morgen allein am iPad nutzen wuerde:
    // Lobby erstellen, Bot hinzufuegen (hier: Welpe - die einfachste Stufe,
    // damit der Test zuegig und zuverlaessig durchlaeuft), Match starten.
    await page.getByRole("button", { name: "🐾 Welpe" }).click();
    await expect(page.getByText("Bot · Welpe", { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("2/8 Spieler")).toBeVisible();

    await page.getByRole("button", { name: "Match starten" }).click();
    await expect(page.getByText(/\(Du\)/u)).toBeVisible({ timeout: 15000 });

    // Kein Knopf, kein Abwechseln: der Mensch bellt durchgehend ueber die
    // Fake-Audio-Datei, der Bot bellt server-seitig kontinuierlich von
    // selbst (siehe nextBotFrames in server/game-server.ts).
    await waitForMatchResult([page]);

    await expect(page.getByText(/SIEG!|NIEDERLAGE/u)).toBeVisible({ timeout: 10000 });
    // Bot bleibt im Ergebnis-Screen eindeutig als Bot erkennbar.
    await expect(page.getByText("Bot · Welpe", { exact: false })).toBeVisible();

    await page.screenshot({ path: "artifacts/e2e/solo-vs-bot-result.png" });
  });
});
