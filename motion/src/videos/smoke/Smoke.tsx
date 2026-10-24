// Scaffold check only: proves the library alias end to end. Replaced by the pipeline proof.
import { BRAND } from "@dagnam/vis";
import { AbsoluteFill } from "remotion";

export const Smoke: React.FC = () => (
  <AbsoluteFill
    style={{
      background: BRAND.background.dark,
      color: BRAND.red,
      fontSize: 48,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    @dagnam/vis via alias
  </AbsoluteFill>
);
