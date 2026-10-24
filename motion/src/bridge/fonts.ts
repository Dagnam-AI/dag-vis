import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

import { BRAND_FONTS } from "../lib/font-files.ts";

/** Registered from public/fonts, which scripts/assets.ts fills from the library's src/node/fonts. */
export const FONT_FILES = BRAND_FONTS;

/** loadFont blocks the render until each face is ready; call once at module scope in Root.tsx. */
export async function loadBrandFonts(): Promise<void> {
  await Promise.all(
    FONT_FILES.map((f) =>
      loadFont({
        family: f.family,
        weight: f.weight,
        url: staticFile(f.file),
        format: "truetype",
      }),
    ),
  );
}
