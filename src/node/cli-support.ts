import { constants } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";
import type { Parsed } from "./cli-args.js";
import { parseNumber } from "./cli-args.js";
import { messageOf, writeAtomic } from "./util.js";

export interface CliIo {
  stdout(s: string): void;
  stderr(s: string): void;
}

export type Options = ReadonlyMap<string, string>;

/** The value of a required option; an empty one is as wrong as a missing one. */
export function required(opts: Options, name: string): string {
  const v = opts.get(name);
  if (v === undefined) throw new VisError(`--${name} is required`);
  if (v === "") throw new VisError(`--${name} must not be empty`);
  return v;
}

export function numeric(opts: Options, name: string): number | undefined {
  const raw = opts.get(name);
  return raw === undefined ? undefined : parseNumber(name, raw);
}

export function requiredNumeric(opts: Options, name: string): number {
  return parseNumber(name, required(opts, name));
}

/** Rethrows a filesystem failure as a VisError: `<what>: <system message>`. */
const failWith =
  (what: string) =>
  (error: unknown): never => {
    throw new VisError(`${what}: ${messageOf(error)}`);
  };

/** Largest spec file read; a spec is a few hundred bytes in practice. */
const MAX_SPEC_BYTES = 1024 * 1024;

/**
 * Reads a spec file as JSON (`JSON.parse` only, never evaluated). The path is
 * user input: it must be a regular file (a directory, device or FIFO would
 * fail or block) of at most MAX_SPEC_BYTES, and hold a JSON object. The
 * generators validate the object's contents. The file is opened first, without
 * blocking (a FIFO with no writer would otherwise hang the open), and the
 * OPENED file is checked, so it cannot be swapped between the check and the read.
 */
export async function readSpec(path: string): Promise<object> {
  const fail = failWith(`could not read ${path}`);
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK,
  ).catch(fail);
  const buffer = Buffer.alloc(MAX_SPEC_BYTES + 1);
  try {
    const info = await handle.stat().catch(fail);
    if (!info.isFile()) throw new VisError(`${path} is not a regular file`);
    const { bytesRead } = await handle
      .read(buffer, 0, buffer.length, 0)
      .catch(fail);
    if (bytesRead > MAX_SPEC_BYTES)
      throw new VisError(`${path} is larger than 1 MiB`);
    return parseSpec(path, buffer.toString("utf8", 0, bytesRead));
  } finally {
    await handle.close();
  }
}

/** `text` as a JSON object, or a VisError naming `path`. */
function parseSpec(path: string, text: string): object {
  let spec: unknown;
  try {
    spec = JSON.parse(text.startsWith("﻿") ? text.slice(1) : text);
  } catch (error) {
    throw new VisError(`invalid JSON in ${path}: ${messageOf(error)}`);
  }
  if (typeof spec !== "object" || spec === null || Array.isArray(spec))
    throw new VisError(
      `${path} must contain a JSON object, got ${Array.isArray(spec) ? "an array" : describeValue(spec)}`,
    );
  return spec;
}

/**
 * Writes `data` to `path` through a temp file in the same directory and a
 * rename, so a failure never leaves a truncated file under the real name.
 * Missing parent directories are created. The rename replaces the target (a
 * symlink is replaced, never written through); a directory there is refused.
 */
export async function writeOut(
  path: string,
  data: Buffer | string,
): Promise<void> {
  const wrap = (error: unknown): VisError =>
    new VisError(`could not write ${path}: ${messageOf(error)}`);
  if ((await stat(path).catch(() => undefined))?.isDirectory())
    throw new VisError(`could not write ${path}: it is a directory`);
  await mkdir(dirname(path), { recursive: true }).catch((error: unknown) => {
    throw wrap(error);
  });
  await writeAtomic(path, data, wrap);
}

export interface Command {
  options: readonly string[];
  /** Options that take no value (`--loop`); default none. */
  flags?: readonly string[];
  /** How many positional arguments the command takes; default none. */
  positionals?: number;
  run(opts: Options, io: CliIo, parsed: Parsed): Promise<void>;
}
