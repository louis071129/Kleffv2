import { test } from "@playwright/test";
import { createPrivateLobby } from "./helpers";

/**
 * Laeuft nur in den ipad-landscape/ipad-portrait-Projekten (siehe
 * playwright.config.ts testMatch) - reine Screenshots, damit der Besitzer
 * morgens auf dem iPad sieht, wie es auf seinem Geraet aussieht.
 */
test.describe("iPad-Screenshots", () => {
  test("Startseite und Lobby", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.screenshot({ path: `artifacts/e2e/ipad-home-${testInfo.project.name}.png` });

    await createPrivateLobby(page);
    await page.screenshot({ path: `artifacts/e2e/ipad-lobby-${testInfo.project.name}.png` });
  });
});
