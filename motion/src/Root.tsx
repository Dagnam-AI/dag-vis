import { Composition } from "remotion";

import { loadBrandFonts } from "./bridge/fonts.ts";
import { sheetColumns } from "./lib/sheet.ts";
import { framesFor, loopFrames } from "./lib/timing.ts";
import { Sheet, sheetMetadata, type SheetProps } from "./sheet/Sheet.tsx";
import { PipelineProof } from "./videos/pipeline-proof/PipelineProof.tsx";
import { DEFAULT_PROPS as PROOF_PROPS } from "./videos/pipeline-proof/props.ts";
import { TIMING as PROOF } from "./videos/pipeline-proof/timing.ts";
import { DEFAULT_PROPS as QUICKSTART_PROPS } from "./videos/quickstart/props.ts";
import { Quickstart } from "./videos/quickstart/Quickstart.tsx";
import { TIMING as QUICKSTART } from "./videos/quickstart/timing.ts";

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
      defaultProps={PROOF_PROPS}
    />
    <Composition
      id="quickstart"
      component={Quickstart}
      durationInFrames={framesFor(QUICKSTART.duration, QUICKSTART.fps)}
      fps={QUICKSTART.fps}
      width={QUICKSTART.width}
      height={QUICKSTART.height}
      defaultProps={QUICKSTART_PROPS}
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
