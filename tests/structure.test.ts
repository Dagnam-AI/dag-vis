import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ROOT,
  SRC,
  importSpecifiers,
  inside,
  resolveSpec,
  walk,
} from "./helpers/structure.js";

// Mirrors eslint.config.js. Key: layer; value: layers it MAY import.
const ALLOWED: Record<string, readonly string[]> = {
  core: [],
  brand: ["core"],
  gradient: ["core", "brand"],
  pattern: ["core", "brand"],
  scene: ["core", "brand", "gradient", "pattern"],
  field: ["core"],
  export: ["core"],
  animate: ["core", "scene", "field", "export"],
  // react -> field: `<VisBackground effect="field">` types `options.spec` as `FieldSpec`; `<FieldPresetPicker>` draws `renderField` frames.
  react: ["core", "animate", "field", "gradient"],
  node: ["core", "brand", "gradient", "pattern", "scene", "field", "export"],
};

const sources = walk(SRC).filter((p) => /\.tsx?$/.test(p));
const layerOf = (p: string): string => relative(SRC, p).split("/")[0]!;

describe("repository structure", () => {
  it("has at least one source file", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("scans every import spelling, including TS require and a block comment holding a star", () => {
    const specs = importSpecifiers;
    expect(specs('import a from "a"; import "b"; export * from "c";')).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(specs('const m = await import(/* * a * star */ "d");')).toEqual([
      "d",
    ]);
    expect(specs('const m = await import(\n// why\n"e");')).toEqual(["e"]);
    expect(specs('import fs = require("node:fs");')).toEqual(["node:fs"]);
    expect(specs("import x = require('f')")).toEqual(["f"]);
  });

  it("scans the other import spellings and keeps multi-line, quote and template forms", () => {
    expect(importSpecifiers('import type { T } from "a";')).toEqual(["a"]);
    expect(importSpecifiers('export { x } from "b";')).toEqual(["b"]);
    expect(importSpecifiers('import {\n  a,\n  b,\n} from\n  "c";')).toEqual([
      "c",
    ]);
    expect(importSpecifiers("import(`d`) + import('e')")).toEqual(["d", "e"]);
    expect(importSpecifiers('import(/* a */ // b\n /* c */ "f")')).toEqual([
      "f",
    ]);
    // A template literal that merely looks like an import is still read (fails closed).
    expect(importSpecifiers('const s = `import "g"`;')).toEqual(["g"]);
    // Not imports: a bare `require` word, `import.meta`, an unterminated string or comment.
    expect(importSpecifiers('const require = "h"; import.meta.url;')).toEqual(
      [],
    );
    expect(importSpecifiers('import "unterminated')).toEqual([]);
    expect(importSpecifiers('import /* never closed "i"')).toEqual([]);
    expect(importSpecifiers('import // no newline "j"')).toEqual([]);
    expect(importSpecifiers('import ""; from "it\'s"')).toEqual([]);
  });

  it("scans adversarial input in linear time", () => {
    // The previous single regex backtracked exponentially on `from/*` followed by many `*/ /*`.
    const inputs = [
      "from/*" + "*/ /*".repeat(50_000),
      "from /*".repeat(50_000),
      "import ".repeat(50_000) + '"x"',
      'from "'.repeat(50_000),
      "from //\n".repeat(50_000),
      "= ".repeat(50_000) + "require",
    ];
    for (const input of inputs) {
      const start = performance.now();
      importSpecifiers(input);
      expect(performance.now() - start).toBeLessThan(1000);
    }
  });

  it("walk skips the named folders at the top only", () => {
    const tmp = mkdtempSync(join(tmpdir(), "walk-"));
    try {
      for (const f of ["node_modules/a.ts", "src/node_modules/b.ts", "c.ts"]) {
        mkdirSync(dirname(join(tmp, f)), { recursive: true });
        writeFileSync(join(tmp, f), "");
      }
      expect(
        walk(tmp, ["node_modules"])
          .map((p) => relative(tmp, p))
          .sort(),
      ).toEqual(["c.ts", join("src", "node_modules", "b.ts")]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(sources)("%s imports only leftwards in the layer order", (file) => {
    const text = readFileSync(file, "utf8");
    const layer = layerOf(file);
    const allowed = layer.includes(".")
      ? Object.keys(ALLOWED)
      : ALLOWED[layer]!;
    for (const spec of importSpecifiers(text)) {
      const target = resolveSpec(file, spec);
      if (target === undefined) continue;
      // A specifier that resolves outside src/ (e.g. into motion/) is a layering break, not a skip.
      expect(
        inside(target, SRC),
        `${relative(ROOT, file)} imports outside src/: ${spec}`,
      ).toBe(true);
      const targetLayer = layerOf(target);
      if (targetLayer === layer || targetLayer.includes(".")) continue;
      expect(allowed, `${relative(ROOT, file)} -> ${spec}`).toContain(
        targetLayer,
      );
    }
    if (layer !== "node" && !layer.includes(".")) {
      for (const spec of importSpecifiers(text))
        expect(
          spec.startsWith("node:"),
          `${relative(ROOT, file)} uses the Node import ${spec}`,
        ).toBe(false);
    }
  });

  it("the root barrel imports nothing from export, animate, react or node", () => {
    // Their types name HTMLCanvasElement or React, so the root would stop
    // type-checking in a DOM-free consumer; export loads the third-party
    // encoders, which the root entry must never pull in. They are separate
    // entry points.
    const text = readFileSync(join(SRC, "index.ts"), "utf8");
    for (const layer of ["export", "animate", "react", "node"])
      expect(text, `src/index.ts imports ./${layer}`).not.toMatch(
        new RegExp(`(from|import)[\\s(]*"\\./${layer}(/|")`),
      );
  });

  it.each(sources)(
    "%s loads @resvg/resvg-js only from src/node/render-png.ts",
    (file) => {
      // Dependency weight rule: the native rasteriser is an
      // optional peer, reachable only through the lazy import in render-png.ts,
      // so the browser entries never pull it in. Matches static `from "..."`,
      // dynamic `import("...")` and `require("...")` alike.
      const text = readFileSync(file, "utf8");
      const mentions = /["']@resvg\/resvg-js["']/.test(text);
      if (relative(SRC, file) === "node/render-png.ts") {
        expect(mentions).toBe(true);
      } else {
        expect(
          mentions,
          `${relative(ROOT, file)} must not reference @resvg/resvg-js`,
        ).toBe(false);
      }
    },
  );

  it.each(sources)("%s stays under 500 lines", (file) => {
    expect(readFileSync(file, "utf8").split("\n").length).toBeLessThanOrEqual(
      500,
    );
  });

  it.each(sources.filter((p) => !p.endsWith("/index.ts")))(
    "%s has a mirrored test",
    (file) => {
      const mirror = join(ROOT, "tests", relative(SRC, file)).replace(
        /\.tsx?$/,
        (ext) => `.test${ext}`,
      );
      expect(
        statSync(mirror).isFile(),
        `missing ${relative(ROOT, mirror)}`,
      ).toBe(true);
    },
  );
});
