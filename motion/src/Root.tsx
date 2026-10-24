import { Composition } from "remotion";

import { loadBrandFonts } from "./bridge/fonts.ts";
import { sheetColumns } from "./lib/sheet.ts";
import { Sheet, sheetMetadata, type SheetProps } from "./sheet/Sheet.tsx";
import { framesFor } from "./lib/timing.ts";
import { Smoke } from "./videos/smoke/Smoke.tsx";
import { TIMING as SMOKE } from "./videos/smoke/timing.ts";

void loadBrandFonts();

export const Root: React.FC = () => (
  <>
    <Composition
      id="smoke"
      component={Smoke}
      durationInFrames={framesFor(SMOKE.duration, SMOKE.fps)}
      fps={SMOKE.fps}
      width={SMOKE.width}
      height={SMOKE.height}
    />
    <Composition
      id="sheet"
      component={Sheet}
      width={1600}
      height={900}
      durationInFrames={1}
      fps={1}
      defaultProps={{
        title: "sheet",
        tiles: [] as SheetProps["tiles"],
        cols: sheetColumns(6),
        tileWidth: 480,
        tileHeight: 270,
      }}
      calculateMetadata={({ props }) => sheetMetadata(props)}
    />
  </>
);
