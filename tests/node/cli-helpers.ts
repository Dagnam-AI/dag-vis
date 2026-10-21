import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach } from "vitest";

import type { CliIo } from "../../src/node/cli.js";

export interface Captured {
  out: string[];
  err: string[];
  io: CliIo;
}

/** An in-memory CliIo recording everything written to stdout and stderr. */
export function capture(): Captured {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) },
  };
}

/** A fresh temp dir per test (the only place CLI tests write), removed afterwards. */
export function useTempDir(): () => string {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dag-vis-cli-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return () => dir;
}
