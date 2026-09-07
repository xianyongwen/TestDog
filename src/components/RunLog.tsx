import { useEffect, useRef } from 'react';
import { Timeline, Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import { fmtToken } from '../utils/token';
import CacheRatePie from './CacheRatePie';

export interface LogItem {
  title: React.ReactNode;
  desc?: React.ReactNode;
  color?: string; // antd Timeline color: green/red/blue/gray...
  usage?: { total: number; cached: number; input?: number }; // token 消耗（含缓存命中），显示在标题后的括号里
}

export default function RunLog({
  items,
  emptyText,
  className,
  footer,
  scrollSignal,
}: {
  items: LogItem[];
  emptyText?: string;
  /** 传入后由调用方（flex 布局）控制尺寸与滚动，不再自带 maxHeight。 */
  className?: string;
  /** 追加在轨迹末尾的内容（如人工介入面板），随轨迹一起滚动。 */
  footer?: React.ReactNode;
  /** 变化时自动滚到底部（如 footer 出现/切换时）。 */
  scrollSignal?: unknown;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, scrollSignal]);
  if (!items.length && !footer) return <Empty description={emptyText ?? t('common.waitingOutput')} className="my-6" />;
  return (
    <div
      ref={ref}
      className={`${className ?? ''} p-2.5 ${className ? '' : 'max-h-[400px] overflow-y-auto'}`}
    >
      {items.length > 0 && (
        <Timeline
          items={items.map((it) => ({
            color: it.color,
            children: (
              <div>
                <div>
                  {it.title}
                  {it.usage && (
                    <span className="ml-1.5 text-xs text-ink-2">
                      {t('runLog.usageText', { total: fmtToken(it.usage.total), cached: fmtToken(it.usage.cached) })}
                      <CacheRatePie cached={it.usage.cached} input={it.usage.input} total={it.usage.total} />
                    </span>
                  )}
                </div>
                {it.desc ? <div className="text-xs text-ink-2">{it.desc}</div> : null}
              </div>
            ),
          }))}
        />
      )}
      {footer}
    </div>
  );
}
