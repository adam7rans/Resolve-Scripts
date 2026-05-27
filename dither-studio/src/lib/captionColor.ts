/**
 * Helpers for caption color handling.
 *
 * Caption colors are stored as hex strings (e.g. "#ffffff") with a separate
 * opacity field (0..1). Older saved projects encoded alpha inside `rgba(...)`
 * strings, so these helpers tolerate either form on input and always emit
 * either a 7-char hex (for color pickers) or an `rgba(...)` string with
 * combined alpha (for actual rendering).
 */

/** Parse a hex/rgb/rgba color into [r, g, b, a] components (0..255 / 0..1). */
function parseColor(color: string): [number, number, number, number] {
  const c = (color ?? '').trim();
  if (!c) return [255, 255, 255, 1];

  // #rgb / #rrggbb / #rrggbbaa
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b, 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
  }

  const m = /^rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] != null ? Number(m[4]) : 1];
  }
  return [255, 255, 255, 1];
}

/** Return the color as a 7-char hex string (alpha is discarded). */
export function toHex(color: string): string {
  const [r, g, b] = parseColor(color);
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Return the color as `rgba(...)` with the explicit `alpha` applied.
 * Any alpha embedded in the input (e.g. `rgba(...,0.5)` or `#rrggbbaa`) is
 * intentionally discarded — the explicit `alpha` argument is the single source
 * of truth so the opacity slider in the UI behaves predictably.
 */
export function applyAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  const out = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${out.toFixed(3)})`;
}
