export const BASE = '/api';

export async function fetchJson<T>(url: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = errorMessage ?? `Request failed (${res.status})`;
    try {
      const body = await res.json() as { error?: string };
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export function uploadForm<T>(
  url: string,
  buildForm: (form: FormData) => void,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error) message = body.error;
        } catch {
          // Response wasn't JSON — use the raw text if short enough
          const text = xhr.responseText?.trim();
          if (text && text.length < 200) message = `Upload failed (${xhr.status}): ${text}`;
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection'));
    const form = new FormData();
    buildForm(form);
    xhr.send(form);
  });
}
