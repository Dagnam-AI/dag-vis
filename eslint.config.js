import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

// One-directional layering (spec section 4): core <- brand <- gradient/pattern
// <- scene <- node (animate/react are added by the animation plan). Each layer
// lists what it must NOT import; tests/structure.test.ts asserts the same map
// from the import graph, so a rule edited here without the test fails loudly.
// `browserSafe` layers additionally may not touch Node built-ins, Node globals
// or the native rasteriser (spec section 8, dependency weight rule). Both
// constraints live in ONE no-restricted-imports entry per layer because eslint
// keeps only the last matching config for a rule.
const forbid = (layer, groups, browserSafe = true) => ({
  files: [`src/${layer}/**/*.ts`, `src/${layer}/**/*.tsx`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...groups.map((g) => ({
            group: [`**/${g}/**`, `**/${g}`],
            message: `src/${layer} must not import from src/${g} (layer order: core <- brand <- gradient,pattern <- scene <- node).`,
          })),
          ...(browserSafe
            ? [
                {
                  group: ["node:*", "@resvg/resvg-js"],
                  message: "Browser-safe layers cannot use Node APIs.",
                },
              ]
            : []),
        ],
      },
    ],
    ...(browserSafe
      ? {
          "no-restricted-globals": [
            "error",
            "process",
            "Buffer",
            "require",
            "__dirname",
          ],
        }
      : {}),
  },
});

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "bin/**",
      "demo/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  forbid("core", [
    "brand",
    "gradient",
    "pattern",
    "scene",
    "animate",
    "react",
    "node",
  ]),
  forbid("brand", ["gradient", "pattern", "scene", "animate", "react", "node"]),
  forbid("gradient", ["pattern", "scene", "animate", "react", "node"]),
  forbid("pattern", ["gradient", "scene", "animate", "react", "node"]),
  forbid("scene", ["animate", "react", "node"]),
  // animate -> core, scene (ribbonCurves). Added by the animation plan, spec section 7.
  forbid("animate", ["brand", "gradient", "pattern", "react", "node"]),
  // react -> core, animate, gradient. Added by the animation plan, spec section 7.
  forbid("react", ["brand", "pattern", "scene", "node"]),
  forbid("node", ["animate", "react"], false),
  {
    // The root barrel is browser-safe: nothing from node/ or react/, no Node APIs.
    files: ["src/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./node/*", "./node", "./react/*", "./react"],
              message: "The root barrel stays browser-safe.",
            },
            {
              group: ["node:*", "@resvg/resvg-js"],
              message: "Browser-safe layers cannot use Node APIs.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        "process",
        "Buffer",
        "require",
        "__dirname",
      ],
    },
  },
  {
    files: [
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "eslint.config.js",
      "vitest.config.ts",
    ],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["eslint.config.js", "scripts/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier,
);
