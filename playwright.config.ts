import { defineConfig, devices } from "@playwright/test";

// The gallery's Vite server is pinned to 5173 (demo/vite.config.ts, strictPort),
// so baseURL and webServer follow it. A server already on 5173 is never
// reused (it may serve another checkout, which would make this run green for
// the wrong tree): Playwright refuses to start, so stop it first.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /(gallery|field-parity)\.spec\.ts$/,
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    // Headless Chromium needs a software GL for WebGL2.
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: "npm run demo",
    url: "http://localhost:5173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
