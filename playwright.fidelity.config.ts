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
// FIDELITY_FRONTEND_DIR (REQUIRED, no default): a checkout of the app whose landing
// page uses these effects. The tool never defaults to a directory outside this repo,
// because starting that app's dev server WRITES into it (a tracked generated file its
// docs plugin rewrites on every start, byte-identical only on a clean, synced main,
// and node_modules/.vite). So do not point it at a checkout other people are using:
// use an archive copy (`git archive` of main, node_modules cloned or installed there).
// The copy needs a current `yarn install`: with stale node_modules the landing page
// never mounts (the run would otherwise end in a bare 120 s timeout), so the check
// below fails fast instead.
const frontendPort = process.env.FIDELITY_FRONTEND_PORT ?? "5174";
const frontendDir = process.env.FIDELITY_FRONTEND_DIR;
if (!frontendDir)
  throw new Error(
    "Fidelity: set FIDELITY_FRONTEND_DIR to a checkout or an archive copy of the app whose landing page uses these effects (with a current `yarn install`). Do not point it at a checkout other people are using: starting its dev server writes into it.",
  );

/** Read-only and cheap: what the landing imports must be installed, at the pinned version. */
function assertFrontendInstalled(dir: string): void {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), dir);
  const fix = `Run \`yarn install\` in ${root}, or point FIDELITY_FRONTEND_DIR at a checkout or an archive copy that has it (never at one other people are using).`;
  const modules = join(root, "node_modules");
  if (!existsSync(join(root, "package.json")))
    throw new Error(`Fidelity: no app checkout at ${root}. ${fix}`);
  if (!existsSync(modules))
    throw new Error(`Fidelity: ${root} has no node_modules. ${fix}`);
  const missing = ["mermaid", "katex"].filter(
    (name) => !existsSync(join(modules, name)),
  );
  if (missing.length > 0)
    throw new Error(
      `Fidelity: ${modules} is missing ${missing.join(", ")} (imported by the landing). ${fix}`,
    );
  const contracts = join(modules, "@dagnam/contracts/package.json");
  if (!existsSync(contracts))
    throw new Error(
      `Fidelity: ${modules} is missing @dagnam/contracts (imported by the landing). ${fix}`,
    );
  const installed = (
    JSON.parse(readFileSync(contracts, "utf8")) as { version?: string }
  ).version;
  const pinned = (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    }
  ).dependencies?.["@dagnam/contracts"];
  if (pinned === undefined || installed === undefined) return;
  if (/^(link|workspace|file):/.test(pinned)) {
    console.log(
      `Fidelity: @dagnam/contracts is pinned as "${pinned}"; skipping the installed-version check.`,
    );
    return;
  }
  if (!satisfies(installed, pinned))
    throw new Error(
      `Fidelity: ${root} has stale node_modules (@dagnam/contracts ${installed} installed, ${pinned} pinned). ${fix}`,
    );
}

/** An exact version, ^x.y.z or ~x.y.z; any other spec is not compared (it passes). */
function satisfies(installed: string, spec: string): boolean {
  const num = (v: string): number[] =>
    v.split(".").map((n) => Number.parseInt(n, 10));
  const match = /^([\^~]?)(\d+\.\d+\.\d+)$/.exec(spec);
  if (!match) return true;
  const [i0 = 0, i1 = 0, i2 = 0] = num(installed);
  const [p0 = 0, p1 = 0, p2 = 0] = num(match[2] ?? "");
  const atLeast =
    i0 > p0 || (i0 === p0 && (i1 > p1 || (i1 === p1 && i2 >= p2)));
  if (match[1] === "") return installed === match[2];
  if (!atLeast) return false;
  if (match[1] === "~") return i0 === p0 && i1 === p1;
  return p0 > 0
    ? i0 === p0
    : i0 === 0 && (p1 > 0 ? i1 === p1 : i1 === 0 && i2 === p2);
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
