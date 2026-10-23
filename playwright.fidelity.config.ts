import { defineConfig, devices } from "@playwright/test";

// A sign-off tool, not a CI gate: `npm run fidelity` puts a gallery frame beside
// today's landing card. testMatch is its own spec only, so `npm run test:e2e`
// (playwright.config.ts, gallery.spec.ts) never runs it.
//
// FIDELITY_FRONTEND_DIR: the mvp-frontend checkout to serve (default ../mvp-frontend).
// FIDELITY_FRONTEND_PORT: its port (default 5174). The API is pointed at a dead
// local port and every call is mocked by the spec, so no backend is needed.
// Neither server is ever reused: an existing process on a port may serve another
// checkout, which would make the run meaningless; Playwright refuses to start.
const frontendPort = process.env.FIDELITY_FRONTEND_PORT ?? "5174";
const frontendDir = process.env.FIDELITY_FRONTEND_DIR ?? "../mvp-frontend";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /fidelity\.spec\.ts/,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: [
    {
      command: "npm run demo",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `yarn vite --port ${frontendPort} --strictPort`,
      cwd: frontendDir,
      env: { VITE_API_URL: "http://127.0.0.1:59999", VITE_SENTRY_DSN: "" },
      url: `http://localhost:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
