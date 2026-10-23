import { defineConfig, devices } from "@playwright/test";

// The gallery's Vite server is pinned to 5173 (demo/vite.config.ts, strictPort),
// so baseURL and webServer follow it. Locally a server already on 5173 is
// reused; CI always starts its own.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /gallery\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
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
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
