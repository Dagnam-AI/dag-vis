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

interface Reply {
  status: number;
  stdout: string;
  stderr: string;
}
interface Fakes {
  /** `git status --porcelain`. */
  status: string;
  /** What each sibling script (store, audio, check-render) answers, by script name. */
  scripts: Record<string, Reply>;
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
    scripts: {
      "check-render": { status: 0, stdout: JSON.stringify(REPORT), stderr: "" },
    },
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
    const name = /scripts\/(.+)\.ts$/.exec(args[0] ?? "")?.[1] ?? "";
    return {
      ...ok(`${name} ran\n`),
      ...fakes.scripts[name],
    };
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

const mp4s = (): string[] =>
  files("out/pipeline-proof").filter((f) => f.endsWith(".mp4"));
const scriptCalls = (): string[] =>
  calls.filter((c) => c.cmd === process.execPath).map((c) => c.args.join(" "));

describe("scripts/render.ts: arguments and refusals", () => {
  it.each([
    [[], "a video name"],
    [["Bad_Name"], "a video name"],
    [["pipeline-proof", "--crf", "99"], "--crf must be a whole number"],
    [["pipeline-proof", "--props", "[1]"], "--props must be a JSON object"],
    [["pipeline-proof", "--bogus"], "unknown option --bogus"],
    [["pipeline-proof", "extra"], "unexpected extra argument extra"],
  ])(
    "exits 1 with the usage line for %j, before any process starts",
    async (argv, message) => {
      const r = await runScript(SCRIPT, argv);
      expect(r.code).toBe(1);
      expect(r.err).toContain(message);
      expect(r.err).toContain("usage: node scripts/render.ts <video>");
      expect(calls).toEqual([]);
    },
  );

  it("refuses to run from another folder", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(tmp);
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    cwd.mockRestore();
    expect(r.code).toBe(1);
    expect(r.err).toContain(`not ${tmp}`);
    expect(calls).toEqual([]);
  });

  it("refuses a deliverable on the GPU renderer before doing any work, and names the way out", async () => {
    vi.stubEnv("MOTION_GL", "angle");
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("renderer is angle");
    expect(r.err).toContain("--preview-not-a-deliverable");
    expect(calls).toEqual([]);
  });

  it("refuses a dirty tree, listing the first ten paths and counting the rest", async () => {
    fakes.status = Array.from(
      { length: 12 },
      (_, i) => ` M f${String(i)}.ts\n`,
    ).join("");
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      `commit ${HEAD.slice(0, 7)} does not describe this video`,
    );
    expect(r.err).toContain("f9.ts");
    expect(r.err).not.toContain("f10.ts");
    expect(r.err).toContain("... and 2 more");
    expect(r.err).toContain("--allow-dirty");
    expect(scriptCalls()).toEqual([]);
  });

  it("lists a short dirty tree without a count", async () => {
    fakes.status = " M a.ts\n";
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("  a.ts");
    expect(r.err).not.toContain("more");
  });

  it("does not count the ledger itself as a change", async () => {
    fakes.status = " M motion/RENDERS.jsonl\n";
    expect((await runScript(SCRIPT, ["pipeline-proof"])).code).toBe(0);
  });

