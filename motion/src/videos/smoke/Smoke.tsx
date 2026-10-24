// Scaffold check only: proves the library alias and the brand fonts end to end. Replaced by the pipeline proof.
import { AbsoluteFill } from "remotion";

import { THEME } from "../../bridge/brand.ts";

export const Smoke: React.FC = () => (
  <AbsoluteFill
    style={{
      background: THEME.background,
      color: THEME.accent,
      fontFamily: `${THEME.display}, ${THEME.text}`,
      fontSize: 38,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    @dagnam/vis via alias
  </AbsoluteFill>
);
