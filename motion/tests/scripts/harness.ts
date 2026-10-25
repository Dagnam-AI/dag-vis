// In-process driver for scripts/*.ts: a script is top-level code that reads
// process.argv and calls process.exit, so it is imported fresh per run with
// both stubbed. Coverage counts the lines it executes (a spawned child's are not).
import { vi } from "vitest";

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

export async function runScript(
  path: string,
  argv: readonly string[],
): Promise<Result> {
  vi.resetModules();
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
    await import(path);
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
