/**
 * 内置插件定义：随服务启动 seed 进 Plugin 表（source='builtin'，升级友好 upsert）。
 * 页内脚本只依赖 DOM 标准与 __ttPluginRuntimeInstalled__（运行时框架先注入）。
 *
 * 按「框架 × 组件能力域」拆分为六个独立插件，源码以自定义插件同款组织方式维护：
 * sources/<name>.js，单文件即插件源码（求值「插件定义对象」的表达式，平台封装 register
 * 并注入 id），可直接阅读/编辑，也可作为插件开发的参照范例。
 * - ant-select / el-select：组件库下拉的 select 动作 + combobox 语义候选 + 表单行 label
 *   收割 + 「勿 fill」标注；原生 <select> 由分发器原生交互层兜底 selectOption。
 * - ant-tree-select / el-tree-select：树形选择器的 select 动作兜底（平铺 option 弹层由
 *   select 插件先试，含 .ant-select-tree / .el-tree 的树形弹层由本插件展开祖先闭环后点选节点）。
 * - ant-date-picker / el-date-picker：日期选择器的 set_date 动作（fill 优先，失败走面板翻页闭环）。
 *
 * 动作遵循三态结果协议（string 返回=success / throw=failed），并声明 verify 页内后验
 * 校验终态（如选中项文本、日期回显），拦截"点了但没选上"的假成功。
 *
 * 源码加载：运行时按「本模块目录/sources/<name>.js」磁盘读取——dev/test 即
 * src/services/componentPlugins/sources/；tsup 构建后位于 dist/sources/
 * （构建时拷贝，prepare-sidecar 随 dist 一并打进安装包）。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuiltinPluginDef {
  /** 全局唯一名（Plugin.name unique）；页内 register 的 id 由平台以它注入（window.__ttPluginId__）。 */
  name: string;
  version: string;
  description: string;
  /** 页内脚本源码（求值为插件定义对象的表达式；register 调用与 id 由平台封装注入）。 */
  entryFile: string;
  /** 动作元数据（动作词表 / 管理页展示；随页内 actions 同步维护）。 */
  actionsMeta?: { name: string; doc: string; label?: string; preferFill?: boolean }[];
}

export const DEFAULT_PRESET_NAME = '默认组合';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 读取内置插件页内源码（dev/test: src/.../sources/；构建产物: dist/sources/）。 */
function loadSource(name: string): string {
  const file = path.join(MODULE_DIR, 'sources', `${name}.js`);
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    throw new Error(`内置插件源码缺失：${file}（dev 位于 src/services/componentPlugins/sources/；构建产物须随 dist/sources/ 分发）`);
  }
}

/**
 * 动作的平台级词表说明。词表按动作名去重、取 preset 优先级首个声明者的 doc，
 * 因此这些文案须覆盖整条匹配链（多框架共用），而非单一框架的用法；
 * 新框架插件复用同名词表时改这里（或按域拆新共享常量），不要只改自己的 actionsMeta。
 */
const SELECT_ACTION_DOC =
  '在下拉中选择选项（自动打开弹层并点击文本/标题匹配项，支持 Ant Design、Element、Vant 与 MUI；原生 <select> 由分发器原生交互层兜底 selectOption；树形选择器（TreeSelect/树形下拉）同样用本动作，value 传目标节点可见文本，树形弹层由 tree-select 系列内置插件兜底闭环；级联选择器（Cascader）用本动作时 value 传完整路径「A / B / C」逐级展开点选；Vant 下拉菜单与滚轮选择弹层、MUI Select 与 Autocomplete 同样用本动作）。args.value=选项可见文本或完整路径；Ant Design、Element 普通下拉和原生 select 也支持 args.index（非负整数，0=第一项、1=第二项），按当前可见且未禁用选项排序选择，与 value 二选一；选项未知时不要省略选择参数';

const SET_DATE_ACTION_DOC =
  '设置组件库日期选择器（fill 优先，失败走面板翻页与日期格点击；日期时间选择器自动点击确认/确定按钮提交，支持 Ant Design 与 Element；Vant 日期滚轮/日历面板为只读触发器，直接走弹层点选+确认）。args.value=YYYY-MM-DD（日期时间选择器自动补 00:00:00，也可显式带 HH:mm(:ss)）';

const SET_TIME_ACTION_DOC =
  '设置组件库时间选择器（fill 优先；面板兜底自动点格并提交；12 小时制面板请直接 fill 完整时间，支持 Ant Design 与 Element；Vant 时间滚轮为只读触发器，直接走弹层逐列点选+确认）。args.value=HH:mm(:ss)';

