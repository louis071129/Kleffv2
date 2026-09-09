import type { Page } from "@playwright/test";

/**
 * Klickt sich durch Mikro-Freigabe und Kalibrierung (3 echte 3s-Schritte,
 * ausgewertet aus der Fake-Audio-Datei die Chromium ueber
 * --use-file-for-fake-audio-capture einspeist). Muss aufgerufen werden,
 * NACHDEM auf der Startseite Schnellsuche/Lobby-erstellen/Lobby-beitreten
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

export async function joinPublicQueue(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("Schnellsuche").click();
  await completeMicAndCalibration(page);
}

export async function createPrivateLobby(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByText("Private Lobby erstellen").click();
  await completeMicAndCalibration(page);
  const codeLocator = page.locator("p.font-display.text-4xl");
  await codeLocator.waitFor({ state: "visible", timeout: 10000 });
  const code = (await codeLocator.textContent())?.trim() ?? "";
  return code;
}

export async function joinPrivateLobby(page: Page, code: string): Promise<void> {
  await page.goto(`/j/${code}`);
  await page.getByRole("button", { name: "Los" }).click();
  await completeMicAndCalibration(page);
}
