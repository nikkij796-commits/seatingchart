export type ThemeName = 'light' | 'dark';
export const SURFACE: Record<ThemeName, string> = { light: '#ffffff', dark: '#211d2a' };

const parse = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex: string) => { const [r, g, b] = parse(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Non-text UI contrast target (WCAG 1.4.11). */
export const MIN_CONTRAST = 3;

/** Nudge a colour toward black (light theme) or white (dark theme) until it reads against the surface. */
export function adjustForTheme(hex: string, theme: ThemeName): string {
  const bg = SURFACE[theme];
  if (contrast(hex, bg) >= MIN_CONTRAST) return hex;
  const target = theme === 'light' ? [0, 0, 0] : [255, 255, 255];
  const base = parse(hex);
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const c = toHex(base.map((v, i) => v + (target[i] - v) * t));
    if (contrast(c, bg) >= MIN_CONTRAST) return c;
  }
  return toHex(target);
}

export function contrastReport(hex: string) {
  const light = contrast(hex, SURFACE.light), dark = contrast(hex, SURFACE.dark);
  return { light, dark, okLight: light >= MIN_CONTRAST, okDark: dark >= MIN_CONTRAST };
}

export const PALETTE = ['#c2570c', '#0f766e', '#be185d', '#4338ca', '#15803d', '#a16207', '#0369a1', '#9333ea', '#b91c1c', '#475569'];
