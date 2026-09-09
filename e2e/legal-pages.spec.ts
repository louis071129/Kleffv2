import { test, expect } from "@playwright/test";

test.describe("Rechtsseiten", () => {
  test("Impressum, Datenschutz, Nutzungsbedingungen und Cookie-Einstellungen sind ohne Gate-Cookie erreichbar", async ({
    page,
  }) => {
    for (const [path, heading] of [
      ["/impressum", "Impressum"],
      ["/datenschutz", "Datenschutzerklärung"],
      ["/nutzungsbedingungen", "Nutzungsbedingungen"],
      ["/cookie-einstellungen", "Cookie-Einstellungen"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      // Bewusst NICHT hinter dem Passwort-Gate versteckt (§ 5 DDG): die Seite
      // muss direkt laden, nicht auf den Gate-Screen umschreiben.
      await expect(page.getByPlaceholder("Passwort")).not.toBeVisible();
    }
  });

  test("der Bald-verfuegbar-Screen verlinkt Impressum und Datenschutz", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Impressum" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Datenschutz" })).toBeVisible();
  });

  test("Cookie-Hinweis erscheint einmalig und bleibt nach 'Verstanden' dauerhaft weg", async ({ page }) => {
    await page.context().addCookies([
      { name: "klaeff_gate", value: "unlocked", domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/");
    const notice = page.getByRole("dialog", { name: "Hinweis zu Cookies" });
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: "Verstanden" }).click();
    await expect(notice).not.toBeVisible();

    await page.reload();
    await expect(page.getByRole("dialog", { name: "Hinweis zu Cookies" })).not.toBeVisible();
  });
});
