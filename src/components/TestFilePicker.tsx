import { useEffect, useState } from 'react';
import { App, Button, Select, Space, Tooltip, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { http } from '../api/client';

export interface TestFileInfo { id: string; name: string; size: number }
export default function TestFilePicker({ projectId, value, onChange, onFilesChange, disabled = false, compact = false, refreshKey = 0 }: {
  projectId?: string | null; value?: string[]; onChange?: (ids: string[]) => void; onFilesChange?: (files: TestFileInfo[]) => void; disabled?: boolean; compact?: boolean; refreshKey?: number;
}) {
  const { message } = App.useApp();
  const [files, setFiles] = useState<TestFileInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/projects/${encodeURIComponent(projectId ?? '')}/test-files`;
  useEffect(() => {
    let alive = true;
    setFiles([]);
    if (projectId) http.get<TestFileInfo[]>(endpoint).then(list => { if (alive) setFiles(list); }).catch(e => { if (alive) message.error(String(e)); });
    return () => { alive = false; };
  }, [endpoint, projectId, message, refreshKey]);
  useEffect(() => { onFilesChange?.(files); }, [files, onFilesChange]);
  return <Space wrap={!compact} className={compact ? 'shrink-0' : undefined}>
    {onChange && <Select mode="multiple" size="small" style={{ minWidth: 160, maxWidth: 300 }} placeholder="选择测试文件" disabled={disabled || !projectId || busy}
      value={value ?? []} options={files.map(f => ({ value: f.id, label: `${f.name} (${f.size} B · ${f.id.slice(0, 8)})` }))}
      onChange={ids => { if (ids.length <= 5) onChange(ids); else message.warning('最多选择 5 个文件'); }} />}
    <Upload showUploadList={false} disabled={disabled || !projectId || busy} beforeUpload={file => {
      if (file.size > 20 * 1024 * 1024) { message.error('单文件上限 20MB'); return false; }
      setBusy(true);
      const body = new FormData(); body.append('files', file);
      http.upload<TestFileInfo>(endpoint, body).then(saved => {
        setFiles(prev => [...prev, saved]);
        if (onChange && (value?.length ?? 0) < 5) onChange([...(value ?? []), saved.id]);
        message.success(`测试文件已保存：${saved.name}`);
      }).catch(e => message.error(String(e))).finally(() => setBusy(false));
      return false;
    }}>
      <Tooltip title={<>
        <div>添加测试文件 · 保留原文件供上传与回放</div>
        <div>项目测试文件 {files.length} 个{files.length ? `：${files.map(f => f.name).join('、')}` : ''}</div>
      </>}>
        <Button size={compact ? 'middle' : 'small'} aria-label="添加测试文件" icon={<UploadOutlined />} loading={busy} disabled={disabled || !projectId}>
          {compact ? null : '添加测试文件'}
        </Button>
      </Tooltip>
    </Upload>
  </Space>;
}
