// Run from the repository root:
//   npx eslint --config motion/eslint.config.js motion
// The root config (type-checked rules, prettier) minus its global ignore of
// motion/**, plus the motion layering rules.
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tseslint from "typescript-eslint";

import root from "../eslint.config.js";

const rootWithoutIgnores = root.filter(
  (c) => !(Object.keys(c).length === 1 && "ignores" in c),
);

const ROOT = resolve(import.meta.dirname, "..");
const LIBRARY_SRC = join(ROOT, "src");
const LIBRARY_DIST = join(ROOT, "dist");
const MOTION_LIB = join(ROOT, "motion", "src", "lib");

const inside = (target, dir) => {
  const rel = relative(dir, target);
  return rel.split(/[\\/]/)[0] !== ".." && !isAbsolute(rel);
};

// A relative, absolute or file: specifier as the file it names, or undefined for a package name.
const resolveSpec = (file, spec) => {
  if (spec.startsWith("file:")) return fileURLToPath(spec);
  if (spec.startsWith(".") || isAbsolute(spec))
    return resolve(dirname(file), spec);
  return undefined;
};

// Resolution-based boundary, independent of how deep the importing file is or
// how the path is spelled (`./../..`, `a/../b`): no motion file may name a file
// of the library's own src/ or dist/ (it goes through the `@dagnam/vis` alias),
// and motion/src/lib may name only its own siblings. tests/structure.test.ts
// makes the same decision and is the authoritative gate; this reports it at edit
// time. Only string-literal specifiers can be resolved (a computed
// `import(x)` or `createRequire(...)` call is invisible to both).
const boundary = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      library:
        "Reach the library through the `@dagnam/vis` alias, never a path into its src/ or dist/ ({{ spec }}).",
      lib: "motion/src/lib is pure: it imports only its own siblings ({{ spec }}).",
    },
  },
  create(context) {
    const file = context.filename;
    const inLib = inside(file, MOTION_LIB);
    const check = (node, spec) => {
      if (typeof spec !== "string") return;
      const target = resolveSpec(file, spec);
      if (target === undefined) return;
      const messageId =
        inside(target, LIBRARY_SRC) || inside(target, LIBRARY_DIST)
          ? "library"
          : inLib && !inside(target, MOTION_LIB)
            ? "lib"
            : undefined;
      if (messageId) context.report({ node, messageId, data: { spec } });
    };
    return {
      ImportDeclaration: (n) => check(n, n.source.value),
      ExportAllDeclaration: (n) => check(n, n.source.value),
      ExportNamedDeclaration: (n) => check(n, n.source?.value),
      ImportExpression: (n) => check(n, n.source.value),
      TSImportType: (n) => check(n, n.source.value),
      TSExternalModuleReference: (n) => check(n, n.expression.value),
    };
  },
};

const DIST = {
  group: ["**/dist/**"],
  message:
    "Reach the library through the `@dagnam/vis` alias, never a path into dist/.",
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
      "no-restricted-imports": ["error", { patterns: [DIST, SUBPATHS] }],
    },
  },
  {
    files: ["motion/**/*.{ts,tsx,mts,js,mjs,jsx}"],
    plugins: { "motion-local": { rules: { boundary } } },
    rules: { "motion-local/boundary": "error" },
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
            DIST,
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
            DIST,
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
