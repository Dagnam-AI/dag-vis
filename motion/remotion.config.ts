import { Config } from "@remotion/cli/config";

import { gl, webpackOverride } from "./webpack-override.ts";

Config.setEntryPoint("./src/index.ts");
Config.setPublicDir("./public");
// An earlier render is never overwritten; scripts/render.ts versions the names.
Config.setOverwriteOutput(false);
Config.setChromiumOpenGlRenderer(gl());
Config.overrideWebpackConfig(webpackOverride);
