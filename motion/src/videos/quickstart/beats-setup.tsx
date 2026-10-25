// The opening beats: title, project, data. Each reads its own frame (0 = the
// beat's first) and draws only text from TEXT, at the cues and positions of timing.ts.
import { useCurrentFrame } from "remotion";

import {
  Box,
  C,
  Group,
  Layer,
  Stroke,
  Txt,
  WordmarkText,
  appear,
  along,
  at,
} from "./parts.tsx";
import { CUES, LAYOUT, TEXT } from "./timing.ts";

const { text: SIZE } = LAYOUT;

/** A canvas the nodes sit on, with a dot grid; shared by the data and model beats. */
export const Canvas: React.FC<{
  frame: number;
  cue: readonly [number, number];
}> = ({ frame, cue }) => {
  const { x, y, w, h } = LAYOUT.canvas;
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      fill={C.canvas}
      border={C.hairline}
      opacity={appear(frame, cue)}
      style={{
        backgroundImage: `radial-gradient(${C.hairline} 1.5px, transparent 1.5px)`,
        backgroundSize: "48px 48px",
        backgroundPosition: "24px 24px",
      }}
    />
  );
};

export const TitleBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = appear(frame, CUES.title.wordmark);
  const line = appear(frame, CUES.title.subtitle);
  return (
    <>
      <WordmarkText
        {...TEXT.wordmark}
        y={LAYOUT.title.wordmarkY}
        size={SIZE.wordmark}
        opacity={mark}
        lift={(1 - mark) * 24}
      />
      <Txt
        center
        y={LAYOUT.title.subtitleY}
        size={SIZE.headline}
        opacity={line}
        lift={(1 - line) * 24}
      >
        {TEXT.title}
      </Txt>
    </>
  );
};

/** A select box: a label above, the value inside once it is chosen, a small triangle at the right. */
const Select: React.FC<{
  frame: number;
  x: number;
  labelY: number;
  inputY: number;
  label: string;
  value: string;
  cue: readonly [number, number];
}> = ({ frame, x, labelY, inputY, label, value, cue }) => {
  const { w, h } = { ...LAYOUT.project.row2, ...LAYOUT.project.input };
  const set = appear(frame, cue);
  return (
    <>
      <Txt x={x} y={labelY} size={SIZE.body} weight={400} color={C.dim}>
        {label}
      </Txt>
      <Box x={x} y={inputY} w={w} h={h} fill={C.raised} border={C.hairline}>
        <Box
          x={0}
          y={0}
          w={w - 4}
          h={h - 4}
          border={C.fg}
          opacity={set * 0.7}
        />
        <Txt x={22} y={14} size={SIZE.body} opacity={set}>
          {value}
        </Txt>
        <Layer>
          <polygon
            points="0,0 22,0 11,14"
            fill={C.dim}
            transform={`translate(${String(w - 56)} ${String(h / 2 - 9)})`}
          />
        </Layer>
      </Box>
    </>
  );
};

