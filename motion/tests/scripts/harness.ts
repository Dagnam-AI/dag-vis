// In-process driver for scripts/*.ts: a script is top-level code that reads
// process.argv and calls process.exit, so it is imported fresh per run with
// both stubbed. Coverage counts the lines it executes (a spawned child's are not).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { vi } from "vitest";

import { sha256Hex } from "../../src/lib/sigv4.ts";

/** What the stubbed process.exit throws, so the script stops where it would have exited. */
export class ExitError extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${String(code)})`);
  }
}

export interface Result {
  /** The exit code: process.exit's argument, else process.exitCode, else 0. */
  code: number;
  out: string;
  err: string;
}

// A function, so the value is read after the script ran, not narrowed from the reset above.
const exitCodeNow = (): number => Number(process.exitCode ?? 0);

let runs = 0;

/**
 * Runs the script once. The module cache is reset first, so every module the
 * script imports is fresh (and reads the environment as the test set it); with
 * `shared` only the script itself is fresh, so a class a test imports (an error
 * the script checks with instanceof) is the script's own.
 */
export async function runScript(
  path: string,
  argv: readonly string[],
  { shared = false }: { shared?: boolean } = {},
): Promise<Result> {
  if (!shared) vi.resetModules();
  const out: string[] = [];
  const err: string[] = [];
  const spies = [
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    }),
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      err.push(a.map(String).join(" "));
    }),
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitError(Number(code ?? 0));
    }),
  ];
  const savedArgv = process.argv;
  const savedExitCode = process.exitCode;
  process.argv = [process.argv[0] ?? "node", path, ...argv];
  process.exitCode = undefined;
  let code: number;
  try {
    await import(shared ? `${path}?run=${String((runs += 1))}` : path);
    code = exitCodeNow();
  } catch (e) {
    if (!(e instanceof ExitError)) throw e;
    code = e.code;
  } finally {
    process.argv = savedArgv;
    process.exitCode = savedExitCode;
    for (const s of spies) s.mockRestore();
  }
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export interface Render {
  mp4: string;
  /** The three files `store` handles, mp4 first. */
  files: string[];
  sha256: string;
  name: string;
}

/**
 * A finished render of `video` under `<motion>/out/<video>/`, as render.ts leaves
 * it, and its line in `<motion>/RENDERS.jsonl`. `problems` goes into the check record.
 */
export function writeRender(
  motion: string,
  video: string,
  problems: string[] = [],
): Render {
  const name = `${video}-20261023-v1.mp4`;
  const dir = join(motion, "out", video);
  mkdirSync(dir, { recursive: true });
  const mp4 = join(dir, name);
  const bytes = Buffer.from(`pretend mp4 of ${video}`);
  writeFileSync(mp4, bytes);
  const stem = mp4.replace(/\.mp4$/, "");
  writeFileSync(`${stem}.props.json`, '{"seed":1}\n');
  writeFileSync(
    `${stem}.check.json`,
    `${JSON.stringify({ problems, renderer: "swangle" })}\n`,
  );
  const sha256 = sha256Hex(bytes);
  writeFileSync(
    join(motion, "RENDERS.jsonl"),
    `${JSON.stringify({
      video,
      file: `out/${video}/${name}`,
      sha256,
      stored: { local: `${video}/${name}`, r2: null },
    })}\n`,
  );
  return {
    mp4,
    files: [mp4, `${stem}.props.json`, `${stem}.check.json`],
    sha256,
    name,
  };
}
