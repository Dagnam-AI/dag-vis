// The building beats: model, code, train and the end card.
import { useMemo } from "react";
import { useCurrentFrame } from "remotion";

import {
  easeInOutCubic,
  easeOutCubic,
  lerp,
  progress,
} from "../../lib/ease.ts";
import { Canvas } from "./beats-setup.tsx";
import { codeLines, lossCurve } from "./curve.ts";
import {
  Box,
  C,
  Layer,
  Stroke,
  Txt,
  WordmarkText,
  appear,
  along,
  at,
  centred,
} from "./parts.tsx";
import { CUES, LAYOUT, TEXT } from "./timing.ts";

const { text: SIZE } = LAYOUT;

export const ModelBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { row, panel, canvas, tightH } = LAYOUT.model;
  const m = CUES.model;
  const xs = row.widths.map(
    (_, i) =>
      row.x0 + row.widths.slice(0, i).reduce((a, b) => a + b, 0) + row.gap * i,
  );
  const midY = row.y + row.h / 2;
  // The canvas grows to hold the output settings as they arrive.
  const grow = easeInOutCubic(progress(frame, m.stem[0], m.panel[1]));
  const outCentre = at(xs, 3) + at(row.widths, 3) / 2;
  return (
    <>
      <Canvas
        frame={frame}
        cue={m.canvas}
        box={{ ...canvas, h: lerp(tightH, canvas.h, grow) }}
      />
      <Layer>
        {m.links.map((cue, i) => {
          const from = at(xs, i) + at(row.widths, i);
          const to = at(xs, i + 1);
          const p = along(frame, cue);
          // Red while it is new, then back to grey.
          const heat =
            1 - progress(frame, cue[1] + m.hot, cue[1] + m.hot + m.cool);
          const d = `M${String(from)} ${String(midY)}H${String(to - 20)}`;
          const head = `${String(to)},${String(midY)} ${String(to - 26)},${String(midY - 13)} ${String(to - 26)},${String(midY + 13)}`;
          const arrow = progress(p, 0.85, 1);
          return (
            <g key={TEXT.model.nodes[i + 1]}>
              <Stroke d={d} p={p} color={C.dim} width={5} />
              <Stroke d={d} p={p} color={C.accent} width={5} opacity={heat} />
              <polygon points={head} fill={C.dim} opacity={arrow} />
              <polygon points={head} fill={C.accent} opacity={arrow * heat} />
            </g>
          );
        })}
        <Stroke
          d={`M${String(outCentre)} ${String(row.y + row.h)}V${String(panel.y)}`}
          p={along(frame, m.stem)}
          color={C.dim}
        />
      </Layer>
      {TEXT.model.nodes.map((label, i) => {
        const shown = appear(frame, at(m.nodes, i));
        const w = at(row.widths, i);
        return (
          <Box
            key={label}
            x={at(xs, i)}
            y={row.y}
            w={w}
            h={row.h}
            fill={C.panel}
            border={C.hairline}
            opacity={shown}
            transform={`translateY(${String((1 - shown) * 20)}px)`}
          >
            <Txt
              center
              w={w - 4}
              y={centred(row.h, SIZE.card)}
              size={SIZE.card}
            >
              {label}
            </Txt>
          </Box>
        );
      })}
      <Box
        x={panel.x}
        y={panel.y}
        w={panel.w}
        h={panel.h}
        fill={C.panel}
        border={C.hairline}
        opacity={appear(frame, m.panel)}
        transform={`translateY(${String((1 - appear(frame, m.panel)) * 20)}px)`}
      >
        <Box x={0} y={0} w={8} h={panel.h - 4} fill={C.accent} />
        {[TEXT.model.outputType, TEXT.model.classes].map((line, i) => {
          const shown = appear(frame, i === 0 ? m.outputType : m.classes);
          return (
            <Txt
              key={line}
              x={panel.pad + 8}
              y={panel.pad + i * 87}
              size={SIZE.card}
              opacity={shown}
              lift={(1 - shown) * 10}
            >
              {line}
            </Txt>
          );
        })}
      </Box>
    </>
  );
};

export const CodeBeat: React.FC<{ seed: number }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { window: w, lines: l, caret } = LAYOUT.code;
  const c = CUES.code;
  const opened = appear(frame, c.window);
  const shapes = useMemo(
    () => codeLines(seed, l.count, [4, 9]),
    [seed, l.count],
  );
  const lastY = l.y + (l.count - 1) * l.step;
  const last = at(shapes, l.count - 1);
  const lastW = (last.token + last.rest) * l.maxW;
  return (
    <>
      <Box
        x={w.x}
        y={w.y}
        w={w.w}
        h={w.h}
        fill={C.panel}
        border={C.hairline}
        opacity={opened}
        transform={`translateY(${String((1 - opened) * 24)}px) scale(${String(0.97 + 0.03 * opened)})`}
      >
        <Box
          x={0}
          y={w.bar}
          w={w.w - 4}
          h={LAYOUT.hairline}
          fill={C.hairline}
        />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            x={32 + i * 36}
            y={w.bar / 2 - 12}
            w={22}
            h={22}
            border={C.hairline}
          />
        ))}
      </Box>
      {shapes.map((s, i) => {
        if (s.blank) return null;
        const start = c.firstLine + i * c.stagger;
        const grown = easeOutCubic(progress(frame, start, start + c.grow));
        const x = l.x + s.indent * l.indent;
        const token = s.token * l.maxW;
        const rest = s.rest * l.maxW;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: l.y + i * l.step,
              height: l.h,
              width: token + 16 + rest,
              transformOrigin: "0 50%",
              transform: `scaleX(${String(grown)})`,
              opacity: opened,
            }}
          >
            <Box x={0} y={0} w={token} h={l.h} fill={C.dim} />
            <Box x={token + 16} y={0} w={rest} h={l.h} fill={C.bar} />
          </div>
        );
      })}
      <Box
        x={l.x + last.indent * l.indent + lastW + 16 + 16}
        y={lastY - (caret.h - l.h) / 2}
        w={caret.w}
        h={caret.h}
        fill={C.accent}
        opacity={progress(frame, c.caret, c.caret + 6)}
      />
    </>
  );
};

