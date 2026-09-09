import { browserAssertionTypes, expectedAssertionTypes } from '@shared/testIntent';
import { useEffect, useRef, useState } from 'react';
import { App, Button, Input, Modal, Select, Space, Tag, Tooltip } from 'antd';
import { AimOutlined, ArrowDownOutlined, ArrowUpOutlined, CloseCircleOutlined, DeleteOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Locator, TestStep } from '@shared/testScript';
import { extractVars, KNOWN_SYSTEM_NAMES } from '@shared/envVars';
import { STEP_ACTION_LABEL, stepActionDisplay } from '@shared/constants';
import { http, pluginsApi } from '../api/client';
import { arrayMove } from '@dnd-kit/sortable';
import SortableTable from './SortableTable';

const ACTIONS = ['goto', 'click', 'fill', 'press', 'check', 'select', 'assert', 'wait', 'raw'] as const;
/** 项目可用的插件语义动作（/api/plugin-actions 条目），与普通动作并列进动作下拉。 */
interface PluginVocabEntry {
  name: string;
  doc?: string;
  label?: string;
  pluginName?: string;
}
const STRATEGIES = ['testid', 'role', 'label', 'placeholder', 'text', 'alt', 'title', 'css', 'xpath', 'response', 'websocket'] as const;
/** 定位策略标签：未列出者直接显示英文值。 */
const STRATEGY_LABEL = (t: TFunction): Record<string, string> => ({
  response: t('stepsTable.strategyLabel.response'),
  websocket: t('stepsTable.strategyLabel.websocket'),
  alt: t('stepsTable.strategyLabel.alt'),
  title: t('stepsTable.strategyLabel.title'),
});
const NEEDS_LOCATOR = ['click', 'fill', 'press', 'check', 'select', 'assert', 'plugin'];

interface Props {
  steps: TestStep[];
  onChange: (steps: TestStep[]) => void;
  extra?: (step: TestStep, index: number) => React.ReactNode;
  /** 项目已定义的环境变量键；传入后会对 {{变量}} 做未定义校验，不传则仅做格式检测。 */
  envVarKeys?: string[];
  /** 提供起始地址后，在「定位值 / 角色」列末尾显示拾取图标，从浏览器页面点选元素生成定位器。 */
  pickStartUrl?: string;
  /** 拾取时的登录配置：以已登录状态（storageState）打开目标页。 */
  pickLoginConfigId?: string;
  /** 可选的登录配置列表：提供后点击「弹窗内」标签会先弹框选择登录配置再打开拾取页面。 */
  pickLoginConfigs?: { id: string; name: string; isDefault?: boolean }[];
  /** 拾取浏览器的窗口尺寸来源项目（项目配置了窗口尺寸时按其打开，未配置回落默认）。 */
  pickProjectId?: string | null;
  /** 项目的插件语义动作词表来源项目（动作下拉并列追加插件语义动作）。 */
  projectId?: string | null;
  /** 撑满父容器剩余高度（父容器需有确定高度）：表格内部滚动（表头固定），「添加步骤」固定在底部。 */
  fill?: boolean;
}

/** 检测文本中的 {{变量名}}（环境变量与系统变量统一写法），渲染为小标签：
 *  系统变量（内置名单）与环境变量键绿色；其余标橙「未定义」。 */
function VarHints({ text, envVarKeys }: { text?: string; envVarKeys?: string[] }) {
  const { t } = useTranslation();
  const vars = extractVars(text);
  if (!vars.length) return null;
  const hasList = envVarKeys !== undefined;
  // 已知 = 项目环境变量键 + 内置系统变量名单（如 {{randomNumber[:6]}} 提取为 randomNumber）
  const known = new Set([...(envVarKeys ?? []), ...KNOWN_SYSTEM_NAMES]);
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {vars.map((v) => {
        const undefined_ = hasList && !known.has(v);
        return (
          <Tag key={v} color={undefined_ ? 'orange' : 'green'} className="m-0 text-[11px] leading-[18px]">
            {v}{undefined_ ? t('stepsTable.undefined') : ''}
          </Tag>
        );
      })}
    </div>
  );
}

