/** Accent colors shared by the robot avatar and trick animation renderers.
 *
 * Some robots ship very dark accents (e.g. Achilles' deep green) that read as
 * the same dark ink (`--robot-ink: #23232e`) as the outlines, visor, and
 * limbs' dark edges. When that happens the limbs wash into black tubes and the
 * eyes vanish on the visor. These lift those accents — keeping hue and
 * saturation — until they clear a luminance floor, so limbs, eyes, joints, and
 * boots stay visible. Already-bright accents pass through unchanged. */

const ACCENT_DARK_LUM = 0.19; // below this an accent reads as ink
const ACCENT_TARGET_LUM = 0.45; // enough to pop against the dark ink

function relativeLuminance(hex: string): number {
  const [r, g, b] = hex.replace('#', '').match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function accentHexToHsl(hex: string) {
  const [r, g, b] = hex.replace('#', '').match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToAccentHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return `#${[f(0), f(8), f(4)]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Guarded accent: the robot's accent, lightened if it would otherwise blend
 * into the dark ink used for outlines, visor, and limb edges. */
export function readableAccent(accent: string): string {
  if (relativeLuminance(accent) >= ACCENT_DARK_LUM) return accent;
  const { h, s } = accentHexToHsl(accent);
  for (let l = 50; l <= 96; l += 2) {
    const candidate = hslToAccentHex(h, s, l / 100);
    if (relativeLuminance(candidate) >= ACCENT_TARGET_LUM) return candidate;
  }
  return hslToAccentHex(h, s, 0.96);
}
