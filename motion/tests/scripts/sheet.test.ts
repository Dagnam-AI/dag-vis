import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
  new URL("../../scripts/sheet.ts", import.meta.url),
);

// motion/ is a temp tree (public/ and out/ are scratch). Remotion's bundler and
// renderer are stand-ins: no browser opens and nothing is bundled. The timing is
// the real pipeline-proof one (eight storyboard frames).
const h = vi.hoisted(() => ({
  motion: "",
  bundle: vi.fn(),
  openBrowser: vi.fn(),
  selectComposition: vi.fn(),
  renderStill: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));
vi.mock("@remotion/bundler", () => ({ bundle: h.bundle }));
vi.mock("@remotion/renderer", () => ({
  openBrowser: h.openBrowser,
  selectComposition: h.selectComposition,
  renderStill: h.renderStill,
}));

type Options = Record<string, unknown>;
let tmp: string;
let bundleDirs: string[];
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "sheet-")));
  h.motion = tmp;
  bundleDirs = [];
  for (const m of [
    h.bundle,
    h.openBrowser,
    h.selectComposition,
    h.renderStill,
    h.close,
  ])
    m.mockReset();
  h.close.mockResolvedValue(undefined);
  h.openBrowser.mockResolvedValue({ close: h.close });
  h.bundle.mockImplementation((o: Options) => {
    bundleDirs.push(o.outDir as string);
    return Promise.resolve("http://serve");
  });
  h.selectComposition.mockImplementation((o: Options) =>
    Promise.resolve({ id: o.id }),
  );
  // A still is a file on disk, as the real one would be.
  h.renderStill.mockImplementation((o: Options) => {
    writeFileSync(o.output as string, "png");
    return Promise.resolve();
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

const calls = (m: typeof h.renderStill): Options[] =>
  m.mock.calls.map((c) => c[0] as Options);

describe("scripts/sheet.ts", () => {
  it("renders every storyboard frame small, then the sheet over them, and prints the sheet's path", async () => {
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(0);
    const [name] = readdirSync(join(tmp, "out/pipeline-proof"));
    expect(name).toMatch(/^pipeline-proof-sheet-\d{8}-v1\.png$/);
    expect(r.out).toBe(join(tmp, "out/pipeline-proof", name!));

    const stills = calls(h.renderStill);
    expect(stills).toHaveLength(9);
    expect(stills.slice(0, 8).map((s) => s.frame)).toEqual([
      0, 24, 45, 75, 90, 135, 165, 179,
    ]);
    for (const s of stills.slice(0, 8))
      expect(s).toMatchObject({
        imageFormat: "png",
        scale: 0.25,
        serveUrl: "http://serve",
        inputProps: {},
      });
    expect(stills[8]).toMatchObject({ overwrite: false, output: r.out });

    // One browser for everything, one bundle that links public/ instead of copying it.
    expect(h.openBrowser).toHaveBeenCalledTimes(1);
    expect(h.openBrowser.mock.calls[0]).toEqual([
      "chrome",
      { chromiumOptions: { gl: "swangle" } },
    ]);
    expect(h.bundle).toHaveBeenCalledTimes(1);
    expect(h.bundle.mock.calls[0]?.[0]).toMatchObject({
      entryPoint: join(tmp, "src/index.ts"),
      publicDir: join(tmp, "public"),
      symlinkPublicDir: true,
    });
    const sheet = calls(h.selectComposition).at(-1)!;
    expect(sheet.id).toBe("sheet");
    const props = sheet.inputProps as {
      title: string;
      tiles: { src: string; caption: string }[];
      cols: number;
      tileWidth: number;
      tileHeight: number;
    };
    expect(props.title).toBe(
      "pipeline-proof storyboard (1920x1080 @ 30 fps, 6 s, swangle)",
    );
    expect(props.tiles).toHaveLength(8);
    expect(props.tiles[1]!.caption).toBe("0.80s - First swell in its release");
    expect(props.tiles[1]!.src).toMatch(
      /^generated\/sheet\/pipeline-proof-[^/]+\/01-f24\.png$/,
    );
    expect(props).toMatchObject({ cols: 4, tileWidth: 480, tileHeight: 270 });
  });

  it("passes --props to the video's composition and to every frame", async () => {
    await runScript(SCRIPT, ["pipeline-proof", "--props", '{"seed":9}']);
    expect(calls(h.selectComposition)[0]).toMatchObject({
      id: "pipeline-proof",
      inputProps: { seed: 9 },
    });
    for (const s of calls(h.renderStill).slice(0, 8))
      expect(s.inputProps).toEqual({ seed: 9 });
  });

  it("takes the next version, and leaves no scratch behind: frames, bundle folder, browser", async () => {
    await runScript(SCRIPT, ["pipeline-proof"]);
    await runScript(SCRIPT, ["pipeline-proof"]);
    expect(
      readdirSync(join(tmp, "out/pipeline-proof"))
        .sort()
        .map((f) => f.replace(/-\d{8}-/, "-D-")),
    ).toEqual([
      "pipeline-proof-sheet-D-v1.png",
      "pipeline-proof-sheet-D-v2.png",
    ]);
    expect(readdirSync(join(tmp, "public/generated/sheet"))).toEqual([]);
    expect(bundleDirs).toHaveLength(2);
    for (const dir of bundleDirs) expect(existsSync(dir)).toBe(false);
    expect(h.close).toHaveBeenCalledTimes(2);
  });

  it("cleans up, closes the browser and removes the empty output folder when a frame fails", async () => {
    h.renderStill.mockRejectedValueOnce(new Error("page crashed"));
    await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
      "page crashed",
    );
    expect(existsSync(join(tmp, "out/pipeline-proof"))).toBe(false);
    expect(readdirSync(join(tmp, "public/generated/sheet"))).toEqual([]);
    expect(existsSync(bundleDirs[0]!)).toBe(false);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it("does not remove an output folder that still holds an earlier sheet", async () => {
    mkdirSync(join(tmp, "out/pipeline-proof"), { recursive: true });
    writeFileSync(
      join(tmp, "out/pipeline-proof/pipeline-proof-sheet-20200101-v1.png"),
      "",
    );
    h.renderStill.mockRejectedValueOnce(new Error("page crashed"));
    await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
      "page crashed",
    );
    expect(readdirSync(join(tmp, "out/pipeline-proof"))).toHaveLength(1);
  });

  it("fails when the browser cannot open, without a bundle", async () => {
    h.openBrowser.mockRejectedValueOnce(new Error("no chrome"));
    await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
      "no chrome",
    );
    expect(h.bundle).not.toHaveBeenCalled();
  });

  describe("on SIGINT and SIGTERM", () => {
    const handlers = new Map<string, () => void>();
    beforeEach(() => {
      handlers.clear();
      vi.spyOn(process, "on").mockImplementation(((
        signal: string,
        fn: () => void,
      ) => {
        handlers.set(signal, fn);
        return process;
      }) as never);
    });

    it.each([
      ["SIGINT", 130],
      ["SIGTERM", 143],
    ])(
      "%s: cleans up, closes the browser, then exits %d",
      async (signal, code) => {
        await runScript(SCRIPT, ["pipeline-proof"]);
        const exit = vi
          .spyOn(process, "exit")
          .mockImplementation((() => undefined) as never);
        handlers.get(signal)!();
        await vi.waitFor(() => {
          expect(exit).toHaveBeenCalledWith(code);
        });
        expect(h.close).toHaveBeenCalledTimes(2); // the run's own, then the handler's
      },
    );

    it("exits without a browser to close when the signal comes before it opened", async () => {
      const exits: unknown[] = [];
      h.openBrowser.mockImplementationOnce(async () => {
        // The run's own process.exit stub would throw inside the handler's promise; collect instead.
        vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
          exits.push(code);
        }) as never);
        handlers.get("SIGINT")!();
        // Let the handler's promise settle while the stub is in place.
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw new Error("interrupted");
      });
      await expect(runScript(SCRIPT, ["pipeline-proof"])).rejects.toThrow(
        "interrupted",
      );
      expect(exits).toEqual([130]);
      expect(h.close).not.toHaveBeenCalled();
    });
  });

  it.each([
    [[], "a video name"],
    [["pipeline-proof", "--crf", "1"], "unknown option --crf"],
    [["pipeline-proof", "--props"], "--props needs a JSON object"],
    [["a", "b"], "unexpected extra argument b"],
  ])("exits 1 with the usage line for %j", async (argv, message) => {
    const r = await runScript(SCRIPT, argv);
    expect(r.code).toBe(1);
    expect(r.err).toContain(message);
    expect(r.err).toContain(
      "usage: node scripts/sheet.ts <video> [--props <json>]",
    );
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("refuses to run from another folder", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tmp);
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(`not ${tmp}`);
  });

  it("refuses on Windows, which cannot link public/", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("sheet.ts needs symlinks (macOS/Linux)");
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("fails on a video with no timing, before a browser opens", async () => {
    await expect(runScript(SCRIPT, ["no-such-video"])).rejects.toThrow();
    expect(h.openBrowser).not.toHaveBeenCalled();
  });
});