export const ProjectBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const {
    dialog: d,
    title,
    row2,
    typedBar,
    button,
    chip,
    input,
  } = LAYOUT.project;
  const t = TEXT.project;
  const open = appear(frame, CUES.project.dialog);
  const ready = appear(frame, CUES.project.ready);
  const created = appear(frame, CUES.project.chip);
  const press = along(frame, CUES.project.press);
  const scale = 1 - (1 - LAYOUT.project.pressScale) * Math.sin(Math.PI * press);
  const inner = d.w - 2 * d.pad;
  const left = d.x + d.pad;
  const faded = open * (1 - 0.5 * created);
  const lift = `translateY(${String((1 - open) * 18)}px)`;
  return (
    <>
      <Group opacity={faded} transform={lift}>
        <Box
          x={d.x}
          y={d.y}
          w={d.w}
          h={d.h}
          fill={C.panel}
          border={C.hairline}
        />
        <Txt
          x={left}
          y={title.labelY}
          size={SIZE.body}
          weight={400}
          color={C.dim}
        >
          {t.title}
        </Txt>
        <Box
          x={left}
          y={title.inputY}
          w={inner}
          h={input.h}
          fill={C.raised}
          border={C.hairline}
        >
          <Box
            x={typedBar.inset}
            y={(input.h - typedBar.h) / 2 - 2}
            w={typedBar.w * along(frame, CUES.project.typing)}
            h={typedBar.h}
            fill={C.fg}
            opacity={0.8}
          />
        </Box>
        <Select
          frame={frame}
          x={left}
          labelY={row2.labelY}
          inputY={row2.inputY}
          label={t.framework}
          value={t.frameworkValue}
          cue={CUES.project.framework}
        />
        <Select
          frame={frame}
          x={row2.rightX}
          labelY={row2.labelY}
          inputY={row2.inputY}
          label={t.visibility}
          value={t.visibilityValue}
          cue={CUES.project.visibility}
        />
        <Box
          x={left}
          y={button.y}
          w={inner}
          h={button.h}
          fill={C.raised}
          border={C.hairline}
          transform={`scale(${String(scale)})`}
        >
          <Box
            x={0}
            y={0}
            w={inner - 4}
            h={button.h - 4}
            fill={C.accent}
            opacity={ready}
          />
          <Txt
            center
            w={inner - 4}
            y={button.h / 2 - 24}
            size={SIZE.body}
            weight={700}
            opacity={0.55 + 0.45 * ready}
          >
            {t.button}
          </Txt>
        </Box>
      </Group>
      <Box
        x={(1920 - chip.w) / 2}
        y={chip.y}
        w={chip.w}
        h={chip.h}
        fill={C.raised}
        border={C.hairline}
        opacity={created}
        transform={`translateY(${String((1 - created) * 22)}px)`}
      >
        <Box x={chip.pad} y={chip.h / 2 - 9} w={14} h={14} fill={C.accent} />
        <Txt x={chip.pad + 32} y={chip.h / 2 - 24} size={SIZE.body}>
          {t.chip}
        </Txt>
      </Box>
    </>
  );
};

export const DataBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { node, split, trunkX, track, drop } = LAYOUT.data;
  const landed = appear(frame, CUES.data.land);
  const midY = node.y + node.h / 2;
  const rightX = node.x + node.w;
  return (
    <>
      <Canvas frame={frame} cue={CUES.data.canvas} />
      <Layer>
        {split.ys.map((y, i) => {
          const cy = y + split.h / 2;
          const cue = at(CUES.data.links, i);
          return (
            <Stroke
              key={TEXT.data.splits[i]}
              d={`M${String(rightX)} ${String(midY)}H${String(trunkX)}V${String(cy)}H${String(split.x)}`}
              p={along(frame, cue)}
              color={C.dim}
            />
          );
        })}
      </Layer>
      <Box
        x={node.x}
        y={node.y}
        w={node.w}
        h={node.h}
        fill={C.panel}
        border={C.hairline}
        opacity={landed}
        transform={`translateY(${String(-(1 - landed) * drop)}px)`}
      >
        <Box x={0} y={0} w={8} h={node.h - 4} fill={C.accent} />
        <Txt x={44} y={node.h / 2 - 54} w={node.w - 72} size={SIZE.body}>
          {TEXT.data.dataset}
        </Txt>
      </Box>
      {split.ys.map((y, i) => {
        const cue = at(CUES.data.splits, i);
        const shown = appear(frame, cue);
        const label = at(TEXT.data.splits, i);
        return (
          <Box
            key={label}
            x={split.x}
            y={y}
            w={split.w}
            h={split.h}
            fill={C.panel}
            border={C.hairline}
            opacity={shown}
            transform={`translateX(${String(-(1 - shown) * 24)}px)`}
          >
            <Txt x={32} y={split.h / 2 - 22} size={SIZE.body}>
              {label}
            </Txt>
            <Box
              x={track.x}
              y={split.h / 2 - track.h / 2 - 2}
              w={track.w}
              h={track.h}
              fill={C.bar}
            >
              <Box
                x={0}
                y={0}
                w={track.w * at(split.share, i) * shown}
                h={track.h}
                fill={C.dim}
              />
            </Box>
          </Box>
        );
      })}
    </>
  );
};
