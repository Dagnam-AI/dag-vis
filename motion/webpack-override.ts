import { resolve } from "node:path";

import type { WebpackOverrideFn } from "@remotion/bundler";

/**
 * The one alias pair: `@dagnam/vis` (src/index.ts) and `@dagnam/vis/animate`
 * (src/animate/index.ts) are the library SOURCE, so an effect edit shows in the
 * next frame with no build. The library's NodeNext imports end in `.js` while
 * the files are `.ts`, hence extensionAlias. Shared by remotion.config.ts (CLI)
 * and the SSR scripts (the Node API ignores the config file). Paths are
 * relative to motion/, where every command runs. The library's own
 * dependencies resolve from the repository root, so the root `npm ci` must
 * have run.
 */
export const webpackOverride: WebpackOverrideFn = (current) => ({
  ...current,
  resolve: {
    ...current.resolve,
    alias: {
      ...(current.resolve?.alias as Record<string, string> | undefined),
      "@dagnam/vis$": resolve("../src/index.ts"),
      "@dagnam/vis/animate$": resolve("../src/animate/index.ts"),
    },
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
});

/**
 * Chromium's GL backend. `swangle` (software, SwiftShader) everywhere: it is
 * machine-independent and the only software backend with WebGL2. Output differs
 * between `angle` and `swangle`, so the renderer is part of a render's identity
 * and is recorded with it. `MOTION_GL=angle` opts in to the GPU for a local
 * preview that is not a deliverable.
 */
export const gl = (): "angle" | "swangle" =>
  process.env.MOTION_GL === "angle" ? "angle" : "swangle";
