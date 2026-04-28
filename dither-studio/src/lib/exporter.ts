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
 * Uses requestVideoFrameCallback when available for frame-accurate capture.
 */
export function seekVideoTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const anyVid = video as any;
    if (typeof anyVid.requestVideoFrameCallback === 'function') {
      const onFrame = () => resolve();
      anyVid.requestVideoFrameCallback(onFrame);
      video.currentTime = t;
    } else {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        // small extra delay to be safe on Chromium
        requestAnimationFrame(() => resolve());
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = t;
    }
  });
}
