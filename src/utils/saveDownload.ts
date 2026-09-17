import { invoke, isTauri } from '@tauri-apps/api/core';

export type DownloadResult = { status: 'saved'; path: string } | { status: 'started' } | { status: 'cancelled' };

export async function saveDownload(blob: Blob, filename: string): Promise<DownloadResult> {
  if (isTauri()) {
    const path = await invoke<string | null>('save_download', {
      filename,
      data: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
    return path === null ? { status: 'cancelled' } : { status: 'saved', path };
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Allow the browser to consume the Blob before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { status: 'started' };
}
