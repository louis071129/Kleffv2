import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "server/**/*.test.ts",
      "scripts/**/*.test.ts",
      "lib/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", "dist", "e2e"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@klaeff/scoring": path.resolve(__dirname, "packages/scoring/src/index.ts"),
      "@klaeff/protocol": path.resolve(__dirname, "packages/protocol/src/index.ts"),
      "@klaeff/bark-synth": path.resolve(__dirname, "packages/bark-synth/src/index.ts"),
    },
  },
});
