import { useEffect, useState } from 'react';
import { Collapse, Form, Input, InputNumber, Select, Space, Switch, Tag, App, Alert, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { http } from '../api/client';
import { LANGUAGES, getCurrentLanguage, setLanguage, type AppLanguage } from '../i18n';
import { useThemeMode, useFontSizeScale, type ThemeMode, type FontSizeScale } from '../theme';

interface SettingsData {
  openaiApiKey: string;
  openaiApiKeySet: boolean;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiModelVision: boolean;
  maxSteps: number;
  browserPath: string;
  splitSystemPrompt: string;
  reasoningEffort: '' | 'low' | 'high' | 'max';
  defaultSplitSystemPrompt: string;
  detectedBrowserPath: string;
  systemBrowserMode: boolean;
  configured: boolean;
  generationLogRetentionDays: number | null;
}

export default function Settings() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [data, setData] = useState<SettingsData | null>(null);
  const [lang, setLang] = useState<AppLanguage>(getCurrentLanguage());
  const [mode, , setMode] = useThemeMode();
  const [fontScale, setFontScale] = useFontSizeScale();

  const load = async () => {
    const d = await http.get<SettingsData>('/api/settings');
    setData(d);
    form.setFieldsValue({
      openaiBaseUrl: d.openaiBaseUrl,
      openaiApiKey: '',
      openaiModel: d.openaiModel,
      openaiModelVision: d.openaiModelVision ?? false,
      maxSteps: d.maxSteps,
      browserPath: d.browserPath,
      splitSystemPrompt: d.splitSystemPrompt,
      reasoningEffort: d.reasoningEffort,
      generationLogRetentionDays: d.generationLogRetentionDays ?? null,
    });
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const v = await form.validateFields();
    const body: any = {
      openaiBaseUrl: v.openaiBaseUrl,
      openaiModel: v.openaiModel,
      openaiModelVision: v.openaiModelVision ?? false,
      maxSteps: v.maxSteps,
      browserPath: v.browserPath ?? '',
      splitSystemPrompt: v.splitSystemPrompt ?? '',
      reasoningEffort: v.reasoningEffort ?? '',
      // null = 永久；正数 = 保留天数；undefined = 不动（保留当前值）
      generationLogRetentionDays:
        v.generationLogRetentionDays === null || v.generationLogRetentionDays === undefined
          ? null
          : v.generationLogRetentionDays,
    };
    if (v.openaiApiKey) body.openaiApiKey = v.openaiApiKey; // 留空表示不改
    await http.post('/api/settings', body);
    message.success(t('settings.saved'));
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="m-0 text-xl">{t('settings.title')}</h2>
      </div>
      {data && !data.configured && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message={t('settings.notConfiguredAlert')}
          description={t('settings.notConfiguredAlertDesc')}
        />
      )}

      <Form form={form} layout="vertical">
        
        <Collapse
          className="max-w-[640px]"
          defaultActiveKey={['language', 'aiGateway']}
          items={[
            {
              key: 'language',
              label: t('settings.language'),
              children: (
                <Form.Item label={t('settings.languageDesc')} className="!mb-0">
                  <Select
                    className="!w-[220px]"
                    value={lang}
                    options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
                    onChange={(v: AppLanguage) => {
                      setLang(v);
                      setLanguage(v);
                    }}
                  />
                </Form.Item>
              ),
            },
            {
              key: 'appearance',
              label: t('settings.appearance'),
              children: (
                <>
                  <Form.Item label={t('settings.appearanceDesc')} className="!mb-4">
                    <Select
                      className="!w-[220px]"
                      value={mode}
                      options={[
                        { value: 'light', label: t('settings.themeLight') },
                        { value: 'dark', label: t('settings.themeDark') },
                        { value: 'system', label: t('settings.themeSystem') },
                      ]}
                      onChange={(v: ThemeMode) => setMode(v)}
                    />
                  </Form.Item>
                  <Form.Item label={t('settings.fontSize')} className="!mb-0">
                    <Select
                      className="!w-[220px]"
                      value={fontScale}
                      options={[
                        { value: 'small', label: t('settings.fontSmall') },
                        { value: 'medium', label: t('settings.fontMedium') },
                        { value: 'large', label: t('settings.fontLarge') },
                      ]}
                      onChange={(v: FontSizeScale) => setFontScale(v)}
                    />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'aiGateway',
              label: t('settings.aiGateway'),
              children: (
                <>
                  <Form.Item
                    name="openaiBaseUrl"
                    label={t('settings.baseUrlLabel')}
                    rules={[{ required: true, message: t('settings.baseUrlRequired') }]}
                  >
                    <Input placeholder="https://your-gateway.example.com/v1" />
                  </Form.Item>
                  <Form.Item
                    name="openaiApiKey"
                    label={t('settings.apiKeyLabel', {
                      suffix: data?.openaiApiKeySet ? t('settings.apiKeySetSuffix', { key: data.openaiApiKey }) : '',
                    })}
                  >
                    <Input.Password placeholder={data?.openaiApiKeySet ? t('settings.apiKeyPlaceholderSet') : 'sk-xxxx'} />
                  </Form.Item>
                  <Form.Item name="openaiModel" label={t('settings.modelName')} rules={[{ required: true }]}>
                    <Input placeholder="deepseek-v4-flash-vision-exp" />
                  </Form.Item>
                  <Form.Item
                    name="openaiModelVision"
                    label={t('settings.modelVisionLabel')}
                    valuePropName="checked"
                    tooltip={t('settings.modelVisionTooltip')}
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    name="reasoningEffort"
                    label={t('settings.reasoningEffort')}
                    tooltip={t('settings.reasoningEffortTooltip')}
                  >
                    <Select
                      options={[
                        { value: '', label: t('settings.reasoningOff') },
                        { value: 'low', label: 'Low' },
                        { value: 'high', label: 'High' },
                        { value: 'max', label: 'Max' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="maxSteps" label={t('settings.maxSteps')} rules={[{ required: true }]}>
                    <InputNumber min={1} max={1000} className="!w-[200px]" />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'browserConfig',
              label: t('settings.browserConfig'),
              children: (
                <Form.Item
                  name="browserPath"
                  label={t('settings.chromePath')}
                  tooltip={t('settings.chromePathTooltip')}
                  help={data?.detectedBrowserPath ? t('settings.chromeDetected', { path: data.detectedBrowserPath }) : t('settings.chromeNotDetected')}
                >
                  <Input placeholder={data?.detectedBrowserPath || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} />
                </Form.Item>
              ),
            },
            {
              key: 'promptConfig',
              label: t('settings.promptConfig'),
              children: (
                <>
                  <div className="mb-2 flex justify-end">
                    <Button onClick={() => form.setFieldsValue({ splitSystemPrompt: data?.defaultSplitSystemPrompt ?? '' })}>
                      {t('settings.restoreDefault')}
                    </Button>
                  </div>
                  <Form.Item
                    name="splitSystemPrompt"
                    label={t('settings.splitSystemPrompt')}
                    tooltip={t('settings.splitSystemPromptTooltip')}
                    rules={[{ required: true, message: t('settings.splitSystemPromptRequired') }]}
                  >
                    <Input.TextArea rows={10} placeholder={t('settings.splitSystemPromptPlaceholder')} className="font-mono text-xs" />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'dataRetention',
              label: t('settings.dataRetention'),
              children: (
                <Form.Item
                  name="generationLogRetentionDays"
                  label={t('settings.retentionDays')}
                  tooltip={t('settings.retentionDaysTooltip')}
                >
                  <InputNumber min={1} max={3650} placeholder={t('settings.retentionPlaceholder')} className="!w-[200px]" />
                </Form.Item>
              ),
            },
          ]}
        />

        <Space className="mt-4">
          <Button type="primary" onClick={save}>{t('common.save')}</Button>
          {data && (
            <Tag color={data.configured ? 'success' : 'default'}>
              {data.configured ? t('settings.ready') : t('settings.notConfigured')}
            </Tag>
          )}
        </Space>
      </Form>
    </div>
  );
}
