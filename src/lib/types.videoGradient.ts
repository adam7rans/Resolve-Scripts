import type { VideoGradientStop, VideoShaderParams } from './types.models';

export const MAX_VIDEO_GRADIENT_STOPS = 6;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function makeGradientStop(index: number, color: string, opacity: number, position: number): VideoGradientStop {
  return { id: `stop-${index + 1}`, color, opacity: clamp01(opacity), position: clamp01(position) };
}

export function createDefaultVideoGradientStops(colorA = '#000000', opacityA = 1, colorB = '#ffffff', opacityB = 1): VideoGradientStop[] {
  return [makeGradientStop(0, colorA, opacityA, 0), makeGradientStop(1, colorB, opacityB, 1)];
}

export function normalizeVideoGradientStops(
  stops: VideoGradientStop[] | undefined,
  fallbackA = '#000000',
  fallbackOpacityA = 1,
  fallbackB = '#ffffff',
  fallbackOpacityB = 1,
): VideoGradientStop[] {
  const source = Array.isArray(stops) && stops.length > 0 ? stops : createDefaultVideoGradientStops(fallbackA, fallbackOpacityA, fallbackB, fallbackOpacityB);
  const normalized = source
    .slice(0, MAX_VIDEO_GRADIENT_STOPS)
    .map((stop, index) => ({
      id: typeof stop?.id === 'string' && stop.id.length > 0 ? stop.id : `stop-${index + 1}`,
      color: typeof stop?.color === 'string' && stop.color.length > 0 ? stop.color : index === 0 ? fallbackA : fallbackB,
      opacity: clamp01(typeof stop?.opacity === 'number' ? stop.opacity : index === 0 ? fallbackOpacityA : fallbackOpacityB),
      position: clamp01(typeof stop?.position === 'number' ? stop.position : index === 0 ? 0 : 1),
    }))
    .sort((a, b) => a.position - b.position)
    .map((stop, index) => ({ ...stop, id: stop.id || `stop-${index + 1}` }));
  if (normalized.length === 1) normalized.push(makeGradientStop(1, fallbackB, fallbackOpacityB, 1));
  normalized[0] = { ...normalized[0], position: 0 };
  normalized[normalized.length - 1] = { ...normalized[normalized.length - 1], position: 1 };
  return normalized;
}

export function withGradientStops(params: VideoShaderParams, stops: VideoGradientStop[]): VideoShaderParams {
  const normalizedStops = normalizeVideoGradientStops(stops, params.gradientColorA, params.gradientOpacityA, params.gradientColorB, params.gradientOpacityB);
  const firstStop = normalizedStops[0];
  const lastStop = normalizedStops[normalizedStops.length - 1];
  return {
    ...params,
    gradientStops: normalizedStops,
    gradientColorA: firstStop.color,
    gradientOpacityA: firstStop.opacity,
    gradientColorB: lastStop.color,
    gradientOpacityB: lastStop.opacity,
  };
}
