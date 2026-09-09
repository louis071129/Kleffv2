import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // Echte Kalibrierung (3x3s pro Spieler) und der 20s-Public-Countdown
  // brauchen echte Zeit - grosszuegiger globaler Timeout, einzelne Tests
  // (z.B. drei-Spieler-Schnellsuche) setzen bei Bedarf noch mehr.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "artifacts/e2e/report", open: "never" }]],
  outputDir: "artifacts/e2e/test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--use-file-for-fake-audio-capture=fixtures/audio/bark-loud.wav",
      ],
      // Nur setzen wenn explizit vorgegeben (z.B. in dieser Sandbox). In CI
      // und normalen Dev-Umgebungen soll Playwright den Browser nehmen, den
      // es selbst ueber "playwright install" verwaltet - ein hartkodierter
      // Sandbox-Pfad wuerde dort mit "executable doesn't exist" fehlschlagen.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    },
  },
  webServer: {
    command: `PORT=${PORT} npm run start:dev-e2e`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /ipad-screenshots\.spec\.ts/,
    },
    {
      name: "ipad-landscape",
      use: { viewport: { width: 1024, height: 768 } },
      testMatch: /ipad-screenshots\.spec\.ts/,
    },
    {
      name: "ipad-portrait",
      use: { viewport: { width: 768, height: 1024 } },
      testMatch: /ipad-screenshots\.spec\.ts/,
    },
  ],
});
