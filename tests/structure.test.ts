import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
  export: ["core"],
  animate: ["core", "scene", "field", "export"],
  react: ["core", "animate", "gradient"],
  node: ["core", "brand", "gradient", "pattern", "scene", "field", "export"],
};

/**
 * Every module specifier: static `from "..."`, side-effect `import "..."` and dynamic
 * `import("...")` (also with a comment before the string, single quotes or backticks).
 */
const IMPORT_SPECIFIER =
  /(?:from|import)\s*\(?\s*(?:(?:\/\*[^*]*\*\/|\/\/[^\n]*\n)\s*)*["'`]([^"'`]+)["'`]/g;

function walk(dir: string, skip: readonly string[] = []): string[] {
  return readdirSync(dir)
    .filter((name) => !skip.includes(name))
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p, skip) : [p];
    });
}

/** The file a relative, absolute or `file:` specifier names, resolved against the importing file; undefined for a package name. */
function resolveSpec(file: string, spec: string): string | undefined {
  if (spec.startsWith("file:")) return fileURLToPath(spec);
  return spec.startsWith(".") || isAbsolute(spec)
    ? resolve(dirname(file), spec)
    : undefined;
}

const inside = (target: string, dir: string): boolean => {
  const rel = relative(dir, target);
  return rel.split(sep)[0] !== ".." && !isAbsolute(rel);
};

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
      const target = resolveSpec(file, m[1]!);
      if (target === undefined) continue;
      // A specifier that resolves outside src/ (e.g. into motion/) is a layering break, not a skip.
      expect(
        inside(target, SRC),
        `${relative(ROOT, file)} imports outside src/: ${m[1]!}`,
      ).toBe(true);
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

  it("the root barrel imports nothing from export, animate, react or node", () => {
    // Their types name HTMLCanvasElement or React, so the root would stop
    // type-checking in a DOM-free consumer; export loads the third-party
    // encoders, which the root entry must never pull in. They are separate
    // entry points.
    const text = readFileSync(join(SRC, "index.ts"), "utf8");
    for (const layer of ["export", "animate", "react", "node"])
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

const MOTION = join(ROOT, "motion");
const motionSources = walk(join(MOTION, "src")).filter((p) =>
  /\.tsx?$/.test(p),
);
const motionScripts = existsSync(join(MOTION, "scripts"))
  ? walk(join(MOTION, "scripts")).filter((p) => p.endsWith(".ts"))
  : [];
// Source and scripts hold the 500-line cap; every code file motion/ carries
// (tests, config and plain-JS files included; not installed or rendered output)
// is held to the import boundary.
const motionFiles = [...motionSources, ...motionScripts];
const motionCode = walk(MOTION, ["node_modules", "out", "public"]).filter((p) =>
  /\.[cm]?[jt]sx?$/.test(p),
);
const LIB = join(MOTION, "src", "lib");
// Pins both trees must carry identically, or motion's tests run on a second React.
const SHARED_PINS = [
  "react",
  "react-dom",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "vitest",
  "@vitest/coverage-v8",
  "jsdom",
  "@testing-library/react",
];
const deps = (p: string): Record<string, string> => {
  const pkg = JSON.parse(readFileSync(p, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { ...pkg.dependencies, ...pkg.devDependencies };
};

describe("motion/", () => {
  it("has source files to check", () => {
    expect(motionSources.length).toBeGreaterThan(0);
  });

  it.each(motionCode)(
    "%s reaches the library only as @dagnam/vis or @dagnam/vis/animate",
    (file) => {
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT_SPECIFIER)) {
        const spec = m[1]!;
        const at = `${relative(ROOT, file)} imports ${spec}`;
        // Resolved, so `./../..` spellings and any folder depth are judged by where they land.
        const target = resolveSpec(file, spec);
        expect(
          target !== undefined &&
            (inside(target, SRC) || inside(target, join(ROOT, "dist"))),
          `${at}: a path into the library's src/ or dist/`,
        ).toBe(false);
        expect(spec, `${at}: import of dist/`).not.toMatch(/\/dist\//);
        expect(
          spec.startsWith("@dagnam/vis/") && spec !== "@dagnam/vis/animate",
          `${at}: a subpath of @dagnam/vis other than /animate`,
        ).toBe(false);
      }
    },
  );

  it.each(motionSources.filter((p) => /\/src\/(lib|bridge)\//.test(p)))(
    "%s is pure or bridge and has a mirrored test",
    (file) => {
      const mirror = join(
        MOTION,
        "tests",
        relative(join(MOTION, "src"), file),
      ).replace(/\.tsx?$/, (ext) => `.test${ext}`);
      expect(existsSync(mirror), `missing ${relative(ROOT, mirror)}`).toBe(
        true,
      );
    },
  );

  it.each(motionCode.filter((p) => inside(p, LIB)))(
    "%s imports only its siblings in motion/src/lib",
    (file) => {
      // sigv4.ts alone may import node:crypto (scripts-only file).
      const allowed = file.endsWith("/src/lib/sigv4.ts") ? ["node:crypto"] : [];
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT_SPECIFIER)) {
        const target = resolveSpec(file, m[1]!);
        expect(
          target === undefined ? allowed.includes(m[1]!) : inside(target, LIB),
          `${relative(ROOT, file)} must import siblings only: ${m[1]!}`,
        ).toBe(true);
      }
    },
  );

  it.each(motionFiles)("%s stays under 500 lines", (file) => {
    expect(readFileSync(file, "utf8").split("\n").length).toBeLessThanOrEqual(
      500,
    );
  });

  it("pins the shared toolchain identically in both package.json files", () => {
    const root = deps(join(ROOT, "package.json"));
    const motion = deps(join(MOTION, "package.json"));
    for (const name of SHARED_PINS) {
      expect(
        root[name],
        `${name} missing from the root package.json`,
      ).toBeDefined();
      expect(motion[name], `${name} missing from motion/package.json`).toBe(
        root[name],
      );
    }
  });

  it("never tracks a font, image, video or audio file under motion/", () => {
    const tracked = execFileSync("git", ["ls-files", "motion"], {
      cwd: ROOT,
      encoding: "utf8",
    }).split("\n");
    // Moonhouse's licence forbids redistributing the font file; renders and
    // generated media are artifacts. Only pixels leave the machine, never these.
    expect(
      tracked.filter((p) => /\.(ttf|otf|woff2?|png|mp4|wav)$/i.test(p)),
    ).toEqual([]);
  });

  it("gitignores the copied fonts, generated assets and renders", () => {
    for (const path of [
      "motion/public/fonts/moonhouse.ttf",
      "motion/public/generated/x.png",
      "motion/out/x.mp4",
    ]) {
      // `git check-ignore -q` exits 1 (so execFileSync throws) when the path is NOT ignored.
      expect(
        () => execFileSync("git", ["check-ignore", "-q", path], { cwd: ROOT }),
        path,
      ).not.toThrow();
    }
    const lines = readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n");
    for (const entry of [
      "motion/public/fonts/",
      "motion/public/generated/",
      "motion/out/",
    ])
      expect(lines, entry).toContain(entry);
  });

  it("keeps motion/ out of the package", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { files: string[] };
    expect(pkg.files).toEqual(["dist", "bin", "NOTICE"]);
    expect(
      readFileSync(join(ROOT, ".github/scripts/assert-tarball.sh"), "utf8"),
    ).toMatch(/\^package\/\(tests\|src\|coverage\|motion\|/);
  });
});
