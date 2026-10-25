import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Accepted {
  id: string;
  reason: string;
  review: string;
}
interface Mod {
  findings: (report: unknown, accepted: Accepted[], today: string) => string[];
  decide: (
    report: unknown,
    accepted: Accepted[],
    today: string,
    required: boolean,
  ) => { exit: number; lines: string[] };
}
// A variable specifier: the script is plain .mjs with no declaration file.
const SCRIPT = join(__dirname, "..", "..", "scripts", "check-motion.mjs");
const { findings, decide } = (await import(SCRIPT)) as Mod;

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

describe("check-motion decide", () => {
  const offline = { error: { code: "ENOTFOUND" } };
  it("skips loudly, exit 0, when there is no report and the gate is not required", () => {
    const r = decide(offline, accepted, "2026-10-24", false);
    expect(r.exit).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toContain("SKIPPED");
  });
  it("fails closed when there is no report and the gate is required", () => {
    expect(decide(offline, accepted, "2026-10-24", true).exit).toBe(1);
    expect(decide(undefined, accepted, "2026-10-24", true).exit).toBe(1);
  });
  it.each([false, true])(
    "fails an unlisted advisory whatever required is (%s)",
    (required) => {
      const r = decide(report("GHSA-b"), accepted, "2026-10-24", required);
      expect(r).toEqual({
        exit: 1,
        lines: ["npm audit: GHSA-b is not accepted"],
      });
    },
  );
  it.each([false, true])(
    "fails a lapsed acceptance whatever required is (%s)",
    (required) => {
      expect(
        decide(report("GHSA-a"), accepted, "2026-10-27", required).exit,
      ).toBe(1);
    },
  );
  it("passes an accepted advisory inside its date", () => {
    expect(decide(report("GHSA-a"), accepted, "2026-10-26", true).exit).toBe(0);
  });
});
