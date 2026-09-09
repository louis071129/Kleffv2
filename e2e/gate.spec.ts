import { test, expect } from "@playwright/test";

test.describe("Passwort-Gate", () => {
  test("zeigt den Bald-verfuegbar-Screen ohne Cookie, lehnt falsches Passwort ab, laesst mit 'lars' rein", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Bald verfügbar")).toBeVisible();

    await page.getByPlaceholder("Passwort").fill("falsch123");
    await page.getByRole("button", { name: "Rein" }).click();
    await expect(page.getByText("Falsches Passwort")).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder("Passwort").fill("lars");
    await page.getByRole("button", { name: "Rein" }).click();
    await expect(page.getByRole("heading", { name: "KLÄFF" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Bald verfügbar")).not.toBeVisible();
  });

  test("die WebSocket-Route ist ohne Gate-Cookie ebenfalls gesperrt", async ({ page, baseURL }) => {
    await page.goto("/");
    const wsUrl = (baseURL ?? "").replace("http://", "ws://") + "/ws";
    const closedWithoutMessage = await page.evaluate(
      (url) =>
        new Promise<boolean>((resolve) => {
          const ws = new WebSocket(url);
          let gotMessage = false;
          ws.onmessage = () => {
            gotMessage = true;
          };
          ws.onclose = () => resolve(!gotMessage);
          setTimeout(() => resolve(!gotMessage), 2000);
        }),
      wsUrl,
    );
    expect(closedWithoutMessage).toBe(true);
  });
});
