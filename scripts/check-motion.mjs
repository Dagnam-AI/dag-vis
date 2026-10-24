// `npm run check` reaches motion/ here. A checkout that never installed
// motion/ skips with ONE visible line; CI's motion job installs first and sets
// MOTION_REQUIRED=1, so there a skip is a failure. A skip is reported, never
// silent, and never counts as green for motion. motion/ bundles the library's
// SOURCE, so the root install (`npm ci`) must have run too.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Advisories accepted for motion/'s tree, each with a reason and a review date.
// Past its date an entry fails the gate, so an accepted risk cannot go stale.
export const ACCEPTED = [
  {
    id: "GHSA-mrhx-c7xc-m3w5",
    reason:
      "zod < 4.6.6 (memory exhaustion validating oversized collections) is pinned exactly by Remotion's studio (4.0.534 to 4.0.538), which the CLI and the bundler pull in. Reachable only through the props path: our own files, no untrusted input, no network service. Expires after 2026-10-26 (UTC): an `overrides` entry for zod 4.6.6 (14 days old on 2026-10-25) replaces this entry.",
    review: "2026-10-26",
  },
];

export const NO_REPORT = "no audit report (offline or a registry error?)";

/** Advisory ids in an `npm audit --json` report that are not accepted (or whose acceptance has lapsed). */
export function findings(report, accepted, today) {
  const vulnerabilities = report?.vulnerabilities;
  if (typeof vulnerabilities !== "object" || vulnerabilities === null)
    return [NO_REPORT];
  const ids = new Set(
    Object.values(vulnerabilities)
      .flatMap((v) => v.via)
      .filter((v) => typeof v === "object")
      .map((v) => v.url.split("/").at(-1)),
  );
  return [...ids].flatMap((id) => {
    const entry = accepted.find((a) => a.id === id);
    if (!entry) return [`${id} is not accepted`];
    return today > entry.review
      ? [`${id} acceptance lapsed on ${entry.review}: ${entry.reason}`]
      : [];
  });
}

/**
 * What the audit step does with its findings. A missing report (offline) skips
 * loudly unless `required` (CI): there it fails closed. An advisory that is not
 * accepted, or whose acceptance lapsed, fails everywhere.
 */
export function decide(report, accepted, today, required) {
  const bad = findings(report, accepted, today);
  if (bad.length === 0)
    return { exit: 0, lines: ["npm audit: only accepted advisories remain"] };
  if (bad.length === 1 && bad[0] === NO_REPORT && !required)
    return {
      exit: 0,
      lines: [
        "npm audit SKIPPED - no report (offline?); CI's motion job enforces it (MOTION_REQUIRED=1)",
      ],
    };
  return { exit: 1, lines: bad.map((b) => `npm audit: ${b}`) };
}

function main() {
  if (!existsSync(new URL("../motion/node_modules", import.meta.url))) {
    const line =
      "check:motion: skipped - no motion/node_modules (run `npm ci --prefix motion` to include it)";
    if (process.env.MOTION_REQUIRED === "1") {
      console.error(`${line}; MOTION_REQUIRED is set, failing`);
      process.exit(1);
    }
    console.log(line);
    process.exit(0);
  }

  const steps = [
    ["npx", ["eslint", "--config", "motion/eslint.config.js", "motion"]],
    ["npx", ["tsc", "-p", "motion/tsconfig.json", "--noEmit"]],
    ["npm", ["--prefix", "motion", "run", "test:coverage"]],
  ];
  for (const [cmd, args] of steps) {
    const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
    if (r.error)
      console.error(`check:motion: ${cmd} failed to start: ${r.error.message}`);
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const audit = spawnSync("npm", ["audit", "--prefix", "motion", "--json"], {
    encoding: "utf8",
    cwd: ROOT,
  });
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    report = undefined;
  }
  const { exit, lines } = decide(
    report,
    ACCEPTED,
    new Date().toISOString().slice(0, 10),
    process.env.MOTION_REQUIRED === "1",
  );
  for (const l of lines)
    (exit === 0 ? console.log : console.error)(`check:motion: ${l}`);
  if (exit !== 0) process.exit(exit);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
