import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ROOT,
  SRC,
  importSpecifiers,
  inside,
  resolveSpec,
  walk,
} from "./helpers/structure.js";

// The checks on motion/ (the Remotion workspace beside the package); the package's own
// layering is in structure.test.ts, which shares its import scanner.
const MOTION = join(ROOT, "motion");
// Fonts, images, then video and audio.
const BINARY_ASSET =
  /\.(ttf|otf|woff2?|ttc|otc|eot|png|jpe?g|gif|webp|avif|mp4|mov|webm|mkv|wav|mp3|aac|flac|ogg|m4a)$/i;
const isBinaryAsset = (path: string): boolean => BINARY_ASSET.test(path);
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
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
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
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        const target = resolveSpec(file, spec);
        expect(
          target === undefined ? allowed.includes(spec) : inside(target, LIB),
          `${relative(ROOT, file)} must import siblings only: ${spec}`,
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
    // -z: NUL-separated and unquoted, so a non-ASCII name cannot hide its extension behind a closing quote.
    const tracked = execFileSync("git", ["ls-files", "-z", "motion"], {
      cwd: ROOT,
      encoding: "utf8",
    }).split("\0");
    // Moonhouse's licence forbids redistributing the font file; renders and
    // generated media are artifacts. Only pixels leave the machine, never these.
    expect(tracked.filter(isBinaryAsset)).toEqual([]);
  });

  it("recognises binary assets by extension, whatever the folder or the characters in the name", () => {
    for (const name of [
      "motion/a/Mönhouse.ttf",
      "motion/MOON.OTF",
      "motion/x.woff2",
      "motion/x.ttc",
      "motion/x.eot",
      "motion/public/a b.jpeg",
      "motion/x.webp",
      "motion/x.avif",
      "motion/x.mov",
      "motion/x.mkv",
      "motion/x.m4a",
      "motion/x.flac",
    ])
      expect(isBinaryAsset(name), name).toBe(true);
    for (const name of [
      "motion/README.md",
      "motion/src/a.ts",
      "motion/ttf",
      "",
    ])
      expect(isBinaryAsset(name), name).toBe(false);
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

  it("keeps the signing code (sigv4.ts, and r2.ts which signs through it) out of the Remotion bundle", () => {
    for (const file of motionSources.filter(
      (p) => !/\/src\/lib\/(sigv4|r2)\.ts$/.test(p),
    )) {
      expect(readFileSync(file, "utf8"), relative(ROOT, file)).not.toMatch(
        /sigv4|\/r2\.ts/,
      );
    }
  });

  it("never uploads implicitly: no --upload in render.ts or any workflow, no network in tests", () => {
    const render = join(MOTION, "scripts/render.ts");
    if (existsSync(render))
      expect(readFileSync(render, "utf8")).not.toMatch(/--upload/);
    for (const workflow of readdirSync(join(ROOT, ".github/workflows")))
      expect(
        readFileSync(join(ROOT, ".github/workflows", workflow), "utf8"),
        workflow,
      ).not.toMatch(/--upload|R2_/);
    // Only these tests run scripts/store.ts or render.ts (which runs it), and
    // each does so with no endpoint of the real bucket: render.test.ts fakes every
    // process, store.test.ts sets no R2 variable, store-upload.test.ts sends its
    // made-up credentials to a server on 127.0.0.1 (MOTION_R2_ENDPOINT). No test
    // calls fetch itself.
    const runsStore = [
      "render.test.ts",
      "store.test.ts",
      "store-upload.test.ts",
    ];
    for (const file of walk(join(MOTION, "tests")).filter((p) =>
      /\.tsx?$/.test(p),
    )) {
      const text = readFileSync(file, "utf8");
      const at = relative(ROOT, file);
      expect(text, at).not.toMatch(/\bfetch\(/);
      if (runsStore.includes(basename(file)))
        expect(text, at).not.toMatch(/cloudflarestorage/);
      else expect(text, at).not.toMatch(/scripts\/store/);
    }
  });

  it("lets only the loopback test double replace the R2 endpoint, through one reader", () => {
    const readers = [...motionSources, ...motionScripts].filter((p) =>
      readFileSync(p, "utf8").includes("MOTION_R2_ENDPOINT"),
    );
    expect(readers.map((p) => relative(MOTION, p))).toEqual([
      join("src", "lib", "store.ts"),
    ]);
    const upload = readFileSync(
      join(MOTION, "tests/scripts/store-upload.test.ts"),
      "utf8",
    );
    expect(upload).toMatch(/MOTION_R2_ENDPOINT/);
    expect(upload).toMatch(/127\.0\.0\.1/);
  });

  it("keeps the render ledger to rendered facts: swangle, a local copy, an R2 key or null, no secret names", () => {
    const ledger = join(MOTION, "RENDERS.jsonl");
    for (const line of readFileSync(ledger, "utf8").split("\n")) {
      if (line === "") continue;
      const row = JSON.parse(line) as {
        gl: string;
        dirty: unknown;
        stored: { local: string; r2: string | null };
      };
      expect(row.gl, line).toBe("swangle");
      expect(typeof row.dirty, line).toBe("boolean");
      expect(row.stored.local, line).toMatch(/^[a-z0-9-]+\/[^/]+$/);
      expect(row.stored.r2 ?? "videos/", line).toMatch(/^videos\//);
      expect(line, "a ledger line never names a credential").not.toMatch(
        /R2_|AKIA|secretAccessKey/i,
      );
    }
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
