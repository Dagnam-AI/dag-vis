import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Same floor as the root: 100% on every metric. `include` IS the scope decision:
// pure logic (src/lib) and the bridge (src/bridge) are covered; composition
// visuals (src/videos, src/sheet, Root.tsx, index.ts) are judged on the
// storyboard and the rendered frames, not by line coverage, so they are not
// listed here. No ignore comments anywhere.
export default defineConfig({
  resolve: {
    // Regex finds, animate first: a plain string alias "@dagnam/vis" would also rewrite "@dagnam/vis/animate".
    alias: [
      {
        find: /^@dagnam\/vis\/animate$/,
        replacement: fileURLToPath(
          new URL("../src/animate/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@dagnam\/vis$/,
        replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/bridge/**/*.ts", "src/bridge/**/*.tsx"],
      reporter: ["text"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
