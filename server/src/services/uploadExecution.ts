import type { Page, Locator } from 'playwright-core';
import type { TestStep } from '../shared/testScript';
import { loadTestFiles } from './testFileService';

/** Shared by generation and replay; resolving files always precedes browser mutations. */
export async function executeUpload(page: Page, locator: Locator, upload: NonNullable<TestStep['upload']>, projectId?: string | null, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const files = await loadTestFiles(projectId, upload.fileIds);
  signal?.throwIfAborted();
  if (upload.mode === 'input') {
    if (!await locator.isEnabled()) throw new Error('上传控件已禁用');
    const info = await locator.evaluate((el: any) => ({ file: el.tagName === 'INPUT' && el.type === 'file', multiple: el.multiple }));
    if (!info.file) throw new Error('input 模式目标必须是 input[type=file]');
    if (files.length > 1 && !info.multiple) throw new Error('该上传控件不支持多文件');
    signal?.throwIfAborted();
    await locator.setInputFiles(files, { timeout: 15000 });
  } else {
    // Remove the listener even if click fails, so a later upload cannot receive this operation's files.
    let receive!: (chooser: any) => void;
    const pending = new Promise<any>(resolve => { receive = resolve; });
    page.on('filechooser', receive);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('等待文件选择器超时')), 15000); });
      const [chooser] = await Promise.race([Promise.all([pending, locator.click({ timeout: 15000 })]), deadline]);
      if (files.length > 1 && !chooser.isMultiple()) throw new Error('该上传控件不支持多文件');
      signal?.throwIfAborted();
      await chooser.setFiles(files, { timeout: 15000 });
    } finally { clearTimeout(timer); page.off('filechooser', receive); }
  }
  return files.map(file => file.name);
}
