import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Accepted {
  id: string;
  reason: string;
  review: string;
}
interface Mod {
  findings: (report: unknown, accepted: Accepted[], today: string) => string[];
}
// A variable specifier: the script is plain .mjs with no declaration file.
const SCRIPT = join(__dirname, "..", "..", "scripts", "check-motion.mjs");
const { findings } = (await import(SCRIPT)) as Mod;

const advisory = (id: string) => ({
  source: 1,
  name: "zod",
  url: `https://github.com/advisories/${id}`,
});
const report = (...ids: string[]) => ({
  vulnerabilities: {
    zod: { via: [advisory(ids[0] ?? "x"), ...ids.slice(1).map(advisory)] },
    "@remotion/studio": { via: ["zod"] },
  },
});
const accepted = [{ id: "GHSA-a", reason: "local only", review: "2026-10-26" }];

describe("check-motion findings", () => {
  it("passes an accepted advisory inside its review date, ignoring name-only via entries", () => {
    expect(findings(report("GHSA-a"), accepted, "2026-10-26")).toEqual([]);
  });
  it("fails an advisory that is not accepted", () => {
    expect(
      findings(report("GHSA-a", "GHSA-b"), accepted, "2026-10-24"),
    ).toEqual(["GHSA-b is not accepted"]);
  });
  it("fails an acceptance past its review date", () => {
    expect(findings(report("GHSA-a"), accepted, "2026-10-27")).toEqual([
      "GHSA-a acceptance lapsed on 2026-10-26: local only",
    ]);
  });
  it("passes a clean report", () => {
    expect(findings({ vulnerabilities: {} }, accepted, "2026-10-24")).toEqual(
      [],
    );
  });
  it.each([undefined, {}, { vulnerabilities: null }])(
    "fails when there is no usable report: %j",
    (r) => {
      expect(findings(r, accepted, "2026-10-24")).toHaveLength(1);
    },
  );
});
