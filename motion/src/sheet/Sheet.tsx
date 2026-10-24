// Tooling, not a video: rendered once as a still by scripts/sheet.ts.
import { AbsoluteFill, Img, staticFile } from "remotion";

import { THEME } from "../bridge/brand.ts";
import { sheetLayout } from "../lib/sheet.ts";

// Extends Record<string, unknown> because Remotion's props must be assignable to it.
export interface SheetProps extends Record<string, unknown> {
  title: string;
  /** `src` is relative to public/, resolved with staticFile(). */
  tiles: { src: string; caption: string }[];
  cols: number;
  tileWidth: number;
  tileHeight: number;
}

export const SHEET_GEOMETRY = {
  captionHeight: 56,
  gap: 24,
  margin: 48,
} as const;
/** Space above the grid for the title line. */
const HEADER = 72;

const layoutOf = (p: SheetProps) =>
  sheetLayout({
    count: p.tiles.length,
    cols: p.cols,
    tileWidth: p.tileWidth,
    tileHeight: p.tileHeight,
    ...SHEET_GEOMETRY,
  });

/** The canvas is sized from the grid, so any number of frames fits. */
export const sheetMetadata = (p: SheetProps) => {
  const l = layoutOf(p);
  return {
    width: l.width,
    height: l.height + HEADER,
    durationInFrames: 1,
    fps: 1,
  };
};

export const Sheet: React.FC<SheetProps> = (p) => {
  const l = layoutOf(p);
  return (
    <AbsoluteFill
      style={{
        background: THEME.background,
        color: THEME.foreground,
        fontFamily: THEME.text,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: SHEET_GEOMETRY.margin,
          top: 20,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {p.title}
      </div>
      {p.tiles.map((tile, i) => (
        <div
          key={tile.src}
          style={{
            position: "absolute",
            left: l.cells[i]?.x,
            top: (l.cells[i]?.y ?? 0) + HEADER,
            width: p.tileWidth,
          }}
        >
          <Img
            src={staticFile(tile.src)}
            style={{
              width: p.tileWidth,
              height: p.tileHeight,
              display: "block",
              outline: `1px solid ${THEME.foreground}33`,
            }}
          />
          <div
            style={{
              height: SHEET_GEOMETRY.captionHeight,
              fontSize: 20,
              lineHeight: "28px",
              paddingTop: 6,
              opacity: 0.85,
            }}
          >
            {String(i + 1)}. {tile.caption}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
