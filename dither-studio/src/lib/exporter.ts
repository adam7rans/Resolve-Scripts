/**
 * PNG sequence exporter.
 *
 * Uses the File System Access API to write 0001.png, 0002.png, ...
 * directly into a folder the user picks (no per-frame downloads).
 *
 * In Resolve: Media Pool > Import > select first frame > "Import as image
 * sequence" -> drop on timeline.
 */

export interface FsLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

export async function pickExportDirectory(): Promise<FileSystemDirectoryHandle> {
  // @ts-expect-error - showDirectoryPicker is not in lib.dom.d.ts everywhere
  const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  return handle;
}

export function isFsAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

export async function writePng(
  dir: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(blob);
  await writable.close();
}

export function frameNumber(i: number, pad = 5): string {
  return String(i + 1).padStart(pad, '0');
}

export function formatExportTimeToken(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}m${String(secs).padStart(2, '0')}s${String(cs).padStart(2, '0')}`;
}

export function buildExportBaseName(prefix: string, startSecond: number, endSecond: number): string {
  const cleanPrefix = prefix.trim() || 'export';
  return `${cleanPrefix}_${formatExportTimeToken(startSecond)}-${formatExportTimeToken(endSecond)}`;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png'
    );
  });
}

/**
 * Seek a video to a given time and wait until the frame is actually decoded.
 *
 * Uses BOTH `requestVideoFrameCallback` and the `seeked` event (whichever
 * fires first) plus a timeout fallback, because:
 *  - `requestVideoFrameCallback` only fires when a *new* frame is rendered.
 *    Setting `currentTime` to (approximately) the current value sometimes
 *    decodes no new frame, so the callback never fires and the export hangs.
 *  - `seeked` event is more reliable but slightly less frame-accurate.
 *  - If the video is already at the target time, we resolve on the next RAF
 *    instead of waiting for events that may never fire.
 */
export function seekVideoTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const epsilon = 0.001;

    // Already at target → just wait one frame and resolve.
    if (Math.abs(video.currentTime - t) < epsilon) {
      requestAnimationFrame(() => resolve());
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timeoutId);
      resolve();
    };
    const onSeeked = () => requestAnimationFrame(finish);

    video.addEventListener('seeked', onSeeked);
    const anyVid = video as any;
    if (typeof anyVid.requestVideoFrameCallback === 'function') {
      anyVid.requestVideoFrameCallback(() => finish());
    }
    // Last-resort timeout so a single slow seek can't wedge the whole export.
    const timeoutId = window.setTimeout(finish, 2000);

    video.currentTime = t;
  });
}
