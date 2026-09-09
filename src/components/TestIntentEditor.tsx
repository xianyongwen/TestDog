import { Button, Input, Select, Space, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { browserAssertionTypes, expectedAssertionTypes, type TestIntent } from '@shared/testIntent';

/** 验收约定在原有计划确认窗口中编辑，不增加确认轮次。 */
export default function TestIntentEditor({ value, onChange }: { value: TestIntent; onChange?: (value: TestIntent) => void }) {
  const { t } = useTranslation();
  const disabled = !onChange;
  const update = (patch: Partial<TestIntent>) => onChange?.({ ...value, ...patch });
  const lines = (text: string) => text ? text.split('\n') : [];
  return <div className="mb-4 flex flex-col gap-3 rounded-md border border-line-subtle p-3">
    <strong>{t('generate.intent.title')}</strong>
    <Space wrap>
      <Select aria-label={t('generate.intent.scenario')} disabled={disabled} value={value.scenario} style={{ width: 140 }}
        options={['positive', 'negative', 'mixed'].map(v => ({ value: v, label: t(`generate.intent.${v}`) }))}
        onChange={scenario => update({ scenario })} />
      <span className="text-xs text-ink-2">{t('generate.intent.hint')}</span>
    </Space>
    <Input.TextArea aria-label={t('generate.intent.objective')} disabled={disabled} value={value.objective} autoSize
      onChange={e => update({ objective: e.target.value })} />
    <label>{t('generate.intent.preconditions')}
      <Input.TextArea disabled={disabled} value={value.preconditions.join('\n')} autoSize onChange={e => update({ preconditions: lines(e.target.value) })} />
    </label>
    <strong>{t('generate.intent.data')}</strong>
    {value.data.map((item, i) => <Space key={i} wrap>
      <Input aria-label={t('generate.intent.field')} disabled={disabled} value={item.name} placeholder={t('generate.intent.field')}
        onChange={e => update({ data: value.data.map((d, j) => j === i ? { ...d, name: e.target.value } : d) })} />
      <Input aria-label={t('stepsTable.expectedValue')} disabled={disabled} value={item.value}
        onChange={e => update({ data: value.data.map((d, j) => j === i ? { ...d, value: e.target.value } : d) })} />
      <Select disabled={disabled} value={item.policy} style={{ width: 160 }} options={['fixed', 'generated'].map(v => ({ value: v, label: t(`generate.intent.${v}`) }))}
        onChange={policy => update({ data: value.data.map((d, j) => j === i ? { ...d, policy } : d) })} />
      {!disabled && <Button onClick={() => update({ data: value.data.filter((_, j) => i !== j) })}>{t('common.delete')}</Button>}
    </Space>)}
    {!disabled && <Button onClick={() => update({ data: [...value.data, { name: '', value: '', policy: 'fixed' }] })}>{t('generate.intent.addData')}</Button>}
    <strong>{t('generate.intent.criteria')}</strong>
    {value.criteria.map((criterion, i) => {
      const patch = (p: Partial<typeof criterion>) => update({ criteria: value.criteria.map((c, j) => i === j ? { ...c, ...p } : c) });
      return <div key={criterion.id} className="flex flex-col gap-2 rounded border border-line-subtle p-2">
        <Space wrap><strong>{criterion.id}</strong>
          <Checkbox disabled={disabled} checked={criterion.required} onChange={e => patch({ required: e.target.checked })}>{t('generate.intent.required')}</Checkbox>
          {!disabled && <Button size="small" onClick={() => update({ criteria: value.criteria.filter((_, j) => i !== j) })}>{t('common.delete')}</Button>}
        </Space>
        <Input aria-label={t('generate.intent.result')} disabled={disabled} value={criterion.description} placeholder={t('generate.intent.result')} onChange={e => patch({ description: e.target.value })} />
        <Input aria-label={t('generate.intent.target')} disabled={disabled} value={criterion.target} placeholder={t('generate.intent.target')} onChange={e => patch({ target: e.target.value })} />
        <Input aria-label={t('generate.intent.source')} disabled={disabled} value={criterion.source} placeholder={t('generate.intent.source')} onChange={e => patch({ source: e.target.value })} />
        <Space wrap>
          <Select disabled={disabled} style={{ width: 190 }} value={criterion.assertion.type}
            options={browserAssertionTypes.map(type => ({ value: type, label: t(`generate.assertTypes.${type}`) }))}
            onChange={type => patch({ assertion: { type, ...(expectedAssertionTypes.includes(type) ? { expected: criterion.assertion.expected ?? '' } : {}) } })} />
          {expectedAssertionTypes.includes(criterion.assertion.type) && <Input aria-label={t('stepsTable.expectedValue')} disabled={disabled}
            value={criterion.assertion.expected} placeholder={t('stepsTable.expectedValue')} onChange={e => patch({ assertion: { ...criterion.assertion, expected: e.target.value } })} />}
        </Space>
      </div>;
    })}
    {!disabled && <Button onClick={() => {
      let next = 1;
      while (value.criteria.some(c => c.id === `C${next}`)) next++;
      update({ criteria: [...value.criteria, { id: `C${next}`, description: '', target: '', source: '', required: true, assertion: { type: 'visible' } }] });
    }}>{t('generate.intent.addCriterion')}</Button>}
    <label>{t('generate.intent.cleanup')}
      <Input.TextArea disabled={disabled} value={value.cleanup.join('\n')} autoSize onChange={e => update({ cleanup: lines(e.target.value) })} />
    </label>
  </div>;
}
