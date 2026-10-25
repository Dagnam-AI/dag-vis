import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { runScript } from "./harness.ts";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/render.ts", import.meta.url),
);

// motion/ is a temp tree, so out/, public/ and RENDERS.jsonl are scratch; the
// library, the video's own props and the script stay the real ones. Every
// subprocess (git, the remotion bin, the sibling scripts) is a fake.
const h = vi.hoisted(() => ({
  motion: "",
  spawn: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawnSync: h.spawn }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));

const HEAD = "f6af669803dac125c06c08aac0d8b61f6254e962";
const REPORT = {
  file: "/x/out.mp4",
  video: "pipeline-proof",
  probe: {
    width: 1920,
    height: 1080,
    fps: 30,
    frames: 180,
    videoDuration: 6,
    audioDuration: 6,
    audioSampleRate: 48000,
  },
  loudness: { integrated: -16, truePeak: -2, lra: 3 },
  problems: [] as string[],
};

interface Fakes {
  status: string;
  report: { status: number; stdout: string; stderr?: string };
  remotionStatus: number;
}
let tmp: string;
let fakes: Fakes;
let calls: { cmd: string; args: string[] }[];

const ok = (stdout = "") => ({
  status: 0,
  stdout,
  stderr: "",
  error: undefined,
});

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "render-")));
  h.motion = join(tmp, "motion");
  mkdirSync(join(h.motion, "src/videos/pipeline-proof"), { recursive: true });
  mkdirSync(join(h.motion, "node_modules/remotion"), { recursive: true });
  writeFileSync(join(h.motion, "src/videos/pipeline-proof/audio.ts"), "");
  writeFileSync(
    join(h.motion, "node_modules/remotion/package.json"),
    '{"version":"4.0.534"}',
  );
  writeFileSync(join(h.motion, "RENDERS.jsonl"), "");
  mkdirSync(join(tmp, "videos"));
  vi.stubEnv("DAG_VIDEOS_DIR", join(tmp, "videos"));
  vi.stubEnv("MOTION_GL", "");
  fakes = {
    status: "",
    report: { status: 0, stdout: JSON.stringify(REPORT) },
    remotionStatus: 0,
  };
  calls = [];
  h.spawn.mockReset();
  h.spawn.mockImplementation((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    if (cmd === "git")
      return ok(args[0] === "rev-parse" ? `${HEAD}\n` : fakes.status);
    if (cmd.endsWith("remotion")) {
      if (fakes.remotionStatus === 0)
        writeFileSync(args[2]!, "not really an mp4");
      return { ...ok(), status: fakes.remotionStatus, stdout: null };
    }
    if (args[0] === "scripts/check-render.ts")
      return { ...ok(), ...fakes.report };
    return ok(`${args[0] ?? ""} ran\n`);
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmp, { recursive: true, force: true });
});

const files = (dir: string): string[] =>
  readdirSync(join(h.motion, dir)).sort();
const ledger = (): string =>
  readFileSync(join(h.motion, "RENDERS.jsonl"), "utf8");

describe("scripts/render.ts: what it records", () => {
  it("writes the props the render used, defaults included, to the props file and the ledger line", async () => {
    // No --props: the composition still draws with its own default seed.
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(0);
    const [name] = files("out/pipeline-proof").filter((f) =>
      f.endsWith(".mp4"),
    );
    const props = JSON.parse(
      readFileSync(
        join(
          h.motion,
          "out/pipeline-proof",
          name!.replace(".mp4", ".props.json"),
        ),
        "utf8",
      ),
    ) as unknown;
    expect(props).toEqual({ seed: 1 });
    const line = JSON.parse(ledger().trim()) as { props: unknown };
    expect(line.props).toEqual({ seed: 1 });
    // remotion was handed that same file, so the render and the record agree.
    const render = calls.find((c) => c.cmd.endsWith("remotion"));
    expect(render?.args[render.args.indexOf("--props") + 1]).toMatch(
      /\.props\.json$/,
    );
  });

  it("lets --props override a default and keeps a key the composition does not default", async () => {
    await runScript(SCRIPT, ["pipeline-proof", "--props", '{"seed":7,"x":1}']);
    const line = JSON.parse(ledger().trim()) as { props: unknown };
    expect(line.props).toEqual({ seed: 7, x: 1 });
  });
});
