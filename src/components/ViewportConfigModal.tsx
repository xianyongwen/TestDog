import { useEffect, useState } from 'react';
import { App, InputNumber, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { http } from '../api/client';
import { VIEWPORT_PRESETS, VIEWPORT_MIN, VIEWPORT_MAX, type ViewportSize } from '@shared/viewport';

export interface ViewportProjectRef {
  id: string;
  name: string;
  viewport?: ViewportSize | null;
}

/** 预览区可视范围：矩形按比例缩放到该区域内展示。 */
const PREVIEW_BOX_W = 200;
const PREVIEW_BOX_H = 110;

/**
 * 项目级浏览器窗口尺寸配置（项目列表操作列入口）：
 * 运行脚本与生成脚本启动浏览器时使用。预设参考 Chrome DevTools 设备工具栏
 * （常用桌面/手机/平板），另支持自定义宽高；「默认」= 不存储，回落全局 1920×1080。
 */
export default function ViewportConfigModal({
  project,
  open,
  onClose,
  onSaved,
}: {
  project: ViewportProjectRef | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  // 'default' | 'custom' | 预设 key（`${w}x${h}`）
  const [value, setValue] = useState<string>('default');
  const [width, setWidth] = useState<number | null>(1280);
  const [height, setHeight] = useState<number | null>(800);
  const [saving, setSaving] = useState(false);

  // 打开时按项目当前配置初始化：命中预设 → 选中预设；有尺寸未命中 → 自定义；未配置 → 默认
  useEffect(() => {
    if (!open || !project) return;
    const vp = project.viewport ?? null;
    if (!vp) {
      setValue('default');
    } else if (VIEWPORT_PRESETS.some((p) => p.key === `${vp.width}x${vp.height}`)) {
      setValue(`${vp.width}x${vp.height}`);
    } else {
      setValue('custom');
      setWidth(vp.width);
      setHeight(vp.height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  const preset = VIEWPORT_PRESETS.find((p) => p.key === value);
  const customValid =
    value !== 'custom' ||
    (width != null && height != null &&
      width >= VIEWPORT_MIN && width <= VIEWPORT_MAX &&
      height >= VIEWPORT_MIN && height <= VIEWPORT_MAX);

  // 待保存值：默认 → null（清除配置回落 1920×1080）；自定义 → 宽高对象；预设 → 预设尺寸
  const current: ViewportSize | null =
    value === 'default' ? null
    : value === 'custom' ? (width != null && height != null ? { width, height } : null)
    : preset ? { width: preset.width, height: preset.height }
    : null;

  const save = async () => {
    if (!project) return;
    if (!customValid) {
      message.warning(t('projects.viewportInvalid', { min: VIEWPORT_MIN, max: VIEWPORT_MAX }));
      return;
    }
    setSaving(true);
    try {
      await http.put(`/api/projects/${project.id}`, { viewport: current });
      message.success(t('projects.viewportSaved'));
      onSaved?.();
      onClose();
    } catch (e) {
      message.error(t('projects.saveFailed', { err: String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { value: 'default', label: t('projects.viewportDefault') },
    { value: 'custom', label: t('projects.viewportCustom') },
    ...(['desktop', 'phone', 'tablet'] as const).map((g) => ({
      label:
        g === 'desktop' ? t('projects.viewportGroupDesktop')
        : g === 'phone' ? t('projects.viewportGroupPhone')
        : t('projects.viewportGroupTablet'),
      options: VIEWPORT_PRESETS.filter((p) => p.group === g).map((p) => ({
        value: p.key,
        label: p.label ? `${p.label}（${p.width} × ${p.height}）` : `${p.width} × ${p.height}`,
      })),
    })),
  ];

  // 预览矩形：等比缩放；「默认」按实际生效的 1920×1080 展示
  const isDefault = value === 'default';
  const preview = current ?? { width: 1920, height: 1080 };
  const scale = Math.min(PREVIEW_BOX_W / preview.width, PREVIEW_BOX_H / preview.height);

  return (
    <Modal
      title={t('projects.viewportManager', { suffix: project ? ` · ${project.name}` : '' })}
      open={open}
      onOk={save}
      onCancel={onClose}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      okButtonProps={{ disabled: !customValid }}
      width={480}
      destroyOnClose
    >
      <div className="text-xs text-ink-2">{t('projects.viewportHint')}</div>
      <Select className="mt-3 w-full" value={value} onChange={(v) => setValue(v)} options={options} />
      {value === 'custom' && (
        <div className="mt-3 flex items-center gap-2">
          <InputNumber
            className="w-[130px]"
            min={VIEWPORT_MIN}
            max={VIEWPORT_MAX}
            precision={0}
            value={width}
            onChange={setWidth}
            status={!customValid ? 'error' : undefined}
            placeholder={t('projects.viewportCustom')}
          />
          <span className="text-ink-2">×</span>
          <InputNumber
            className="w-[130px]"
            min={VIEWPORT_MIN}
            max={VIEWPORT_MAX}
            precision={0}
            value={height}
            onChange={setHeight}
            status={!customValid ? 'error' : undefined}
            placeholder={t('projects.viewportCustom')}
          />
          <span className="text-xs text-ink-2">px</span>
        </div>
      )}
      <div className="mt-4">
        <div className="mb-1.5 text-xs text-ink-2">{t('projects.viewportPreview')}</div>
        <div className="flex h-[150px] flex-col items-center justify-center gap-2 rounded border border-dashed border-line bg-subtle">
          <div
            className="rounded border-2 border-accent bg-accent-subtle"
            style={{ width: Math.round(preview.width * scale), height: Math.round(preview.height * scale) }}
          />
          <div className="text-xs text-accent">
            {preview.width} × {preview.height}
            {isDefault && ` · ${t('projects.viewportDefaultTag')}`}
          </div>
        </div>
      </div>
    </Modal>
  );
}