export default function StepsTable({ steps, onChange, extra, envVarKeys, pickStartUrl, pickLoginConfigId, pickLoginConfigs, pickProjectId, projectId, fill }: Props) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const strategyLabel = STRATEGY_LABEL(t);
  const [pickingIdx, setPickingIdx] = useState<number | null>(null);
  /** 当前拾取的取消回调（供拾取中的「取消」按钮触发，关闭浏览器并中止轮询）。 */
  const pickCancelRef = useRef<(() => void) | null>(null);
  /** 等待选择登录配置的行号；点击「弹窗内」标签时先弹框再拾取。 */
  const [pickLoginFor, setPickLoginFor] = useState<number | null>(null);
  const [pickLoginChoice, setPickLoginChoice] = useState('');
  /** 项目可用的插件语义动作词表（动作下拉并列追加）；无项目上下文时为空、下拉保持原样。 */
  const [pluginVocab, setPluginVocab] = useState<PluginVocabEntry[]>([]);
  useEffect(() => {
    if (!projectId) {
      setPluginVocab([]);
      return;
    }
    let alive = true;
    pluginsApi.actions(projectId)
      .then((list) => {
        if (alive) setPluginVocab(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setPluginVocab([]);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);  const update = (i: number, patch: Partial<TestStep>) => {
    const next = steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  };
  const updateLoc = (i: number, patch: Partial<Locator>) => {
    const step = steps[i];
    update(i, { locator: { ...(step.locator ?? { strategy: 'css', value: '' }), ...patch } });
  };
  const remove = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
  const moveUp = (i: number) => {
    if (i <= 0) return;
    onChange(arrayMove(steps, i, i - 1));
  };
  const moveDown = (i: number) => {
    if (i >= steps.length - 1) return;
    onChange(arrayMove(steps, i, i + 1));
  };
  const add = () =>
    onChange([...steps, { kind: 'action', action: 'click', locator: { strategy: 'css', value: '' } }]);

  /** 在浏览器中拾取元素定位器：启动 headed 页面 → 用户点击元素 → 轮询结果 → 回填当前步骤。 */
  const pickLocator = async (i: number, loginOverride?: string | null) => {
    if (!pickStartUrl) return;
    // 目标页优先取脚本里 goto 步的地址（解析 {{baseUrl}}），否则用起始地址
    const gotoUrl = steps.find((s) => s.action === 'goto')?.url;
    const url = (gotoUrl ?? pickStartUrl).replace(/\{\{\s*baseUrl\s*\}\}/g, pickStartUrl);
    let cancelled = false;
    pickCancelRef.current = () => {
      cancelled = true;
    };
    setPickingIdx(i);
    try {
      const res = await http.post<{ pickId?: string; error?: string }>('/api/locator/pick', {
        url,
        loginConfigId: loginOverride === undefined ? pickLoginConfigId : loginOverride || undefined,
        ...(pickProjectId ? { projectId: pickProjectId } : {}),
      });
      if (!res.pickId) throw new Error(res.error ?? t('stepsTable.startPickFailed'));
      if (cancelled) {
        await http.post(`/api/locator/pick/${res.pickId}/cancel`).catch(() => {});
        return;
      }
      message.info(t('stepsTable.pickInfo'));
      const locator = await pollPickResult(res.pickId, () => cancelled);
      if (locator) {
        applyPicked(i, locator);
        message.success(t('stepsTable.picked'));
      }
    } catch (e) {
      message.error(String((e as Error)?.message ?? e));
    } finally {
      pickCancelRef.current = null;
      setPickingIdx(null);
    }
  };

  /** 轮询拾取结果直到 done/cancelled/error；用户点「取消」或超时后通知后端关闭浏览器。 */
  const pollPickResult = async (pickId: string, isCancelled: () => boolean): Promise<Locator | null> => {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      if (isCancelled()) break;
      await new Promise((r) => setTimeout(r, 400));
      const s = await http.get<{ status?: string; locator?: Locator; error?: string }>(`/api/locator/pick/${pickId}`);
      if (s.status === 'done' && s.locator) return s.locator;
      if (s.status === 'cancelled') {
        message.info(t('stepsTable.pickCancelled'));
        return null;
      }
      if (s.status === 'error') throw new Error(s.error ?? t('stepsTable.pickFailed'));
    }
    await http.post(`/api/locator/pick/${pickId}/cancel`).catch(() => {});
    if (isCancelled()) {
      message.info(t('stepsTable.pickCancelled'));
      return null;
    }
    throw new Error(t('stepsTable.pickTimeout'));
  };

  /** 把拾取到的定位器回填到步骤；assert 步从接口/WS 策略切回元素定位时重置断言类型。 */
  const applyPicked = (i: number, loc: Locator) => {
    const step = steps[i];
    const nextLoc: Locator = { strategy: loc.strategy, value: loc.value };
    if (loc.strategy === 'role') {
      nextLoc.role = loc.role;
      nextLoc.name = loc.name;
    }
    if (loc.scope) nextLoc.scope = loc.scope;
    const at = step.assertion?.type ?? '';
    const assertion =
      step.action === 'assert' && (at.startsWith('response_') || at.startsWith('ws_'))
        ? { ...step.assertion, type: 'visible' as any }
        : step.assertion;
    update(i, { locator: nextLoc, ...(assertion !== step.assertion ? { assertion } : {}) });
  };

  const onDragEnd = (activeId: React.Key, overId: React.Key) => {
    const from = Number(activeId);
    const to = Number(overId);
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    onChange(arrayMove(steps, from, to));
  };

  const columns: ColumnsType<TestStep> = [
    { title: '#', width: 48, render: (_v, _r, i) => i + 1 },
    {
      title: t('caseDetail.action'),
      width: 110,
      render: (_v, r, i) => {
        // 动作下拉为单一平铺列表，不区分动作由哪个插件提供：插件语义动作与普通动作并列展示。
        // 选中语义动作写入 action='plugin' + pluginAction（不绑定插件），回放按 preset 优先级链 +
        // 定位器命中（detect）自动选插件，链全败原生兜底。
        const currentValue = r.action === 'plugin' ? `plugin:${r.pluginAction?.action ?? ''}` : r.action;
        const vocabNames = new Set(pluginVocab.map((v) => v.name));
        const options: any[] = ACTIONS.map((a) => {
          if (!vocabNames.has(a)) return { value: a, label: STEP_ACTION_LABEL[a] };
          // 与语义动作同名的普通动作（如 select）：下拉只保留一个入口，值随当前行形态——
          // 原生步沿用原生值，语义步/新选行用语义值——避免出现两个相同文案的选项。
          return { value: r.action === a ? a : `plugin:${a}`, label: STEP_ACTION_LABEL[a] };
        });
        // 无普通动作对应的语义动作（如 set_date）直接并列在列表末尾；hover 提示展示插件动作说明
        for (const v of pluginVocab) {
          if ((ACTIONS as readonly string[]).includes(v.name)) continue;
          options.push({ value: `plugin:${v.name}`, label: v.label ?? STEP_ACTION_LABEL[v.name] ?? v.name, title: v.doc || undefined });
        }
        // 当前语义动作不在词表（插件已移除/无项目上下文）时补当前值选项保证回显
        if (r.action === 'plugin' && !options.some((o) => o.value === currentValue)) {
          const vocabLabel = pluginVocab.find((v) => v.name === r.pluginAction?.action)?.label;
          options.unshift({ value: currentValue, label: vocabLabel ?? stepActionDisplay(r.action, r.pluginAction) });
        }
        return (
          <Select
            size="small"
            value={currentValue}
            className="!w-[100px]"
            options={options}
            onChange={(v) => {
              const s = String(v);
              if (s.startsWith('plugin:')) {
                const meta = pluginVocab.find((x) => x.name === s.slice('plugin:'.length));
                update(i, { action: 'plugin', pluginAction: { action: meta?.name ?? s.slice('plugin:'.length), ...(meta?.label ? { label: meta.label } : {}) } });
              } else {
                update(i, { action: s as TestStep['action'], pluginAction: undefined });
              }
            }}
          />
        );
      },
    },
    {
      title: t('stepsTable.selectStrategy'),
      width: 120,
      render: (_v, r, i) =>
        NEEDS_LOCATOR.includes(r.action) ? (
          <Select
            size="small"
            value={r.locator?.strategy}
            className="!w-[110px]"
            placeholder={t('stepsTable.selectStrategy')}
            options={STRATEGIES.map((s) => ({ value: s, label: strategyLabel[s] ?? s }))}
            onChange={(v) => {
              const step = steps[i];
              const newLoc = { ...(step.locator ?? { strategy: 'css' as const, value: '' }), strategy: v };
              if (r.action !== 'assert') {
                update(i, { locator: newLoc });
                return;
              }
              // 切到/离开 response、websocket 时重置断言类型，避免类型与取值来源不匹配
              const isRespType = (t?: string) => !!t && t.startsWith('response_');
              const isWsType = (t?: string) => !!t && t.startsWith('ws_');
              const type =
                v === 'response'
                  ? (isRespType(step.assertion?.type) ? step.assertion!.type : 'response_status')
                  : v === 'websocket'
                    ? (isWsType(step.assertion?.type) ? step.assertion!.type : 'ws_received')
                    : (!isRespType(step.assertion?.type) && !isWsType(step.assertion?.type) ? (step.assertion?.type ?? 'visible') : 'visible');
              update(i, {
                locator: newLoc,
                assertion: { type: type as any, expected: step.assertion?.expected, jsonPath: step.assertion?.jsonPath },
              });
            }}
          />
        ) : (
          <span className="text-ink-3">-</span>
        ),
    },
    {
      title: t('stepsTable.locatorValue'),
      render: (_v, r, i) => {
        if (!NEEDS_LOCATOR.includes(r.action)) return <span className="text-ink-3">-</span>;
        let input: React.ReactNode;
        let varText: string | undefined;
        if (r.locator?.strategy === 'role') {
          varText = r.locator?.name;
          input = (
            <Space size={4}>
              <Input size="small" placeholder="role" className="!w-[90px]" value={r.locator?.role} onChange={(e) => updateLoc(i, { role: e.target.value, value: e.target.value })} />
              <Input size="small" placeholder={t('stepsTable.accessibleName')} className="!w-[130px]" value={r.locator?.name} onChange={(e) => updateLoc(i, { name: e.target.value })} />
            </Space>
          );
        } else {
          varText = r.locator?.value;
          const placeholder =
            r.locator?.strategy === 'response'
              ? t('stepsTable.responseKeyword')
              : r.locator?.strategy === 'websocket'
                ? t('stepsTable.wsKeyword')
                : t('stepsTable.selectorText');
          input = <Input size="small" placeholder={placeholder} value={r.locator?.value} onChange={(e) => updateLoc(i, { value: e.target.value })} />;
        }
        // 接口/WS 断言行没有元素定位器，不可拾取
        const canPick =
          !!pickStartUrl && r.locator?.strategy !== 'response' && r.locator?.strategy !== 'websocket';
        const picking = pickingIdx === i;
        return (
          <div>
            <div className="flex items-center gap-1">
              {r.locator?.scope && (
                <Tooltip
                  title={t('stepsTable.scopedTooltip', {
                    strategy: r.locator.scope.strategy === 'role' ? `role=${r.locator.scope.value}` : `${r.locator.scope.strategy}=${r.locator.scope.value}`,
                  })}
                >
                  <Tag color="blue" className="m-0 shrink-0 text-[11px] leading-[18px]">{t('stepsTable.inModal')}</Tag>
                </Tooltip>
              )}
              {input}
              {canPick &&
                (picking ? (
                  <Space size={0}>
                    <Tooltip title={t('stepsTable.picking')}>
                      <Button size="small" type="text" icon={<LoadingOutlined spin />} />
                    </Tooltip>
                    <Tooltip title={t('stepsTable.cancelPick')}>
                      <Button size="small" type="text" icon={<CloseCircleOutlined />} onClick={() => pickCancelRef.current?.()} />
                    </Tooltip>
                  </Space>
                ) : (
                  <Tooltip title={t('stepsTable.pickTooltip')}>
                    <Button
                      size="small"
                      type="text"
                      disabled={pickingIdx !== null}
                      icon={<AimOutlined />}
                      onClick={() => {
                        setPickLoginFor(i);
                        setPickLoginChoice(pickLoginConfigId ?? '');
                      }}
                    />
                  </Tooltip>
                ))}
            </div>
            <VarHints text={varText} envVarKeys={envVarKeys} />
          </div>
        );
      },
    },
    {
      title: t('stepsTable.params'),
      width: 200,
      render: (_v, r, i) => {
        let input: React.ReactNode;
        let varText: string | undefined;
        if (r.action === 'goto') {
          varText = r.url;
          input = <Input size="small" placeholder="URL" value={r.url} onChange={(e) => update(i, { url: e.target.value })} />;
        } else if (r.action === 'fill' || r.action === 'select') {
          varText = r.value;
          input = <Input size="small" placeholder={t('stepsTable.fillValue')} value={r.value} onChange={(e) => update(i, { value: e.target.value })} />;
        } else if (r.action === 'plugin') {
          // 语义动作步骤：主参数可编辑（回放读 pluginAction.args.value；step.value 同步写入供原生兜底）
          varText = r.value ?? (r.pluginAction?.args?.value as string | undefined);
          input = (
            <Input
              size="small"
              placeholder={t('stepsTable.fillValue')}
              value={varText}
              onChange={(e) => {
                const v = e.target.value;
                const pa = r.pluginAction;
                update(i, {
                  value: v,
                  ...(pa ? { pluginAction: { ...pa, args: { ...(pa.args ?? {}), value: v } } } : {}),
                });
              }}
            />
          );
        } else if (r.action === 'check') {
          input = <Select size="small" value={String(r.checked ?? true)} options={[{ value: 'true', label: t('stepsTable.checked') }, { value: 'false', label: t('stepsTable.unchecked') }]} onChange={(checked) => update(i, { checked: checked === 'true' })} />;
        } else if (r.action === 'press') {
          varText = r.key;
          input = <Input size="small" placeholder={t('stepsTable.pressKey')} value={r.key} onChange={(e) => update(i, { key: e.target.value })} />;
        } else if (r.action === 'wait') {
          input = <Input size="small" placeholder={t('stepsTable.waitMs')} value={r.value} onChange={(e) => update(i, { value: e.target.value })} />;
        } else if (r.action === 'assert') {
          const isResp = r.locator?.strategy === 'response';
          const isWs = r.locator?.strategy === 'websocket';
          const assertOptions = isResp
            ? [
                { value: 'response_status', label: t('stepsTable.statusCode') },
                { value: 'response_body', label: t('stepsTable.bodyContains') },
                { value: 'response_json', label: t('stepsTable.jsonField') },
              ]
            : isWs
              ? [
                  { value: 'ws_received', label: t('stepsTable.received') },
                  { value: 'ws_sent', label: t('stepsTable.sent') },
                ]
              : browserAssertionTypes.map(type => ({ value: type, label: t(`generate.assertTypes.${type}`) }));
          const showExpected = isResp || isWs || expectedAssertionTypes.includes(r.assertion?.type ?? '');
          const showJsonPath = r.assertion?.type === 'response_json' || isWs;
          const defaultType = isResp ? 'response_status' : isWs ? 'ws_received' : 'visible';
          const jsonPlaceholder = isWs ? t('stepsTable.jsonPlaceholderWs') : t('stepsTable.jsonPlaceholder');
          varText = r.assertion?.expected;
          input = (
            <Space size={4} direction="vertical" className="w-full">
              <Space size={4}>
                <Select
                  size="small"
                  value={r.assertion?.type ?? defaultType}
                  className="!w-[110px]"
                  options={assertOptions}
                  onChange={(v) => update(i, { assertion: { type: v as any, expected: r.assertion?.expected, jsonPath: r.assertion?.jsonPath } })}
                />
                {showExpected && (
                  <Input
                    size="small"
                    placeholder={t('stepsTable.expectedValue')}
                    className="!w-[110px]"
                    value={r.assertion?.expected}
                    onChange={(e) => update(i, { assertion: { type: r.assertion!.type, expected: e.target.value, jsonPath: r.assertion?.jsonPath } as any })}
                  />
                )}
              </Space>
              {showJsonPath && (
                <Input
                  size="small"
                  placeholder={jsonPlaceholder}
                  value={r.assertion?.jsonPath}
                  onChange={(e) => update(i, { assertion: { type: r.assertion!.type, expected: r.assertion?.expected, jsonPath: e.target.value } as any })}
                />
              )}
            </Space>
          );
        } else {
          return <span className="text-ink-3">-</span>;
        }
        return (
          <div>
            {input}
            <VarHints text={varText} envVarKeys={envVarKeys} />
          </div>
        );
      },
    },
    {
      title: t('common.description'),
      render: (_v, r, i) => (
        <Input size="small" placeholder={t('stepsTable.stepDescription')} value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
      ),
    },
    {
      title: t('common.actions'),
      width: 160,
      render: (_v, _r, i) => (
        <Space size={4}>
          {extra?.(steps[i], i)}
          <Tooltip title={t('stepsTable.moveUp')}>
            <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => moveUp(i)} />
          </Tooltip>
          <Tooltip title={t('stepsTable.moveDown')}>
            <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === steps.length - 1} onClick={() => moveDown(i)} />
          </Tooltip>
          <Tooltip title={t('common.delete')}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    // fill：撑满父容器剩余高度，表格内部滚动（.auto-height-table 表头固定）、「添加步骤」固定在底部
    <div className={fill ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      <SortableTable
        sortable
        rowKey={(_r, i) => String(i)}
        size="small"
        dataSource={steps}
        columns={columns}
        locale={{ emptyText: t('stepsTable.noSteps') }}
        scroll={fill ? { x: 'max-content', y: 'max-content' } : { x: 'max-content' }}
        className={fill ? 'auto-height-table' : undefined}
        onSortEnd={onDragEnd}
      />
      <Button type="dashed" icon={<PlusOutlined />} className={fill ? 'mt-3 shrink-0' : 'mt-3'} onClick={add}>
        {t('stepsTable.addStep')}
      </Button>

      {/* 点击拾取图标：先选登录配置（含「不使用」），再打开拾取页面 */}
      <Modal
        open={pickLoginFor !== null}
        title={t('stepsTable.selectLoginConfig')}
        okText={t('stepsTable.openPickPage')}
        cancelText={t('common.cancel')}
        width={420}
        onOk={() => {
          const i = pickLoginFor;
          setPickLoginFor(null);
          if (i !== null) void pickLocator(i, pickLoginChoice || null);
        }}
        onCancel={() => setPickLoginFor(null)}
      >
        <div className="mb-2 text-xs text-ink-2">{t('stepsTable.pickModalHint')}</div>
        <Select
          className="!w-full"
          value={pickLoginChoice}
          onChange={setPickLoginChoice}
          options={[
            { value: '', label: t('stepsTable.noLoginConfig') },
            ...(pickLoginConfigs ?? []).map((c) => ({ value: c.id, label: c.name + (c.isDefault ? t('common.defaultTag') : '') })),
          ]}
        />
      </Modal>
    </div>
  );
}
