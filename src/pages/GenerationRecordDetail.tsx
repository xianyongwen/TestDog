import { useEffect, useState } from 'react';
import { Drawer, Empty, Spin, Tag, Typography, App, Space, Collapse, Descriptions, Button } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { http } from '../api/client';
import { fmtToken, type TokenUsage } from '../utils/token';
import CacheRatePie from '../components/CacheRatePie';

const { Text, Paragraph } = Typography;

interface GenStep {
  id: string;
  type: string;
  stepIndex: number | null;
  message: string | null;
  system: string | null;
  user: string | null;
  assistant: string | null;
  tool: string | null;
  args: unknown;
  result: string | null;
  error: string | null;
  usage: TokenUsage | null;
  createdAt: string;
}

interface GenLogDetail {
  id: string;
  jobId: string;
  status: string;
  nl: string;
  startUrl?: string | null;
  totalUsage: TokenUsage | null;
  scriptSteps: unknown;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  testCase?: { id: string; title: string } | null;
  steps: GenStep[];
}

const TYPE_META = (t: TFunction): Record<string, { color: string; label: string }> => ({
  user_input: { color: 'purple', label: t('genRecordDetail.typeMeta.user_input') },
  plan: { color: 'blue', label: t('genRecordDetail.typeMeta.plan') },
  aifix: { color: 'orange', label: t('genRecordDetail.typeMeta.aifix') },
  vision: { color: 'cyan', label: t('genRecordDetail.typeMeta.vision') },
  tool: { color: 'geekblue', label: t('genRecordDetail.typeMeta.tool') },
  status: { color: 'default', label: t('genRecordDetail.typeMeta.status') },
  plan_confirmed: { color: 'green', label: t('genRecordDetail.typeMeta.plan_confirmed') },
  revoke: { color: 'volcano', label: t('genRecordDetail.typeMeta.revoke') },
  assist: { color: 'gold', label: t('genRecordDetail.typeMeta.assist') },
  done: { color: 'success', label: t('genRecordDetail.typeMeta.done') },
  error: { color: 'error', label: t('genRecordDetail.typeMeta.error') },
});

const STATUS_META = (t: TFunction): Record<string, { color: string; label: string }> => ({
  RUNNING: { color: 'processing', label: t('status.run.RUNNING') },
  DONE: { color: 'success', label: t('generate.done') },
  ERROR: { color: 'error', label: t('generate.error') },
  CANCELLED: { color: 'default', label: t('generate.cancelled') },
  PAUSED: { color: 'warning', label: t('generate.pausedTitle') },
});

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  return (
    <Button
      size="small"
      type="text"
      icon={<CopyOutlined />}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => message.success(t('common.copySuccess')),
          () => message.error(t('common.copyFailed')),
        );
      }}
    />
  );
}

function CodeBlock({ value }: { value: string }) {
  const { t } = useTranslation();
  if (!value) return <Text type="secondary">{t('common.empty')}</Text>;
  return (
    <pre
      className="m-0 max-h-[360px] overflow-auto rounded-md bg-code p-3 text-xs leading-[1.5] text-[#d4d4d4] whitespace-pre-wrap break-words"
    >
      {value}
    </pre>
  );
}

function StepBody({ step }: { step: GenStep }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => message.success(t('common.copySuccess')),
      () => message.error(t('common.copyFailed')),
    );
  };
  const hasLLM = step.system || step.user || step.assistant;
  return (
    <div>
      {step.message && (
        <Paragraph className="mb-2">
          <Text strong>{t('genRecordDetail.note')}</Text>
          {step.message}
        </Paragraph>
      )}
      {step.error && (
        <Paragraph className="mb-2">
          <Text type="danger">{t('genRecordDetail.errorLabel', { message: step.error })}</Text>
        </Paragraph>
      )}
      {step.tool && (
        <Paragraph className="mb-2">
          <Text strong>{t('genRecordDetail.tool')}</Text>
          <Tag color="geekblue">{step.tool}</Tag>
          {step.stepIndex != null && (
            <Text type="secondary" className="ml-2">
              {t('genRecordDetail.step', { index: step.stepIndex })}
            </Text>
          )}
        </Paragraph>
      )}
      {step.result && (
        <div className="mb-2">
          <Space className="mb-1">
            <Text strong>{t('genRecordDetail.result')}</Text>
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(step.result!)} />
          </Space>
          <CodeBlock value={step.result} />
        </div>
      )}
      {step.args != null && (
        <div className="mb-2">
          <Text strong>{t('genRecordDetail.args')}</Text>
          <CodeBlock value={JSON.stringify(step.args, null, 2)} />
        </div>
      )}
      {hasLLM && (
        <Collapse
          size="small"
          ghost
          items={[
            step.system
              ? {
                  key: 'system',
                  label: <Text strong>System</Text>,
                  children: <CodeBlock value={step.system} />,
                  extra: <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(step.system!)} />,
                }
              : { key: 'sys-empty', label: 'System', children: <Text type="secondary">{t('common.empty')}</Text> },
            step.user
              ? {
                  key: 'user',
                  label: <Text strong>User</Text>,
                  children: <CodeBlock value={step.user} />,
                  extra: <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(step.user!)} />,
                }
              : { key: 'user-empty', label: 'User', children: <Text type="secondary">{t('common.empty')}</Text> },
            step.assistant
              ? {
                  key: 'assistant',
                  label: <Text strong>Assistant</Text>,
                  children: <CodeBlock value={step.assistant} />,
                  extra: <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(step.assistant!)} />,
                }
              : { key: 'asst-empty', label: 'Assistant', children: <Text type="secondary">{t('common.empty')}</Text> },
          ]}
        />
      )}
    </div>
  );
}

