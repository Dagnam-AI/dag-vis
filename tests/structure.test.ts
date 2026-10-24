import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

// Mirrors eslint.config.js. Key: layer; value: layers it MAY import.
const ALLOWED: Record<string, readonly string[]> = {
  core: [],
  brand: ["core"],
  gradient: ["core", "brand"],
  pattern: ["core", "brand"],
  scene: ["core", "brand", "gradient", "pattern"],
  field: ["core"],
  animate: ["core", "scene"],
  react: ["core", "animate", "gradient"],
  node: ["core", "brand", "gradient", "pattern", "scene"],
};

/**
 * Every module specifier: static `from "..."`, side-effect `import "..."` and dynamic
 * `import("...")` (also with a comment before the string, single quotes or backticks).
 */
const IMPORT_SPECIFIER =
  /(?:from|import)\s*\(?\s*(?:\/\*[^*]*\*\/\s*)?["'`]([^"'`]+)["'`]/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sources = walk(SRC).filter((p) => /\.tsx?$/.test(p));
const layerOf = (p: string): string => relative(SRC, p).split("/")[0]!;

describe("repository structure", () => {
  it("has at least one source file", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)("%s imports only leftwards in the layer order", (file) => {
    const text = readFileSync(file, "utf8");
    const layer = layerOf(file);
    const allowed = layer.includes(".")
      ? Object.keys(ALLOWED)
      : ALLOWED[layer]!;
    for (const m of text.matchAll(IMPORT_SPECIFIER)) {
      if (!m[1]!.startsWith(".")) continue;
      const target = join(dirname(file), m[1]!);
      const targetLayer = layerOf(target);
      if (targetLayer === layer || targetLayer.includes(".")) continue;
      expect(allowed, `${relative(ROOT, file)} -> ${m[1]!}`).toContain(
        targetLayer,
      );
    }
    if (layer !== "node" && !layer.includes(".")) {
      for (const m of text.matchAll(IMPORT_SPECIFIER))
        expect(
          m[1]!.startsWith("node:"),
          `${relative(ROOT, file)} uses the Node import ${m[1]!}`,
        ).toBe(false);
    }
  });

  it("the root barrel imports nothing from animate, react or node", () => {
    // Their types name HTMLCanvasElement or React, so the root would stop
    // type-checking in a DOM-free consumer. They are separate entry points.
    const text = readFileSync(join(SRC, "index.ts"), "utf8");
    for (const layer of ["animate", "react", "node"])
      expect(text, `src/index.ts imports ./${layer}`).not.toMatch(
        new RegExp(`(from|import)\\s*\\(?\\s*"\\./${layer}(/|")`),
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
