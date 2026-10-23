import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// A sign-off tool, not a CI gate: `npm run fidelity` puts a gallery frame beside
// today's landing card. testMatch is its own spec only, so `npm run test:e2e`
// (playwright.config.ts, gallery.spec.ts) never runs it.
//
// FIDELITY_FRONTEND_PORT: the frontend's port (default 5174). The API is pointed
// at a dead local port and the spec aborts every request to it, so no backend is
// needed. Neither server is ever reused: an existing process on a port may serve
// another checkout, which would make the run meaningless; Playwright refuses to start.
//
// FIDELITY_FRONTEND_DIR: the mvp-frontend checkout to serve. It DEFAULTS to the real
// sibling ../mvp-frontend, with two preconditions:
//  (a) Starting Vite there rewrites the tracked generated file
//      src/features/docs/docs-manifest.ts (its docs plugin writes it on every start;
//      byte-identical on a clean, synced main, but still a write). When that checkout
//      is dirty or shared with another session, point FIDELITY_FRONTEND_DIR at an
//      archive copy (`git archive origin/main`, node_modules cloned or installed
//      there) to leave it untouched. Vite also writes node_modules/.vite.
//  (b) The checkout needs a current `yarn install`: with stale node_modules the
//      landing page never mounts (the run would otherwise end in a bare 120 s
//      timeout), so the check below fails fast instead.
const frontendPort = process.env.FIDELITY_FRONTEND_PORT ?? "5174";
const frontendDir = process.env.FIDELITY_FRONTEND_DIR ?? "../mvp-frontend";

/** Read-only and cheap: what the landing imports must be installed, at the pinned version. */
function assertFrontendInstalled(dir: string): void {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), dir);
  const fix = `Run \`yarn install\` in ${root} (or point FIDELITY_FRONTEND_DIR at a fresh copy).`;
  const modules = join(root, "node_modules");
  if (!existsSync(join(root, "package.json")))
    throw new Error(`Fidelity: no mvp-frontend checkout at ${root}. ${fix}`);
  const missing = ["mermaid", "katex"].filter(
    (name) => !existsSync(join(modules, name)),
  );
  if (missing.length > 0)
    throw new Error(
      `Fidelity: ${modules} is missing ${missing.join(", ")} (imported by the landing). ${fix}`,
    );
  const version = (file: string): unknown =>
    (JSON.parse(readFileSync(file, "utf8")) as { version?: unknown }).version;
  const pinned = (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    }
  ).dependencies?.["@dagnam/contracts"];
  const installed = version(join(modules, "@dagnam/contracts/package.json"));
  if (pinned !== undefined && installed !== pinned)
    throw new Error(
      `Fidelity: ${root} has stale node_modules (@dagnam/contracts ${String(installed)} installed, ${pinned} pinned). ${fix}`,
    );
}
assertFrontendInstalled(frontendDir);

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