  it("renders a dirty tree with --allow-dirty and records dirty: true in the ledger and the check record", async () => {
    fakes.status = " M a.ts\n";
    const r = await runScript(SCRIPT, ["pipeline-proof", "--allow-dirty"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(ledger().trim())).toMatchObject({
      dirty: true,
      git: HEAD,
    });
    const [name] = mp4s();
    const record = JSON.parse(
      readFileSync(
        join(
          h.motion,
          "out/pipeline-proof",
          name!.replace(".mp4", ".check.json"),
        ),
        "utf8",
      ),
    ) as unknown;
    expect(record).toMatchObject({
      dirty: true,
      renderer: "swangle",
      git: HEAD,
    });
  });

  it("stops, naming the folder, when the local videos folder cannot be used", async () => {
    fakes.scripts.store = {
      status: 1,
      stdout: "",
      stderr: "DAG_VIDEOS_DIR: nope",
    };
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("store.ts --check exited 1");
    expect(calls.some((c) => c.cmd.endsWith("remotion"))).toBe(false);
  });

  it("refuses a deliverable without a sound bed, and says a preview can go without", async () => {
    mkdirSync(join(h.motion, "src/videos/silent"), { recursive: true });
    const r = await runScript(SCRIPT, ["silent"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "src/videos/silent/audio.ts not found: a deliverable has a sound bed",
    );
    const p = await runScript(SCRIPT, [
      "silent",
      "--preview-not-a-deliverable",
    ]);
    expect(p.err).toContain("rendering without a sound bed");
  });

  it("stops with the audio script's own exit code when the bed fails", async () => {
    fakes.scripts.audio = { status: 3, stdout: "", stderr: "" };
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(3);
    expect(calls.some((c) => c.cmd.endsWith("remotion"))).toBe(false);
  });
});

describe("scripts/render.ts: the render and its checks", () => {
  it("runs the steps in order, for a deliverable: store --check, audio, remotion, check-render, store, ledger", async () => {
    const r = await runScript(SCRIPT, ["pipeline-proof", "--crf", "23"]);
    expect(r.code).toBe(0);
    expect(scriptCalls().map((c) => c.split(" ")[0])).toEqual([
      "scripts/store.ts",
      "scripts/audio.ts",
      "scripts/check-render.ts",
      "scripts/store.ts",
    ]);
    const [name] = mp4s();
    expect(name).toMatch(/^pipeline-proof-\d{8}-v1\.mp4$/);
    const remotion = calls.find((c) => c.cmd.endsWith("remotion"))!;
    expect(remotion.args).toEqual(
      expect.arrayContaining([
        "render",
        "pipeline-proof",
        "--overwrite=false",
        "--codec",
        "h264",
        "--crf",
        "23",
        "--gl",
        "swangle",
      ]),
    );
    expect(scriptCalls()[3]).toContain(`out/pipeline-proof/${name}`);
    const line = JSON.parse(ledger().trim()) as Record<string, unknown>;
    expect(line).toMatchObject({
      video: "pipeline-proof",
      file: `out/pipeline-proof/${name}`,
      bytes: "not really an mp4".length,
      frames: 180,
      integrated_lufs: -16,
      true_peak_dbtp: -2,
      git: HEAD,
      dirty: false,
      remotion: "4.0.534",
      gl: "swangle",
      stored: { local: `pipeline-proof/${name}`, r2: null },
    });
    expect(r.out).toContain("store ran");
    expect(JSON.parse(r.out.slice(r.out.indexOf("{")))).toMatchObject({
      video: "pipeline-proof",
    });
  });

  it("takes the next version number past what out/, the ledger and the videos folder already hold", async () => {
    mkdirSync(join(h.motion, "out/pipeline-proof"), { recursive: true });
    writeFileSync(
      join(h.motion, "out/pipeline-proof/pipeline-proof-20200101-v1.mp4"),
      "",
    );
    writeFileSync(
      join(h.motion, "RENDERS.jsonl"),
      `${JSON.stringify({ video: "pipeline-proof", file: "out/pipeline-proof/pipeline-proof-20200101-v4.mp4" })}\n`,
    );
    mkdirSync(join(tmp, "videos/pipeline-proof"));
    writeFileSync(
      join(tmp, "videos/pipeline-proof/pipeline-proof-20200101-v7.mp4"),
      "",
    );
    await runScript(SCRIPT, ["pipeline-proof"]);
    expect(mp4s().at(-1)).toMatch(/-v8\.mp4$/);
    expect(ledger().trim().split("\n")).toHaveLength(2);
  });

  it("passes the remotion exit code on and writes no ledger line", async () => {
    fakes.remotionStatus = 5;
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(5);
    expect(r.err).toContain("exited 5");
    expect(ledger()).toBe("");
  });

  it("keeps a render that fails its checks for inspection, names the problems, and stores and records nothing", async () => {
    fakes.scripts["check-render"] = {
      status: 1,
      stdout: JSON.stringify({
        ...REPORT,
        problems: ["frames 179, expected 180"],
      }),
      stderr: "",
    };
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "failed its checks (nothing stored, no ledger line)",
    );
    expect(r.err).toContain("frames 179, expected 180");
    expect(
      files("out/pipeline-proof").some((f) => f.endsWith(".check.json")),
    ).toBe(true);
    expect(
      scriptCalls().filter((c) => c.startsWith("scripts/store.ts")),
    ).toHaveLength(1);
    expect(ledger()).toBe("");
  });

  it("fails a check that exited non-zero without naming a problem", async () => {
    fakes.scripts["check-render"] = {
      status: 2,
      stdout: JSON.stringify(REPORT),
      stderr: "",
    };
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("check-render exited 2");
  });

  it("fails, naming stderr, when the check printed no report", async () => {
    fakes.scripts["check-render"] = { status: 1, stdout: "", stderr: "boom" };
    await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
      "check-render printed no report: boom",
    );
  });

