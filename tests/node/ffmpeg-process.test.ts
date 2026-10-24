import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { runFfmpeg } from "../../src/node/ffmpeg.js";

// runFfmpeg against REAL child processes (this Node binary stands in for
// ffmpeg), because a mocked stream cannot reproduce a pipe that fills, a
// reader that exits early or a process that must be killed and reaped.

const NODE = process.execPath;
const work = mkdtempSync(join(tmpdir(), "dag-vis-ffmpeg-"));
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const script = (source: string): string[] => ["-e", source];
const MB = 1 << 20;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("runFfmpeg with a real process", () => {
  it("delivers every byte to a slow reader (backpressure), from a sync iterable", async () => {
    // Reads nothing for 300 ms, so the pipe fills and writes must wait for drain.
    const reader = `
      let n = 0;
      process.stdin.pause();
      setTimeout(() => process.stdin.resume(), 300);
      process.stdin.on("data", (d) => { n += d.length; });
      process.stdin.on("end", () => {
        if (n !== Number(process.argv[1])) { console.error("received " + n); process.exit(2); }
      });`;
    const frames = Array.from({ length: 8 }, () => new Uint8Array(MB));
    await runFfmpeg([...script(reader), String(8 * MB)], frames, NODE);
  }, 30_000);

  it("holds back the frame source while the reader is stalled", async () => {
    const reader = `
      process.stdin.pause();
      setTimeout(() => process.stdin.resume(), 600);
      process.stdin.on("data", () => {});`;
    const pulledBeforeDrain: number[] = [];
    let pulled = 0;
    const started = Date.now();
    async function* frames() {
      for (let i = 0; i < 40; i++) {
        await Promise.resolve();
        pulled += 1;
        if (Date.now() - started < 400) pulledBeforeDrain.push(pulled);
        yield new Uint8Array(MB);
      }
    }
    await runFfmpeg(script(reader), frames(), NODE);
    expect(pulled).toBe(40);
    // 40 MB is never queued up front: only a few frames fit before the reader wakes.
    expect(Math.max(0, ...pulledBeforeDrain)).toBeLessThan(10);
  }, 30_000);

  it("survives ffmpeg exiting early (EPIPE), stops pulling frames and closes the source", async () => {
    let produced = 0;
    let closed = false;
    async function* frames() {
      try {
        for (let i = 0; i < 200; i++) {
          await Promise.resolve();
          produced += 1;
          yield new Uint8Array(MB);
        }
      } finally {
        closed = true;
      }
    }
    await runFfmpeg(script("process.exit(0)"), frames(), NODE);
    expect(closed).toBe(true);
    expect(produced).toBeLessThan(200);
  }, 30_000);

  it("rejects with the exit code and the last stderr line, after an early exit too", async () => {
    const failing = script(
      'console.error("start\\nboom: bad option"); process.exit(3)',
    );
    const frames = Array.from({ length: 50 }, () => new Uint8Array(MB));
    const error = await runFfmpeg(failing, frames, NODE).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(VisError);
    expect((error as VisError).message).toBe(
      "ffmpeg exited with 3: boom: bad option",
    );
  }, 30_000);

  it("reports a process killed by a signal", async () => {
    await expect(
      runFfmpeg(script('process.kill(process.pid, "SIGKILL")'), [], NODE),
    ).rejects.toThrow(/ffmpeg was killed by SIGKILL/);
  });

  it("rejects, never hangs, when the binary does not exist (ENOENT)", async () => {
    const missing = join(work, "no-such-ffmpeg");
    const error = await runFfmpeg(
      [],
      [new Uint8Array(MB), new Uint8Array(MB)],
      missing,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisError);
    expect((error as VisError).message).toMatch(
      /could not start ffmpeg .*ENOENT/,
    );
  });

  it("does not interpret arguments: shell metacharacters reach the child verbatim", async () => {
    const hostile = ["$(touch pwned)", "; echo pwned", "`id`", "a b", "*"];
    const check = `
      const want = ${JSON.stringify(hostile)};
      const got = process.argv.slice(1);
      process.exit(JSON.stringify(got) === JSON.stringify(want) ? 0 : 4);`;
    await runFfmpeg([...script(check), ...hostile], [], NODE);
    expect(existsSync(join(process.cwd(), "pwned"))).toBe(false);
  });

  it("kills and reaps the child, then rethrows, when the frame source throws mid-stream", async () => {
    const pidFile = join(work, "child.pid");
    const sleeper = `
      require("node:fs").writeFileSync(process.argv[1], String(process.pid));
      process.stdin.resume();
      setInterval(() => {}, 1000);`;
    const boom = new Error("render failed");
    async function* frames() {
      yield new Uint8Array(16);
      for (
        let i = 0;
        i < 500 && !(existsSync(pidFile) && readFileSync(pidFile, "utf8"));
        i++
      )
        await new Promise((r) => setTimeout(r, 20));
      throw boom;
    }
    await expect(
      runFfmpeg([...script(sleeper), pidFile], frames(), NODE),
    ).rejects.toBe(boom);
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(pid).toBeGreaterThan(0);
    expect(alive(pid)).toBe(false);
  }, 30_000);
});
