export const BASE = '/api';

export async function fetchJson<T>(url: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(errorMessage ?? `Request failed: ${res.status}`);
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
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    const form = new FormData();
    buildForm(form);
    xhr.send(form);
  });
}
