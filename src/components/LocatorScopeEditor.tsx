import { useState } from 'react';
import { Button, Input, Select, Tooltip } from 'antd';
import { AimOutlined, BorderOuterOutlined, CloseCircleOutlined, DeleteOutlined, DownOutlined, LoadingOutlined, RightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { locatorScopeSchema, type Locator } from '@shared/testScript';

type Scope = NonNullable<Locator['scope']>;

export default function LocatorScopeEditor({ scope, onChange, onPick, picking = false, pickDisabled = false, onCancelPick }: {
  scope?: Scope;
  onChange: (scope: Scope | undefined) => void;
  onPick?: () => void;
  picking?: boolean;
  pickDisabled?: boolean;
  onCancelPick?: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const pickButton = onPick && <Tooltip title={t(picking ? 'stepsTable.cancelPick' : 'stepsTable.pickScope')}>
    <Button size="small" type="text" aria-label={t(picking ? 'stepsTable.cancelPick' : 'stepsTable.pickScope')}
      disabled={!picking && pickDisabled} icon={picking ? <CloseCircleOutlined /> : <AimOutlined />}
      onClick={picking ? onCancelPick : onPick} />
  </Tooltip>;
  if (!scope) {
    return <Tooltip title={`${t('stepsTable.addScope')}：${t('stepsTable.scopeHint')}`}>
      <Button size="small" type="text" aria-label={t('stepsTable.addScope')} icon={<BorderOuterOutlined />} onClick={() => {
        onChange({ strategy: 'testid', value: '' });
        setExpanded(true);
      }} />
    </Tooltip>;
  }
  const summary = scope.strategy === 'role'
    ? `role=${scope.role || scope.value}${scope.name ? ` · ${scope.name}` : ''}`
    : `${scope.strategy}=${scope.value}`;
  return <div className="mb-1 rounded border border-line-subtle px-2 py-1">
    <div className="flex min-w-0 items-center gap-1">
      <Button type="text" size="small" className="min-w-0 flex-1 !justify-start" aria-expanded={expanded}
        icon={expanded ? <DownOutlined /> : <RightOutlined />} onClick={() => setExpanded(previous => !previous)}>
        <span className="shrink-0">{t('stepsTable.scope')}</span>
        <Tooltip title={summary}><span className="min-w-0 truncate text-ink-2">{summary}</span></Tooltip>
      </Button>
      {picking && <LoadingOutlined spin />}
      {pickButton}
      <Tooltip title={t('stepsTable.removeScope')}>
        <Button type="text" size="small" aria-label={t('stepsTable.removeScope')} icon={<DeleteOutlined />}
          onClick={() => { onChange(undefined); setExpanded(false); }} />
      </Tooltip>
    </div>
    {expanded && <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1">
        <Select size="small" className="!w-[110px]" aria-label={t('stepsTable.scopeStrategy')} value={scope.strategy}
          options={locatorScopeSchema.shape.strategy.options.map(strategy => ({ value: strategy, label: strategy }))}
          onChange={strategy => onChange({ strategy, value: '', ...(strategy === 'role' ? { role: '' } : {}) })} />
        {scope.strategy === 'role' ? <>
          <Input size="small" className="!w-[100px]" aria-label={t('stepsTable.scopeRole')} placeholder="role"
            value={scope.role ?? scope.value} onChange={event => onChange({ ...scope, role: event.target.value, value: event.target.value })} />
          <Input size="small" className="!w-auto min-w-[130px] flex-1" aria-label={t('stepsTable.scopeName')}
            placeholder={t('stepsTable.accessibleName')} value={scope.name}
            onChange={event => onChange({ ...scope, name: event.target.value })} />
        </> : <Input size="small" className="!w-auto min-w-[160px] flex-1" aria-label={t('stepsTable.scopeValue')}
          placeholder={t('stepsTable.scopeValue')} value={scope.value} onChange={event => onChange({ ...scope, value: event.target.value })} />}
      </div>
      <div className="mt-1 text-xs text-ink-3">{t('stepsTable.scopeHint')}</div>
    </div>}
  </div>;
}
