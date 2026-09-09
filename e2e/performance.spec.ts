import { test, expect } from "@playwright/test";
import { createPrivateLobby, joinPrivateLobby } from "./helpers";

/**
 * Best-Effort-Leistungscheck fuer die Buehne mit mehreren Avataren (Idle-
 * Animationen laufen dort parallel fuer alle Spieler). Ehrlich: ein
 * geteilter, virtualisierter CI-Runner ist kein echtes Mobilgeraet - das
 * hier ist ein Regressions-Rauchtest ("laeuft nicht sichtbar ruckelig"),
 * kein belastbarer 60fps-Beweis fuer echte Hardware. Miss lieber selbst auf
 * einem echten iPad nach, wenn es genau wissen willst.
 */
test.describe("Performance-Rauchtest", () => {
  test("Lobby mit mehreren Avataren bleibt bei ueber ~30fps im Mittel (Proxy-Messung)", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    const code = await createPrivateLobby(host);
    await joinPrivateLobby(guest, code);
    await expect(host.getByText("2/8 Spieler")).toBeVisible({ timeout: 10000 });

    const avgFrameTimeMs = await host.evaluate(async () => {
      const samples: number[] = [];
      let last = performance.now();
      await new Promise<void>((resolve) => {
        let frames = 0;
        function tick(): void {
          const now = performance.now();
          samples.push(now - last);
          last = now;
          frames += 1;
          if (frames < 60) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(tick);
      });
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    });

    const estimatedFps = 1000 / avgFrameTimeMs;
    console.info(`Performance-Rauchtest: ~${estimatedFps.toFixed(1)} fps (Proxy, geteilter CI-Runner)`);
    expect(estimatedFps).toBeGreaterThan(30);

    await hostContext.close();
    await guestContext.close();
  });
});