export default function GenerationRecordDetail({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<GenLogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const typeMeta = TYPE_META(t);
  const statusMeta = STATUS_META(t);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    http
      .get<GenLogDetail>(`/api/generation-logs/${id}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Drawer
      title={t('genRecordDetail.title')}
      open={!!id}
      onClose={onClose}
      width={900}
      destroyOnClose
    >
      {loading || !data ? (
        <div className="p-20 text-center">
          <Spin />
        </div>
      ) : (
        <div>
          <Descriptions size="small" column={2} bordered className="mb-4">
            <Descriptions.Item label={t('common.status')}>
              <Tag color={statusMeta[data.status]?.color}>{statusMeta[data.status]?.label ?? data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('runs.case')}>
              {data.testCase?.title ?? <Text type="secondary">{t('common.unlinked')}</Text>}
            </Descriptions.Item>
            <Descriptions.Item label={t('genRecords.naturalLanguage')} span={2}>
              {data.nl || <Text type="secondary">{t('common.empty')}</Text>}
            </Descriptions.Item>
            <Descriptions.Item label={t('common.baseUrl')}>{data.startUrl || <Text type="secondary">—</Text>}</Descriptions.Item>
            <Descriptions.Item label={t('common.tokenUsage')}>
              {data.totalUsage ? (
                <>
                  {t('genRecordDetail.usageText', {
                    total: fmtToken(data.totalUsage.totalTokens),
                    cached: fmtToken(data.totalUsage.cachedTokens),
                  })}
                  <CacheRatePie cached={data.totalUsage.cachedTokens} input={data.totalUsage.inputTokens} total={data.totalUsage.totalTokens} />
                </>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('common.startTime')}>{new Date(data.createdAt).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label={t('common.endTime')}>
              {data.finishedAt ? new Date(data.finishedAt).toLocaleString() : <Text type="secondary">—</Text>}
            </Descriptions.Item>
            {data.error && (
              <Descriptions.Item label={t('generate.error')} span={2}>
                <Text type="danger">{data.error}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          <h3 className="mt-2">{t('genRecordDetail.stepsTitle', { count: data.steps.length })}</h3>
          {data.steps.length === 0 ? (
            <Empty description={t('genRecordDetail.noSteps')} />
          ) : (
            <Collapse
              accordion={false}
              ghost
              items={data.steps.map((s, idx) => {
                const meta = typeMeta[s.type] ?? { color: 'default', label: s.type };
                const tagLabel = s.type === 'tool' && s.tool ? s.tool : meta.label;
                const u = s.usage;
                const usageText = u ? t('genRecordDetail.usageText', { total: fmtToken(u.totalTokens), cached: fmtToken(u.cachedTokens) }) : '';
                return {
                  key: s.id,
                  label: (
                    <Space>
                      <Text type="secondary" className="inline-block min-w-8">
                        #{idx + 1}
                      </Text>
                      <Tag color={meta.color}>{tagLabel}</Tag>
                      {s.stepIndex != null && <Text type="secondary">{t('genRecordDetail.step', { index: s.stepIndex })}</Text>}
                      <Text className="max-w-[360px]" ellipsis>
                        {s.message || s.tool || (s.user ? s.user.slice(0, 40) + (s.user.length > 40 ? '…' : '') : '—')}
                      </Text>
                      {u && usageText && (
                        <Text type="secondary">
                          · {usageText}
                          <CacheRatePie cached={u.cachedTokens} input={u.inputTokens} total={u.totalTokens} />
                        </Text>
                      )}
                    </Space>
                  ),
                  children: <StepBody step={s} />,
                };
              })}
            />
          )}
        </div>
      )}
    </Drawer>
  );
}
