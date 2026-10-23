export interface Control {
  key: string;
  min: number;
  max: number;
  step: number;
}

const SPEED: Control = { key: "speed", min: 0, max: 4, step: 0.05 };

// Every range sits inside what the effect's validation accepts, so a slider
// can never throw VisError (dither waveFrequency > 0, terminal scale > 0, ...).
export const CONTROLS: Record<string, Control[]> = {
  dither: [
    SPEED,
    { key: "waveSpeed", min: 0, max: 0.5, step: 0.005 },
    { key: "waveFrequency", min: 0.5, max: 8, step: 0.1 },
    { key: "waveAmplitude", min: 0, max: 1, step: 0.01 },
    { key: "colorNum", min: 2, max: 16, step: 1 },
    { key: "pixelSize", min: 1, max: 8, step: 1 },
  ],
  pixel: [
    SPEED,
    { key: "pixelSize", min: 1, max: 12, step: 1 },
    { key: "patternScale", min: 0.5, max: 6, step: 0.1 },
    { key: "patternDensity", min: 0, max: 4, step: 0.1 },
    { key: "edgeFade", min: 0, max: 1, step: 0.05 },
  ],
  terminal: [
    SPEED,
    { key: "scale", min: 0.5, max: 3, step: 0.1 },
    { key: "digitSize", min: 0.5, max: 3, step: 0.1 },
    { key: "scanlineIntensity", min: 0, max: 1, step: 0.05 },
    { key: "glitchAmount", min: 0, max: 3, step: 0.1 },
    { key: "flickerAmount", min: 0, max: 2, step: 0.1 },
    { key: "noiseAmp", min: 0, max: 2, step: 0.1 },
    { key: "curvature", min: 0, max: 1, step: 0.05 },
    { key: "brightness", min: 0, max: 2, step: 0.05 },
  ],
  glitch: [SPEED, { key: "glitchSpeed", min: 10, max: 500, step: 10 }],
  ribbon: [
    SPEED,
    { key: "lines", min: 1, max: 400, step: 1 },
    { key: "twist", min: -3, max: 3, step: 0.1 },
    { key: "amplitude", min: 0, max: 1, step: 0.01 },
    { key: "frequency", min: 0.1, max: 8, step: 0.1 },
    { key: "strokeWidth", min: 0.5, max: 4, step: 0.5 },
    { key: "opacity", min: 0, max: 1, step: 0.05 },
    { key: "drift", min: -3, max: 3, step: 0.1 },
  ],
};

/** Range inputs showing `shown`; `onChange` receives the one-key patch. */
export function bindControls(
  form: HTMLElement,
  controls: Control[],
  shown: Record<string, unknown>,
  onChange: (patch: Record<string, number>) => void,
): void {
  for (const c of controls) {
    const label = document.createElement("label");
    label.textContent = c.key;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(c.min);
    input.max = String(c.max);
    input.step = String(c.step);
    const v = shown[c.key];
    input.value = String(typeof v === "number" ? v : c.min);
    input.name = c.key;
    const out = document.createElement("output");
    out.textContent = input.value;
    input.addEventListener("input", () => {
      out.textContent = input.value;
      onChange({ [c.key]: Number(input.value) });
    });
    form.append(label, input, out);
  }
}
