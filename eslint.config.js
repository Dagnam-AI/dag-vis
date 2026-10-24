import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

// One-directional layering: core <- brand <- gradient/pattern
// <- scene <- node, with field (core only), export (core only: the DOM-free
// encoders, imported by animate and node), animate (core, scene, field, export)
// and react (core, animate, gradient) beside them as separate entry points. The
// root barrel and animate import field; the ALLOWED map and these lists widen
// together when another layer does. Each layer
// lists what it must NOT import; tests/structure.test.ts asserts the same map
// from the import graph, so a rule edited here without the test fails loudly.
// `browserSafe` layers additionally may not touch Node built-ins, Node globals
// or the native rasteriser (dependency weight rule). Both
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
            message: `src/${layer} must not import from src/${g} (layer order: core <- brand <- gradient,pattern <- scene <- node; field, animate and react are separate entries).`,
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
    "field",
    "export",
    "animate",
    "react",
    "node",
  ]),
  forbid("brand", [
    "gradient",
    "pattern",
    "scene",
    "field",
    "export",
    "animate",
    "react",
    "node",
  ]),
  forbid("gradient", [
    "pattern",
    "scene",
    "field",
    "export",
    "animate",
    "react",
    "node",
  ]),
  forbid("pattern", [
    "gradient",
    "scene",
    "field",
    "export",
    "animate",
    "react",
    "node",
  ]),
  forbid("scene", ["field", "export", "animate", "react", "node"]),
  // field -> core only (the DOM-free field renderer and its spec).
  forbid("field", [
    "brand",
    "gradient",
    "pattern",
    "scene",
    "export",
    "animate",
    "react",
    "node",
  ]),
  // export -> core only: the DOM-free encoders (crc32, zip, GIF, limits). The
  // third-party encoders load only through this layer, never from the root.
  forbid("export", [
    "brand",
    "gradient",
    "pattern",
    "scene",
    "field",
    "animate",
    "react",
    "node",
  ]),
  // animate -> core, scene (ribbonCurves), field (the live field effect), export
  // (the encoders). The structure test's ALLOWED map and these lists widen together.
  forbid("animate", ["brand", "gradient", "pattern", "react", "node"]),
  // react -> core, animate, gradient.
  forbid("react", ["brand", "pattern", "scene", "field", "export", "node"]),
  forbid("node", ["field", "animate", "react"], false),
  {
    // The root barrel is browser-safe and DOM-free: nothing from node/, react/ or animate/, no Node APIs.
    files: ["src/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "./node/*",
                "./node",
                "./react/*",
                "./react",
                "./animate/*",
                "./animate",
                "./export/*",
                "./export",
              ],
              message:
                "The root barrel stays browser-safe and DOM-free and loads no third-party code: export, animate, react and node are separate.",
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
