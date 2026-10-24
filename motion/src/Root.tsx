import { Composition } from "remotion";

import { loadBrandFonts } from "./bridge/fonts.ts";
import { Sheet, sheetMetadata, type SheetProps } from "./sheet/Sheet.tsx";
import { Smoke } from "./videos/smoke/Smoke.tsx";

void loadBrandFonts();

export const Root: React.FC = () => (
  <>
    <Composition
      id="smoke"
      component={Smoke}
      durationInFrames={30}
      fps={30}
      width={640}
      height={360}
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
        cols: 4,
        tileWidth: 480,
        tileHeight: 270,
      }}
      calculateMetadata={({ props }) => sheetMetadata(props)}
    />
  </>
);
