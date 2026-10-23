#!/usr/bin/env node
// Thin entry so src/node/cli.ts stays a pure, fully tested function.
import { run } from "../dist/node/cli.js";

process.exitCode = await run(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
});
