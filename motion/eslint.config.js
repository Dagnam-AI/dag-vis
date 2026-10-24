// Run from the repository root:
//   npx eslint --config motion/eslint.config.js motion
// The root config (type-checked rules, prettier) minus its global ignore of
// motion/**, plus the motion layering rules.
import tseslint from "typescript-eslint";

import root from "../eslint.config.js";

const rootWithoutIgnores = root.filter(
  (c) => !(Object.keys(c).length === 1 && "ignores" in c),
);

// `from` = the fewest `../` that can already leave motion/ for the library's
// src/. A test mirrors motion/src with a relative path, so for files in
// motion/tests/<k dirs> the first k+1 levels are motion's own src and only
// deeper ones are the library's; everything under motion/src and motion/scripts
// reaches the library through the alias from the first level.
const relativeSrc = (from = 1) => ({
  group: [
    ...[1, 2, 3, 4, 5, 6]
      .filter((n) => n >= from)
      .map((n) => `${"../".repeat(n)}src/*`),
    "**/dist/**",
  ],
  message:
    "Reach the library through the `@dagnam/vis` alias, never a relative path into src/ or dist/.",
});
const RELATIVE_SRC = relativeSrc();
const SUBPATHS = {
  group: ["@dagnam/vis/*", "!@dagnam/vis/animate"],
  message:
    "motion imports `@dagnam/vis` and `@dagnam/vis/animate` only: /react is another React tree, /node is for consumers.",
};

export default tseslint.config(
  { ignores: ["motion/node_modules/**", "motion/out/**", "motion/public/**"] },
  ...rootWithoutIgnores,
  {
    files: ["motion/**/*.ts", "motion/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [RELATIVE_SRC, SUBPATHS] },
      ],
    },
  },
  ...[0, 1, 2, 3].map((depth) => ({
    // motion/tests/<depth dirs>/x.ts: `../`*(depth+1) + src is motion's own src (what the test mirrors).
    files: [
      `motion/tests/${"*/".repeat(depth)}*.ts`,
      `motion/tests/${"*/".repeat(depth)}*.tsx`,
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [relativeSrc(depth + 2), SUBPATHS] },
      ],
    },
  })),
  {
    // Pure stratum: runs under plain `node` for the check scripts, so no alias, no React, no Remotion.
    // sigv4.ts is the one exception (node:crypto, scripts only; see the next block).
    files: ["motion/src/lib/**/*.ts"],
    ignores: ["motion/src/lib/sigv4.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            RELATIVE_SRC,
            SUBPATHS,
            {
              group: [
                "@dagnam/vis",
                "@dagnam/vis/animate",
                "remotion",
                "@remotion/*",
                "react",
                "react-dom",
                "node:*",
              ],
              message: "motion/src/lib is pure: siblings only.",
            },
          ],
        },
      ],
    },
  },
  {
    // Same stratum rules as above, except node:crypto: SigV4 signing for the R2 upload.
    // Only scripts/ imports this file; tests/structure.test.ts keeps it out of the Remotion bundle.
    files: ["motion/src/lib/sigv4.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            RELATIVE_SRC,
            SUBPATHS,
            {
              group: [
                "@dagnam/vis",
                "@dagnam/vis/animate",
                "remotion",
                "@remotion/*",
                "react",
                "react-dom",
                "node:*",
                "!node:crypto",
              ],
              message:
                "motion/src/lib is pure: siblings only, plus node:crypto in sigv4.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["motion/eslint.config.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: [
      "motion/tests/**/*.ts",
      "motion/tests/**/*.tsx",
      "motion/vitest.config.ts",
    ],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
