import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "..", "scripts", "vendor-muxers.mjs");
const VIDEO =
  'const a = await import("mp4-muxer");\nconst b = await import("webm-muxer");\n';
const MUXER = "export class Muxer {}\n";
const dirs: string[] = [];

/** A fake dist + node_modules pair; `video` and per-package source overrides vary per test. */
function setup(video = VIDEO, sources: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vendor-muxers-"));
  dirs.push(dir);
  const dist = join(dir, "dist");
  const modules = join(dir, "node_modules");
  mkdirSync(join(dist, "export"), { recursive: true });
  writeFileSync(join(dist, "export", "video.js"), video);
  for (const name of ["mp4-muxer", "webm-muxer"]) {
    mkdirSync(join(modules, name, "build"), { recursive: true });
    writeFileSync(
      join(modules, name, "build", `${name}.mjs`),
      sources[name] ?? MUXER,
    );
  }
  const run = () =>
    spawnSync(process.execPath, [SCRIPT, dist, modules], { encoding: "utf8" });
  return { dist, run };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("scripts/vendor-muxers.mjs", () => {
  it("copies both muxers into dist/export/vendor and repoints the dynamic imports", () => {
    const { dist, run } = setup();
    const r = run();
    expect(r.status).toBe(0);
    const video = readFileSync(join(dist, "export", "video.js"), "utf8");
    expect(video).toContain('import("./vendor/mp4-muxer.mjs")');
    expect(video).toContain('import("./vendor/webm-muxer.mjs")');
    expect(video).not.toMatch(/import\("(mp4|webm)-muxer"\)/);
    expect(
      readFileSync(join(dist, "export", "vendor", "webm-muxer.mjs"), "utf8"),
    ).toBe(MUXER);
  });

  it("fails when video.js has no specifier for a muxer", () => {
    const r = setup('const a = await import("mp4-muxer");\n').run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('no import("webm-muxer")');
  });

  it("fails when a vendored file keeps a bare import", () => {
    const r = setup(VIDEO, {
      "webm-muxer": 'import x from "left-pad";\n',
    }).run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("still has a bare import");
  });

  it("fails when a muxer build is missing", () => {
    const { dist, run } = setup();
    rmSync(join(dist, "..", "node_modules", "mp4-muxer"), { recursive: true });
    expect(run().status).not.toBe(0);
  });

  it("resolves the muxers from the repo's own node_modules when only a dist is given", () => {
    const { dist } = setup();
    const r = spawnSync(process.execPath, [SCRIPT, dist], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(
      readFileSync(join(dist, "export", "vendor", "mp4-muxer.mjs"), "utf8"),
    ).toContain("ArrayBufferTarget");
  });
});
