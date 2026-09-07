import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

/** 缓存命中率占比小饼图：圆盘按命中比例着色，tooltip 显示具体百分比；无缓存命中时不渲染。 */
export default function CacheRatePie({ cached, input, total }: { cached?: number; input?: number; total?: number }) {
  const { t } = useTranslation();
  const denom = input && input > 0 ? input : (total ?? 0);
  if (!cached || denom <= 0) return null;
  const pct = Math.min(100, (cached / denom) * 100);
  return (
    <Tooltip title={t('common.cacheHitRate', { rate: `${Math.round(pct)}%` })}>
      <span
        className="ml-1 inline-block h-3 w-3 rounded-full"
        style={{ background: `conic-gradient(var(--tk-success) 0 ${pct}%, var(--tk-text-tertiary) ${pct}% 100%)`, verticalAlign: '-2px' }}
      />
    </Tooltip>
  );
}
