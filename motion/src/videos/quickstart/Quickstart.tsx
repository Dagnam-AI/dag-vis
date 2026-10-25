import { parseFieldPreset, fieldPresets } from "@dagnam/vis";
import { createField } from "@dagnam/vis/animate";
import { useCallback } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { THEME } from "../../bridge/brand.ts";
import { EffectCanvas } from "../../bridge/effect-canvas.tsx";
import { easeInOutCubic, lerp, progress, settle } from "../../lib/ease.ts";
import { CodeBeat, EndBeat, ModelBeat, TrainBeat } from "./beats-build.tsx";
import { DataBeat, ProjectBeat, TitleBeat } from "./beats-setup.tsx";
import { Group, SectionLabel, at } from "./parts.tsx";
import {
  BEATS,
  CAMERA,
  CUES,
  DURATION,
  FIELD_OPACITY,
  FIELD_SETTLE,
  HEIGHT,
  TEXT,
  WIDTH,
  type BeatId,
  type CameraMove,
} from "./timing.ts";

/** The camera of a beat at `frame`, as a transform that keeps the focus point at the centre of the frame. */
function cameraTransform(id: BeatId, frame: number): string | undefined {
  const keys = CAMERA[id];
  if (!keys) return undefined;
  let now: CameraMove = at(keys, 0);
  keys.slice(1).forEach((to, i) => {
    const from = at(keys, i);
    if (frame < from.at) return;
    const p = easeInOutCubic(progress(frame, from.at, to.at));
    now = {
      scale: lerp(from.scale, to.scale, p),
      x: lerp(from.x, to.x, p),
      y: lerp(from.y, to.y, p),
    };
  });
  return `translate(${String(WIDTH / 2)}px, ${String(HEIGHT / 2)}px) scale(${String(now.scale)}) translate(${String(-now.x)}px, ${String(-now.y)}px)`;
}

/** A beat's own clock, its push-in, and the short dip to the dark between beats. */
const BeatShell: React.FC<{
  id: BeatId;
  length: number;
  children: React.ReactNode;
}> = ({ id, length, children }) => {
  const frame = useCurrentFrame();
  const first = id === "title";
  const last = id === "end";
  const fadeIn = first ? 1 : progress(frame, 0, CUES.fade);
  const fadeOut = last ? 1 : 1 - progress(frame, length - CUES.fade, length);
  const transform = cameraTransform(id, frame);
  const section =
    id in TEXT.sections
      ? TEXT.sections[id as keyof typeof TEXT.sections]
      : undefined;
  return (
    <Group opacity={fadeIn * fadeOut}>
      <Group {...(transform === undefined ? {} : { transform })}>
        {children}
      </Group>
      {/* Drawn last, outside the camera: a push-in can neither crop the name of the section nor draw a card over it. */}
      {section !== undefined && (
        <SectionLabel frame={frame}>{section}</SectionLabel>
      )}
    </Group>
  );
};

// Props are an inline type, not an interface: Remotion's props must be assignable to Record<string, unknown>.
export const Quickstart: React.FC<{ seed: number; preset: string }> = ({
  seed,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const name = parseFieldPreset(preset);
  // Memoised: a new identity would destroy and rebuild the field on every frame.
  const create = useCallback(
    (canvas: HTMLCanvasElement) =>
      createField(canvas, fieldPresets[name], {
        loop: { duration: DURATION },
        maxDpr: 16,
      }),
    [name],
  );
  const scenes: Record<BeatId, React.ReactNode> = {
    title: <TitleBeat />,
    project: <ProjectBeat />,
    data: <DataBeat />,
    model: <ModelBeat />,
    code: <CodeBeat seed={seed} />,
    train: <TrainBeat seed={seed} />,
    end: <EndBeat />,
  };
  return (
    <AbsoluteFill style={{ background: THEME.background }}>
      <div style={{ position: "absolute", inset: 0, opacity: FIELD_OPACITY }}>
        <EffectCanvas
          create={create}
          t={settle(frame, ...FIELD_SETTLE) / fps}
          width={width}
          height={height}
        />
      </div>
      {BEATS.map((b) => (
        <Sequence
          key={b.id}
          name={b.id}
          from={b.start}
          durationInFrames={b.end - b.start}
        >
          <BeatShell id={b.id} length={b.end - b.start}>
            {scenes[b.id]}
          </BeatShell>
        </Sequence>
      ))}
      <Html5Audio src={staticFile("generated/quickstart.wav")} />
    </AbsoluteFill>
  );
};