const SET_VALUE_ACTION_DOC =
  '设置滑块（Slider）数值（仅适用于滑块组件，勿用于步进器/评分/开关等其它数值控件；拖拽手柄对齐，Ant Design 与 Element 另支持键盘微调；范围滑块 args.value 传 "a,b" 设两端，单值移动最近手柄；受步长限制请传步长整数倍的值，支持 Ant Design、Element、Vant 与 MUI）。args.value=数值或"a,b"';

export const BUILTIN_PLUGIN_DEFS: BuiltinPluginDef[] = [
  {
    name: 'ant-select',
    version: '1.3.0',
    description: 'Ant Design 下拉选择适配（兼容 antd v5/v6 触发器 DOM）：select 动作（原生 <select> 由分发器原生层兜底）、combobox 语义候选与「勿 fill」标注（内置）。弹层已开且归属本控件时复用，他人残留先收起再打开；多选模式选中后自动收起弹层',
    entryFile: loadSource('ant-select'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'el-select',
    version: '1.1.0',
    description: 'Element（element-ui / element-plus）下拉选择适配：select 动作（原生 <select> 由分发器原生层兜底）、combobox 语义候选与「勿 fill」标注（内置）。弹层已开时复用；多选模式选中后自动收起弹层',
    entryFile: loadSource('el-select'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'ant-tree-select',
    version: '1.0.1',
    description: 'Ant Design 树形选择器（TreeSelect）适配（兼容 antd v5/v6）：select 动作兜底（展开祖先闭环 + 树节点文本匹配），排在 ant-select 之后（内置）',
    entryFile: loadSource('ant-tree-select'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'el-tree-select',
    version: '1.0.0',
    description: 'Element 树形下拉适配（element-plus el-tree-select / element-ui 组合方案）：select 动作兜底（展开祖先闭环 + 树节点文本匹配），排在 el-select 之后（内置）',
    entryFile: loadSource('el-tree-select'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'ant-date-picker',
    version: '1.3.0',
    description: 'Ant Design 日期选择器适配：set_date 动作（fill 优先，失败走面板翻页与日期格点击；showTime/日期时间形态自动点击确认按钮提交）（内置）',
    entryFile: loadSource('ant-date-picker'),
    actionsMeta: [{ name: 'set_date', doc: SET_DATE_ACTION_DOC, preferFill: true }],
  },
  {
    name: 'el-date-picker',
    version: '1.3.0',
    description: 'Element（element-ui / element-plus）日期选择器适配：set_date 动作（fill 优先，失败走面板翻页与日期格点击；datetime 形态自动点击确定按钮提交）（内置）',
    entryFile: loadSource('el-date-picker'),
    actionsMeta: [{ name: 'set_date', doc: SET_DATE_ACTION_DOC, preferFill: true }],
  },
  {
    name: 'ant-slider',
    version: '1.0.0',
    description: 'Ant Design 滑块（Slider）适配：set_value 动作（手柄拖拽+键盘微调对齐；范围滑块传 "a,b" 设两端，单值移动最近手柄；垂直滑块支持）（内置）',
    entryFile: loadSource('ant-slider'),
    actionsMeta: [{ name: 'set_value', doc: SET_VALUE_ACTION_DOC, label: '滑块设置', preferFill: false }],
  },
  {
    name: 'el-slider',
    version: '1.0.0',
    description: 'Element（element-ui / element-plus）滑块（Slider）适配：set_value 动作（手柄拖拽+键盘微调对齐；范围滑块传 "a,b" 设两端，单值移动最近手柄；垂直滑块支持）（内置）',
    entryFile: loadSource('el-slider'),
    actionsMeta: [{ name: 'set_value', doc: SET_VALUE_ACTION_DOC, label: '滑块设置', preferFill: false }],
  },
  {
    name: 'ant-time-picker',
    version: '1.0.0',
    description: 'Ant Design 时间选择器（TimePicker）适配：set_time 动作（fill 优先，面板兜底自动点格并按 Enter 提交——antd 5.x 面板无确定按钮、点格仅待定）（内置）',
    entryFile: loadSource('ant-time-picker'),
    actionsMeta: [{ name: 'set_time', doc: SET_TIME_ACTION_DOC, label: '设置时间', preferFill: true }],
  },
  {
    name: 'el-time-picker',
    version: '1.0.0',
    description: 'Element（element-ui / element-plus）时间选择器（TimePicker）适配：set_time 动作（面板点选滚轮并点确定按钮提交；fill+Enter 在 element-plus 不可靠故不走）（内置）',
    entryFile: loadSource('el-time-picker'),
    actionsMeta: [{ name: 'set_time', doc: SET_TIME_ACTION_DOC, label: '设置时间', preferFill: false }],
  },
  {
    name: 'ant-cascader',
    version: '1.0.1',
    description: 'Ant Design 级联选择器（Cascader）适配（兼容 antd v5/v6）：select 动作（自动开弹层并逐级展开点选完整路径；多选模式勾选后自动收起弹层，勾父级即全选子级）（内置）',
    entryFile: loadSource('ant-cascader'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'el-cascader',
    version: '1.0.0',
    description: 'Element（element-ui / element-plus）级联选择器（Cascader）适配：select 动作（自动开弹层并逐级展开点选完整路径；多选模式勾选后自动收起弹层，勾父级即全选子级）（内置）',
    entryFile: loadSource('el-cascader'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'vant-select',
    version: '1.0.0',
    description: 'Vant 下拉菜单（van-dropdown-menu）适配：select 动作（点标题展开 overlay 选项并点击文本匹配项，选中后自动收起弹层）（内置）',
    entryFile: loadSource('vant-select'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'vant-picker',
    version: '1.0.0',
    description: 'Vant 滚轮选择弹层（只读 van-field + van-picker 家族：纯选项/日期/时间滚轮）适配：select/set_date/set_time 动作（弹层内逐列点选后点确认提交；触发器侧无判别信息，动作内按列结构探测细分，不符即 failed 落链由日历/级联插件兜底）（内置）',
    entryFile: loadSource('vant-picker'),
    actionsMeta: [
      { name: 'select', doc: SELECT_ACTION_DOC, preferFill: false },
      { name: 'set_date', doc: SET_DATE_ACTION_DOC, preferFill: false },
      { name: 'set_time', doc: SET_TIME_ACTION_DOC, label: '设置时间', preferFill: false },
    ],
  },
  {
    name: 'vant-slider',
    version: '1.0.0',
    description: 'Vant 滑块（van-slider）适配：set_value 动作（手柄 touch 拖拽（vant 仅绑 touch 事件）+ 轨道点击；范围滑块传 "a,b" 设两端，单值移动最近手柄；垂直滑块支持）（内置）',
    entryFile: loadSource('vant-slider'),
    actionsMeta: [{ name: 'set_value', doc: SET_VALUE_ACTION_DOC, label: '滑块设置', preferFill: false }],
  },
  {
    name: 'mui-select',
    version: '1.0.0',
    description: 'Material-UI 下拉适配（Select 非原生下拉 + Autocomplete 自动补全）：select 动作（Select 点开 listbox 点匹配项；Autocomplete 输入过滤后选中；NativeSelect 为原生 select 由分发器兜底）（内置）',
    entryFile: loadSource('mui-select'),
    actionsMeta: [{ name: 'select', doc: SELECT_ACTION_DOC, preferFill: false }],
  },
  {
    name: 'mui-slider',
    version: '1.0.0',
    description: 'Material-UI 滑块（Slider）适配：set_value 动作（手柄拖拽定位（合成 mousemove 须带 buttons:1）；ARIA 在手柄内 input 上；范围滑块传 "a,b" 设两端，单值移动最近手柄）（内置）',
    entryFile: loadSource('mui-slider'),
    actionsMeta: [{ name: 'set_value', doc: SET_VALUE_ACTION_DOC, label: '滑块设置', preferFill: false }],
  },
  {
    name: 'vant-calendar',
    version: '1.0.0',
    description: 'Vant 日历（van-calendar）适配：set_date 动作（目标月按方向滚动定位，点日格选中后点确认按钮提交；与 vant-picker 链式协作——滚轮探测失败落链至此并复用已开弹层）（内置）',
    entryFile: loadSource('vant-calendar'),
    actionsMeta: [{ name: 'set_date', doc: SET_DATE_ACTION_DOC, preferFill: false }],
  },
];

/**
 * 内置「默认组合」的成员顺序（注入优先级）。select 系列在前：平铺 option 弹层由其先试，
 * 树形弹层由 tree-select 系列兜底；两框架插件互不命中对方组件，顺序仅在框架内生效。
 */
export const BUILTIN_PRESET_MEMBERS = [
  'ant-select',
  'el-select',
  'ant-tree-select',
  'el-tree-select',
  'ant-date-picker',
  'el-date-picker',
  'ant-slider',
  'el-slider',
  'ant-time-picker',
  'el-time-picker',
  'ant-cascader',
  'el-cascader',
  'mui-select',
  'mui-slider',
  'vant-select',
  'vant-picker',
  'vant-calendar',
  'vant-slider',
];

/**
 * 已废弃的旧内置插件（框架级 antd / element-plus，能力级 select / tree-select / date-picker）。
 * 语义动作层按「框架 × 组件域」拆分升级时清理存量行，引用它们的 preset 自动补入新成员。
 */
export const LEGACY_BUILTIN_NAMES = ['antd', 'element-plus', 'select', 'tree-select', 'date-picker'];
