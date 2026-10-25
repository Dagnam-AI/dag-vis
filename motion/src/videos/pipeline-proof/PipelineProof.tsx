import { BRAND } from "@dagnam/vis";
import { createRibbon } from "@dagnam/vis/animate";
import { useCallback } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { THEME } from "../../bridge/brand.ts";
import { EffectCanvas } from "../../bridge/effect-canvas.tsx";
import { TIMING } from "./timing.ts";

// Props are an inline type, not an interface: Remotion's props must be assignable to Record<string, unknown>.
export const PipelineProof: React.FC<{ seed: number }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Memoised: a new identity would destroy and rebuild the effect (canvas and handle) on every frame.
  const create = useCallback(
    (canvas: HTMLCanvasElement) =>
      createRibbon(canvas, {
        seed,
        lines: 160,
        twist: 2,
        amplitude: 0.14,
        colors: [BRAND.red, BRAND.stripes[3], BRAND.stripes[2]],
        loop: { duration: TIMING.duration },
        maxDpr: 16,
      }),
    [seed],
  );
  return (
    <AbsoluteFill style={{ background: THEME.background }}>
      <EffectCanvas
        create={create}
        t={frame / fps}
        width={width}
        height={height}
      />
      <div
        style={{
          position: "absolute",
          left: 64,
          bottom: 56,
          fontFamily: `${THEME.display}, ${THEME.text}`,
          fontSize: 36,
          color: THEME.foreground,
          opacity: 0.8,
        }}
      >
        @dagnam/vis motion pipeline proof · not for publication
      </div>
      <Html5Audio src={staticFile("generated/pipeline-proof.wav")} />
    </AbsoluteFill>
  );
};
