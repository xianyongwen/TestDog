import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { App, Tooltip, Spin, Image } from 'antd';
import {
  InboxOutlined,
  FileImageOutlined,
  FileTextOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import Compressor from 'compressorjs';
import { http } from '../api/client';

export interface AttachmentItem {
  id?: string;
  name: string;
  size: number;
  mime: string;
  isImage: boolean;
  /** 服务端归一化结果预览（文本提取 / 图片描述） */
  contentPreview?: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  /** 图片本地对象 URL（缩略图） */
  preview?: string;
}

interface Props {
  attachments: AttachmentItem[];
  onChange: (value: AttachmentItem[] | ((prev: AttachmentItem[]) => AttachmentItem[])) => void;
  max?: number;
  children?: ReactNode;
}

export interface AttachmentUploadHandle {
  /** 弹出系统文件选择框（供外部按钮触发）。 */
  pick: () => void;
  /** 供外部（如 textarea onPaste）添加文件，内部去重上限并逐个上传。 */
  addFiles: (files: File[]) => void;
  /** 移除一个附件（释放预览 URL 并通知服务端删除）。 */
  remove: (item: AttachmentItem) => void;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 可压缩的位图类型；gif（动图）/svg（矢量）跳过，避免破坏内容。 */
const COMPRESSABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);

/** 用 compressorjs 压缩图片后返回 File；失败或非位图时原样返回。 */
function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!COMPRESSABLE_TYPES.has(file.type)) {
      resolve(file);
      return;
    }
    new Compressor(file, {
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1920,
      checkOrientation: true,
      success(result) {
        resolve(new File([result], file.name, { type: result.type || file.type }));
      },
      error() {
        resolve(file);
      },
    });
  });
}

/** 附件标签列表（可复用：默认渲染在表单下方，也可由调用方放到任意位置）。 */
export function AttachmentChips({ items, onRemove }: { items: AttachmentItem[]; onRemove: (a: AttachmentItem) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <Tooltip
          key={a.name + a.size + (a.id ?? '')}
          title={
            a.status === 'error'
              ? a.error
              : a.status === 'uploading'
                ? t('attachment.uploading')
                : a.contentPreview
                  ? `${t('attachment.extracted')}${a.contentPreview}${a.contentPreview.length >= 5000 ? '…' : ''}`
                  : a.isImage
                    ? t('attachment.directMultimodal')
                    : a.name
          }
        >
          <div className="flex items-center gap-1.5 rounded-md border border-line-subtle bg-subtle px-2 py-1">
            {a.isImage && a.preview ? (
              <Image
                src={a.preview}
                width={32}
                height={32}
                className="cursor-zoom-in rounded object-cover"
                alt={a.name}
                preview={{ mask: <span className="text-xs">{t('attachment.preview')}</span> }}
              />
            ) : a.isImage ? (
              <FileImageOutlined className="text-xl text-accent" />
            ) : (
              <FileTextOutlined className="text-lg text-accent" />
            )}
            <div className="max-w-[150px]">
              <div className="truncate text-xs">{a.name}</div>
              <div className={`text-[11px] ${a.status === 'error' ? 'text-danger' : 'text-ink-2'}`}>
                {a.status === 'uploading' ? (
                  <span className="inline-flex items-center gap-1">
                    <Spin size="small" /> {t('attachment.uploadingShort')}
                  </span>
                ) : a.status === 'error' ? (
                  a.error
                ) : a.isImage ? (
                  t('attachment.imageDirect')
                ) : (
                  fmtSize(a.size)
                )}
              </div>
            </div>
            <DeleteOutlined
              onClick={(e) => {
                e.stopPropagation();
                onRemove(a);
              }}
              className="cursor-pointer text-ink-2"
            />
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

const AttachmentUpload = forwardRef<AttachmentUploadHandle, Props>(function AttachmentUpload(
  { attachments, onChange, max = 5, children },
  ref,
) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef(attachments);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    listRef.current = attachments;
  }, [attachments]);

  function addFiles(files: File[]) {
    const farr = Array.from(files).filter((f) => f.size > 0);
    if (!farr.length) return;
    const cur = listRef.current;
    const take = farr.slice(0, Math.max(0, max - cur.length));
    if (!take.length) {
      message.warning(t('attachment.maxAttachments', { max }));
      return;
    }
    if (take.length < farr.length) message.warning(`${t('attachment.maxAttachments', { max })}${t('attachment.ignoredCount', { count: farr.length - take.length })}`);
    const newItems: AttachmentItem[] = take.map((f) => ({
      name: f.name,
      size: f.size,
      mime: f.type,
      isImage: f.type.startsWith('image/'),
      status: 'uploading',
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }));
    onChange([...cur, ...newItems]);
    take.forEach((f, i) => upload(newItems[i], f));
  }

  function patch(item: AttachmentItem, part: Partial<AttachmentItem>) {
    onChange((prev) => prev.map((a) => (a === item ? { ...a, ...part } : a)));
  }

  async function upload(item: AttachmentItem, file: File) {
    try {
      const toUpload = item.isImage ? await compressImage(file) : file;
      const fd = new FormData();
      fd.append('files', toUpload);
      const res = await http.upload<{ id: string; isImage: boolean; contentPreview?: string }>('/api/attachments', fd);
      patch(item, { status: 'done', id: res.id, isImage: res.isImage, contentPreview: res.contentPreview });
    } catch (e) {
      patch(item, { status: 'error', error: String(e) });
    }
  }

  function remove(item: AttachmentItem) {
    if (item.preview) URL.revokeObjectURL(item.preview);
    if (item.id) http.del(`/api/attachments/${item.id}`).catch(() => {});
    onChange((prev) => prev.filter((a) => a !== item));
  }

  useImperativeHandle(ref, () => ({ pick: () => inputRef.current?.click(), addFiles, remove }));

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {children}

      <div
        onClick={() => inputRef.current?.click()}
        className={`mt-2 hidden cursor-pointer items-center gap-2 rounded-md border border-dashed p-2.5 text-xs transition-all ${
          dragging ? 'border-accent bg-accent-subtle text-accent' : 'border-line text-ink-2'
        }`}
      >
        <InboxOutlined />
        <span>
          {t('attachment.dropHint', { max })}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          addFiles(files);
        }}
      />
    </div>
  );
});

export default AttachmentUpload;
