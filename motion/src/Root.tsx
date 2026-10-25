import { Composition } from "remotion";

import { loadBrandFonts } from "./bridge/fonts.ts";
import { sheetColumns } from "./lib/sheet.ts";
import { loopFrames } from "./lib/timing.ts";
import { Sheet, sheetMetadata, type SheetProps } from "./sheet/Sheet.tsx";
import { PipelineProof } from "./videos/pipeline-proof/PipelineProof.tsx";
import { TIMING as PROOF } from "./videos/pipeline-proof/timing.ts";

void loadBrandFonts();

export const Root: React.FC = () => (
  <>
    <Composition
      id="pipeline-proof"
      component={PipelineProof}
      durationInFrames={loopFrames(PROOF.duration, PROOF.fps)}
      fps={PROOF.fps}
      width={PROOF.width}
      height={PROOF.height}
      defaultProps={{ seed: 1 }}
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
