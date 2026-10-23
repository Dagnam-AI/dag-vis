import { defineConfig } from "vitest/config";

// Hard gate, same as dag-contracts/npm and dag-lib: 100% on every metric,
// pinned here so `npm run check` is the enforcement (the private repos have no
// paid CI; this one is public, so CI runs too, but the floor lives in the gate).
//
// COVERAGE_SCOPE='src/core/**' narrows `include` for a per-task run that must
// still hit 100% for that scope; the full run uses the whole tree.
const scope = process.env.COVERAGE_SCOPE;

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: scope ? [scope] : ["src/**/*.ts", "src/**/*.tsx"],
      reporter: ["text", "html", "json"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
