export interface TimeGap {
  start: number;
  end: number;
}

export function mergeTimeGaps(gaps: TimeGap[]): TimeGap[] {
  if (gaps.length === 0) return [];
  const sorted = gaps
    .filter((gap) => Number.isFinite(gap.start) && Number.isFinite(gap.end) && gap.end > gap.start)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [];
  const merged: TimeGap[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function sourceToOutputTime(sourceSecond: number, gaps: TimeGap[]): number {
  let removed = 0;
  for (const gap of gaps) {
    if (sourceSecond <= gap.start) break;
    removed += Math.max(0, Math.min(sourceSecond, gap.end) - gap.start);
  }
  return Math.max(0, sourceSecond - removed);
}

export function outputToSourceTime(outputSecond: number, gaps: TimeGap[], sourceDuration: number): number {
  let cursorSource = 0;
  let cursorOutput = 0;
  for (const gap of gaps) {
    if (gap.start > cursorSource) {
      const keptDur = gap.start - cursorSource;
      if (outputSecond <= cursorOutput + keptDur) {
        return Math.max(0, Math.min(sourceDuration, cursorSource + (outputSecond - cursorOutput)));
      }
      cursorOutput += keptDur;
    }
    cursorSource = Math.max(cursorSource, gap.end);
  }
  const tailDur = Math.max(0, sourceDuration - cursorSource);
  if (outputSecond <= cursorOutput + tailDur) {
    return Math.max(0, Math.min(sourceDuration, cursorSource + (outputSecond - cursorOutput)));
  }
  return Math.max(0, Math.min(sourceDuration, sourceDuration));
}
