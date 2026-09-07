import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Space, App, Alert } from 'antd';
import { ArrowLeftOutlined, VideoCameraOutlined, StopOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { http } from '../api/client';
import { ws } from '../api/ws';
import type { TestStep } from '@shared/testScript';
import StepsTable from '../components/StepsTable';
import RunLog, { type LogItem } from '../components/RunLog';

export default function Record() {
  const { caseId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [url, setUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    http.get<any>(`/api/test-cases/${caseId}`).then((d) => setUrl(d.project.baseUrl || ''));
  }, [caseId]);

  useEffect(() => {
    return ws.on((msg) => {
      if (!jobIdRef.current || msg.jobId !== jobIdRef.current) return;
      if (msg.type === 'record:status') {
        setLogs((p) => [...p, { color: 'blue', title: String(msg.message ?? t('record.recording')) }]);
      } else if (msg.type === 'record:imported') {
        setRecording(false);
        setSteps((msg.steps as TestStep[]) ?? []);
        setLogs((p) => [...p, { color: 'green', title: <strong>{t('record.importedSteps', { count: (msg.steps as any[])?.length ?? 0 })}</strong> }]);
      } else if (msg.type === 'record:error') {
        setRecording(false);
        message.error(String(msg.message ?? t('record.recordFailed')));
      }
    });
  }, [message, t]);

  const start = async () => {
    if (!url.trim()) {
      message.warning(t('record.needUrl'));
      return;
    }
    setSteps([]);
    setLogs([]);
    setRecording(true);
    const { jobId } = await http.post<{ jobId: string }>('/api/record/start', { url });
    jobIdRef.current = jobId;
  };

  const stop = async () => {
    if (jobIdRef.current) await http.post('/api/record/stop', { jobId: jobIdRef.current });
  };

  const save = async () => {
    if (!caseId || !steps.length) return;
    await http.post(`/api/test-cases/${caseId}/scripts`, { steps });
    message.success(t('record.savedNewVersion'));
    nav(`/cases/${caseId}`);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/cases/${caseId}`)}></Button>
        <h2 className="m-0 text-xl">{t('record.title')}</h2>
      </div>

      <Alert
        type="info"
        showIcon
        className="mb-4"
        message={t('record.alert')}
        description={t('record.alertDesc')}
      />

      <Card size="small" className="mb-4">
        <Space>
          <Input placeholder={t('common.baseUrlUrl')} value={url} onChange={(e) => setUrl(e.target.value)} className="!w-[420px]" />
          <Button type="primary" onClick={start} disabled={recording}><VideoCameraOutlined className="mr-1.5" />{t('record.startRecord')}</Button>
          {recording && <Button type="primary" onClick={stop}><StopOutlined className="mr-1.5" />{t('record.stopAndImport')}</Button>}
          {steps.length > 0 && <Button type="primary" onClick={save}><SaveOutlined className="mr-1.5" />{t('record.saveScript')}</Button>}
        </Space>
      </Card>

      {logs.length > 0 && (
        <Card title={t('record.progress')} size="small" className="mb-4">
          <RunLog items={logs} />
        </Card>
      )}

      {steps.length > 0 && (
        <Card title={t('record.recordedSteps', { count: steps.length })} size="small">
          <StepsTable steps={steps} onChange={setSteps} />
        </Card>
      )}
    </div>
  );
}
