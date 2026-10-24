import { Composition } from "remotion";

import { loadBrandFonts } from "./bridge/fonts.ts";
import { Smoke } from "./videos/smoke/Smoke.tsx";

void loadBrandFonts();

export const Root: React.FC = () => (
  <Composition
    id="smoke"
    component={Smoke}
    durationInFrames={30}
    fps={30}
    width={640}
    height={360}
  />
);