/** Point on the accuracy ring at `deg` degrees clockwise from the +x axis (screen coordinates). */
const onRing = (deg: number): string => {
  const { cx, cy, r } = LAYOUT.train.arc;
  const a = (deg * Math.PI) / 180;
  return `${String(cx + r * Math.cos(a))} ${String(cy + r * Math.sin(a))}`;
};
const arcPath = (sweep: number): string =>
  `M${onRing(135)}A${String(LAYOUT.train.arc.r)} ${String(LAYOUT.train.arc.r)} 0 ${sweep > 180 ? "1" : "0"} 1 ${onRing(135 + sweep)}`;

export const TrainBeat: React.FC<{ seed: number }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { loss, plot, accuracy, arc } = LAYOUT.train;
  const t = CUES.train;
  const shown = appear(frame, t.panels);
  const drawn = easeInOutCubic(along(frame, t.draw));
  const curve = useMemo(
    () => lossCurve(seed, plot.points),
    [seed, plot.points],
  );
  const pointAt = (i: number): [number, number] => [
    plot.x + (i / (plot.points - 1)) * plot.w,
    plot.y + plot.h * (1 - at(curve, i)),
  ];
  const path = curve
    .map((_, i) => `${i === 0 ? "M" : "L"}${pointAt(i).join(" ")}`)
    .join("");
  const head = pointAt(Math.round(drawn * (plot.points - 1)));
  const sweep = arc.sweep * arc.reach * easeOutCubic(along(frame, t.draw));
  const lift = `translateY(${String((1 - shown) * 20)}px)`;
  return (
    <>
      <Box
        x={loss.x}
        y={loss.y}
        w={loss.w}
        h={loss.h}
        fill={C.panel}
        border={C.hairline}
        opacity={shown}
        transform={lift}
      >
        <Txt x={40} y={28} size={SIZE.body} weight={400} color={C.dim}>
          {TEXT.train.loss}
        </Txt>
      </Box>
      <Box
        x={accuracy.x}
        y={accuracy.y}
        w={accuracy.w}
        h={accuracy.h}
        fill={C.panel}
        border={C.hairline}
        opacity={shown}
        transform={lift}
      >
        <Txt x={40} y={28} size={SIZE.body} weight={400} color={C.dim}>
          {TEXT.train.accuracy}
        </Txt>
      </Box>
      <Layer>
        <g opacity={shown}>
          <path
            d={`M${String(plot.x)} ${String(plot.y)}V${String(plot.y + plot.h)}H${String(plot.x + plot.w)}`}
            fill="none"
            stroke={C.hairline}
            strokeWidth={LAYOUT.hairline}
          />
          <path
            d={arcPath(arc.sweep)}
            fill="none"
            stroke={C.bar}
            strokeWidth={arc.stroke}
          />
        </g>
        <Stroke d={path} p={drawn} color={C.accent} width={6} />
        {drawn > 0 && (
          <rect
            x={head[0] - 9}
            y={head[1] - 9}
            width={18}
            height={18}
            fill={C.accent}
          />
        )}
        {sweep > 0.5 && (
          <path
            d={arcPath(sweep)}
            fill="none"
            stroke={C.fg}
            strokeWidth={arc.stroke}
          />
        )}
      </Layer>
    </>
  );
};

export const EndBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const e = CUES.end;
  const mark = appear(frame, e.wordmark);
  const next = appear(frame, e.next);
  const address = appear(frame, e.address);
  return (
    <>
      <WordmarkText
        {...TEXT.wordmark}
        y={LAYOUT.end.wordmarkY}
        size={SIZE.wordmark}
        opacity={mark}
        lift={(1 - mark) * 24}
      />
      <Txt
        center
        y={LAYOUT.end.nextY}
        size={SIZE.headline}
        opacity={next}
        lift={(1 - next) * 24}
      >
        {TEXT.end.next}
      </Txt>
      <Txt
        center
        y={LAYOUT.end.addressY}
        size={SIZE.address}
        weight={400}
        color={C.dim}
        opacity={address}
        lift={(1 - address) * 24}
      >
        {TEXT.end.address}
      </Txt>
    </>
  );
};
