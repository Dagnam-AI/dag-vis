// Run from the repository root:
//   npx eslint --config motion/eslint.config.js motion
// The root config (type-checked rules, prettier) minus its global ignore of
// motion/**, plus the motion layering rules.
import tseslint from "typescript-eslint";

import root from "../eslint.config.js";

const rootWithoutIgnores = root.filter(
  (c) => !(Object.keys(c).length === 1 && "ignores" in c),
);

const RELATIVE_SRC = {
  group: ["../../src/*", "../../../src/*", "../../../../src/*", "**/dist/**"],
  message:
    "Reach the library through the `@dagnam/vis` alias, never a relative path into src/ or dist/.",
};
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
