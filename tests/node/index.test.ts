import { describe, expect, it } from "vitest";

import * as node from "../../src/node/index.js";
import { FAVICON_FILES, favicons } from "../../src/node/favicons.js";
import { appIcon, APP_ICON_FILES } from "../../src/node/app-icon.js";
import { icoFromPngs } from "../../src/node/ico.js";
import { icnsFromPngs } from "../../src/node/icns.js";
import { run } from "../../src/node/cli.js";
import {
  ANIMATION_FORMATS,
  STATIC_FORMATS,
  exportAnimation,
  exportStatic,
} from "../../src/node/export.js";
import { ffmpegPath } from "../../src/node/ffmpeg.js";
import { renderSheet } from "../../src/node/sheet.js";
import { encodePng } from "../../src/node/png.js";
import {
  FONT_FILES,
  renderPng,
  renderRgba,
} from "../../src/node/render-png.js";

describe("@dagnam/vis/node barrel", () => {
  // API surface of the `./node` subpath (the root's is pinned in
  // tests/index.test.ts). Internal helpers (cli-args, MAX_* caps, the CLI's
  // file handling) are NOT public: adding or removing a name must show up here.
  it("exports exactly the documented runtime names", () => {
    expect(Object.keys(node).sort()).toEqual([
      "ANIMATION_FORMATS",
      "APP_ICON_FILES",
      "FAVICON_FILES",
      "FONT_FILES",
      "STATIC_FORMATS",
      "appIcon",
      "encodePng",
      "exportAnimation",
      "exportStatic",
      "favicons",
      "ffmpegPath",
      "icnsFromPngs",
      "icoFromPngs",
      "renderPng",
      "renderRgba",
      "renderSheet",
      "run",
    ]);
  });

  it("re-exports the module values, not copies", () => {
    expect(node.renderPng).toBe(renderPng);
    expect(node.FONT_FILES).toBe(FONT_FILES);
    expect(node.icoFromPngs).toBe(icoFromPngs);
    expect(node.icnsFromPngs).toBe(icnsFromPngs);
    expect(node.appIcon).toBe(appIcon);
    expect(node.APP_ICON_FILES).toBe(APP_ICON_FILES);
    expect(node.favicons).toBe(favicons);
    expect(node.FAVICON_FILES).toBe(FAVICON_FILES);
    expect(node.run).toBe(run);
    expect(node.renderRgba).toBe(renderRgba);
    expect(node.encodePng).toBe(encodePng);
    expect(node.ffmpegPath).toBe(ffmpegPath);
    expect(node.exportStatic).toBe(exportStatic);
    expect(node.exportAnimation).toBe(exportAnimation);
    expect(node.STATIC_FORMATS).toBe(STATIC_FORMATS);
    expect(node.ANIMATION_FORMATS).toBe(ANIMATION_FORMATS);
    expect(node.renderSheet).toBe(renderSheet);
  });
});