  it("throws the spawn error when a process cannot be started", async () => {
    h.spawn.mockReturnValueOnce({ error: new Error("spawn git ENOENT") });
    await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
      "spawn git ENOENT",
    );
  });

  it("throws the spawn error when the check cannot be started", async () => {
    h.spawn.mockImplementation((cmd: string, args: string[]) =>
      args[0] === "scripts/check-render.ts"
        ? { error: new Error("spawn node EAGAIN") }
        : cmd === "git"
          ? ok(args[0] === "rev-parse" ? `${HEAD}\n` : "")
          : cmd.endsWith("remotion")
            ? (writeFileSync(args[2]!, "x"), { ...ok(), stdout: null })
            : ok(),
    );
    await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
      "spawn node EAGAIN",
    );
  });
});

describe("scripts/render.ts: a preview", () => {
  it("renders into out/<video>/preview on any renderer, checks it, and stops: no version, no store, no ledger", async () => {
    vi.stubEnv("MOTION_GL", "angle");
    fakes.status = " M a.ts\n";
    const r = await runScript(SCRIPT, [
      "pipeline-proof",
      "--preview-not-a-deliverable",
    ]);
    expect(r.code).toBe(0);
    expect(files("out/pipeline-proof/preview")).toEqual([
      "pipeline-proof-preview-not-a-deliverable.check.json",
      "pipeline-proof-preview-not-a-deliverable.mp4",
      "pipeline-proof-preview-not-a-deliverable.props.json",
    ]);
    expect(r.out).toContain("preview only, renderer angle");
    expect(
      scriptCalls().filter((c) => c.startsWith("scripts/store.ts")),
    ).toEqual([]);
    expect(calls.find((c) => c.cmd.endsWith("remotion"))!.args).toContain(
      "--overwrite=true",
    );
    expect(ledger()).toBe("");
  });

  it("can be rendered again over the same name", async () => {
    const argv = ["pipeline-proof", "--preview-not-a-deliverable"];
    expect((await runScript(SCRIPT, argv)).code).toBe(0);
    expect((await runScript(SCRIPT, argv)).code).toBe(0);
  });
});

describe("scripts/render.ts: a video without default props", () => {
  it("renders with just the --props given", async () => {
    mkdirSync(join(h.motion, "src/videos/plain"), { recursive: true });
    writeFileSync(join(h.motion, "src/videos/plain/audio.ts"), "");
    const r = await runScript(SCRIPT, ["plain", "--props", '{"x":2}']);
    expect(r.code).toBe(0);
    expect(JSON.parse(ledger().trim())).toMatchObject({
      video: "plain",
      props: { x: 2 },
    });
  });
});
