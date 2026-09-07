/**
 * 占位符的提取与替换。前后端共用（纯函数，无平台依赖）。
 *
 * 统一写法：{{name}}，可选参数 {{name:N}} 或 {{name[:N]}}（两种写法等价）。
 * - 环境变量：name 在项目设置里维护，跨环境/跨用例复用（如 {{baseUrl}}、{{密码}}）。
 * - 系统变量：name 是 KNOWN_SYSTEM_NAMES 名单里的内置名字，运行期内置、无需定义，
 *   每次运行开始求值一次：{{systemTime}}（当前时间戳）、{{randomNumber[:N]}}（N 位
 *   随机数字，默认 6）、{{randomChinese[:N]}}（N 个随机常用汉字，默认 2），以及随机
 *   测试数据：{{randomPhone}}（随机手机号）、{{randomEmail}}（随机邮箱）、
 *   {{randomIdCard}}（随机 18 位身份证号）。
 * - 同名冲突时环境变量优先：项目显式定义的值覆盖内置系统变量。
 * - 旧写法 ${name[:N]} 仅作历史脚本兼容：运行时仍替换，生成与文档一律用 {{...}}。
 *
 * 用法：
 * - 前端 StepsTable 用 extractVars 做格式检测，配合已知变量键（环境变量键 + KNOWN_SYSTEM_NAMES）
 *   标红未定义引用。
 * - 后端 runnerService / generationService 用 substituteAll 做统一替换（环境变量优先，
 *   其次系统变量）；generationService 另用 legacyToUnifiedSystemVars 把模型输出的旧写法
 *   归一化后入库。
 */

/** 统一占位符正则：{{ name }}、{{ name:N }} 或 {{ name[:N] }}（N 为可选数字参数；`:N` 与 `[:N]` 两种写法等价，
 *  如 {{randomChinese:4}} / {{randomChinese[:4]}}，拆步提示词教模型的是 `[:N]` 写法，均需识别）。
 *  name 以字母/下划线开头，含字母数字下划线（支持中文等 Unicode 字母，如 {{密码1}}）。允许两侧空白。
 *  m[1]=名字，m[2]=可选数字参数。 */
export const VAR_PATTERN = /\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\[?\s*:\s*(\d+)\s*\]?)?\s*\}\}/gu;

/** 旧系统变量占位符正则（仅兼容历史脚本）：${ name }、${ name:N } 或 ${ name[:N] }。
 *  新代码/提示词/文档一律用 {{...}}，此处保留只为让旧脚本继续可运行。 */
export const LEGACY_SYSTEM_VAR_PATTERN = /\$\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\[?\s*:\s*(\d+)\s*\]?)?\}/gu;

/** 内置系统变量名。{{name}}（或旧写法 ${name}）的名字命中此名单且未定义同名环境变量时按系统变量求值。 */
export const KNOWN_SYSTEM_NAMES = new Set([
  'systemTime',
  'randomNumber',
  'randomChinese',
  'randomPhone',
  'randomEmail',
  'randomIdCard',
]);

/** 归一化系统变量键：{{name:param}} → "name:param"，{{name}} → "name"。同键在同一次运行内值一致。 */
function systemKey(name: string, param?: string): string {
  return param ? `${name}:${param}` : name;
}

/** 提取文本中所有 {{变量名}}（含系统变量名，参数不计入），去重并保持首次出现顺序。 */
export function extractVars(text: string | undefined | null): string[] {
  if (!text) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(VAR_PATTERN)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** 提取文本中所有系统变量的归一化键（统一 {{...}} 与旧 ${...} 两种写法），去重并保持首次出现顺序。 */
export function extractSystemVars(text: string | undefined | null): string[] {
  if (!text) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const pattern of [VAR_PATTERN, LEGACY_SYSTEM_VAR_PATTERN]) {
    for (const m of text.matchAll(pattern)) {
      if (!KNOWN_SYSTEM_NAMES.has(m[1])) continue;
      const key = systemKey(m[1], m[2]);
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

// 常用汉字池（高频汉字），随机汉字从中取样，保证取出来是可读中文（人名/标题/内容用）。
const HANZI_POOL =
  '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞';

/** 生成 len 位随机数字串（前置补零）。 */
function randomDigits(len: number): string {
  const n = Math.max(1, Math.floor(len));
  return String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
}

/** 生成 len 个随机常用汉字。 */
function randomHanzi(len: number): string {
  const n = Math.max(1, Math.floor(len));
  let out = '';
  for (let i = 0; i < n; i++) out += HANZI_POOL[Math.floor(Math.random() * HANZI_POOL.length)];
  return out;
}

/** 随机整数 [min, max]（含两端）。 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 生成随机中国大陆手机号：1 开头，第二位 3-9，共 11 位。 */
function randomPhone(): string {
  return `1${randInt(3, 9)}${randomDigits(9)}`;
}

/** 生成随机邮箱：小写字母/数字组成的用户名 + @ + 常见域名后缀。 */
function randomEmail(): string {
  const LOCAL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const localLen = randInt(6, 12);
  let local = '';
  for (let i = 0; i < localLen; i++) local += LOCAL_CHARS[Math.floor(Math.random() * LOCAL_CHARS.length)];
  const domains = ['qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com', 'example.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${local}@${domain}`;
}

// 身份证号校验位权重：前 17 位依次乘以下权重，和对 11 取模得到校验位索引。
const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

/** 生成随机 18 位身份证号（GB 11643-1999，含校验位）。地区码取合法区间，生日取 1950-2005 年内的随机日期。 */
function randomIdCard(): string {
  // 地区码：省级 11-82，中间两位 00-99，末位（县）00-99，取常见合法范围即可通过校验
  const region = `${randInt(11, 82)}${randomDigits(2)}${randomDigits(2)}`;
  const year = randInt(1950, 2005);
  const month = randInt(1, 12);
  const day = randInt(1, 28); // 固定 1-28，避免大小月/闰年合法性校验问题
  const birthday = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const seq = randomDigits(3);
  const base = `${region}${birthday}${seq}`;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(base[i]) * ID_CARD_WEIGHTS[i];
  const check = ID_CARD_CHECK_CODES[sum % 11];
  return `${base}${check}`;
}

/** 求单个系统变量键的值（key 为 systemKey 归一化后的键）。 */
function systemValue(key: string, now: number): string {
  const [name, param] = key.split(':');
  switch (name) {
    case 'systemTime': return String(now);
    case 'randomNumber': return randomDigits(param ? Number(param) : 6);
    case 'randomChinese': return randomHanzi(param ? Number(param) : 2);
    case 'randomPhone': return randomPhone();
    case 'randomEmail': return randomEmail();
    case 'randomIdCard': return randomIdCard();
    default: return key; // 不会发生：collectSystemKeys 只收集已知名字
  }
}

/** 从一组文本里收集去重的已知系统变量键（统一与旧两种写法都识别，按首次出现顺序）。 */
export function collectSystemKeys(texts: Array<string | null | undefined>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const pattern of [VAR_PATTERN, LEGACY_SYSTEM_VAR_PATTERN]) {
      for (const m of t.matchAll(pattern)) {
        if (!KNOWN_SYSTEM_NAMES.has(m[1])) continue;
        const key = systemKey(m[1], m[2]);
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
  }
  return keys;
}

/**
 * 系统变量取值（对每个归一化键求值一次），供调用方做惰性求值/缓存：
 * 返回以键（"systemTime" / "randomNumber:6" / "randomChinese:2" / "randomPhone" /
 * "randomEmail" / "randomIdCard"）为 key 的映射。
 */
export function resolveSystemKeys(keys: string[], now: number = Date.now()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = systemValue(key, now);
  return out;
}

/**
 * 系统变量取值：从一组文本里收集键并对每个键求值一次，保证同一次运行内同键值一致
 * （fill 写进去的值与后续断言用同一个随机/时间戳；随机值在解析时一次性生成）。
 * - systemTime：当前时间戳（epoch 毫秒），如 user_{{systemTime}}。
 * - randomNumber[:N]：N 位随机数字串（默认 6），如 {{randomNumber}}、{{randomNumber:8}}。
 * - randomChinese[:N]：N 个随机常用汉字（默认 2），如 {{randomChinese}}、{{randomChinese:4}}。
 * - randomPhone：随机手机号（11 位，1[3-9] 开头），如 {{randomPhone}}。
 * - randomEmail：随机邮箱（小写字母/数字用户名），如 {{randomEmail}}。
 * - randomIdCard：随机 18 位身份证号（含校验位），如 {{randomIdCard}}。
 */
export function resolveSystemVars(
  texts: Array<string | null | undefined>,
  now: number = Date.now(),
): Record<string, string> {
  return resolveSystemKeys(collectSystemKeys(texts), now);
}

/**
 * 统一替换（单次遍历，优先级：环境变量 > 系统变量）：
 * - {{name}} 命中环境变量 vars[name]：替换为项目值（带参数形式同样以环境变量优先，参数忽略）。
 * - 否则命中系统变量名单且 sysVars 里有对应键（如 "randomNumber:6"）：替换为运行期求值。
 * - 其余保留 {{name}} 字面量；非系统变量名计入 missing（便于失败信息里看到缺哪个变量），
 *   系统变量名静默保留（调用方通常已按同字段列表预求值，缺失属异常，不误报为环境变量）。
 * - 旧写法 ${name[:N]} 在其后单独替换（仅系统变量语义，历史脚本兼容）。
 * - 入参为 null/undefined：原样返回（保留字段缺省语义）。
 */
export function substituteAll(
  text: string | undefined | null,
  vars: Record<string, string>,
  sysVars: Record<string, string>,
  missing?: Set<string>,
): string | undefined {
  if (text == null) return undefined;
  const unified = text.replace(VAR_PATTERN, (full, name: string, param?: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    const key = systemKey(name, param);
    if (Object.prototype.hasOwnProperty.call(sysVars, key)) return sysVars[key];
    if (!KNOWN_SYSTEM_NAMES.has(name)) missing?.add(name);
    return full;
  });
  // 旧写法兼容：历史脚本里的 ${systemTime} 等
  return unified.replace(LEGACY_SYSTEM_VAR_PATTERN, (full, name: string, param?: string) => {
    const key = systemKey(name, param);
    return Object.prototype.hasOwnProperty.call(sysVars, key) ? sysVars[key] : full;
  });
}

/**
 * 只替换 {{环境变量}}（系统变量不处理，保留字面量）。等价于 substituteAll 传空系统变量表，
 * 供只需环境变量的场景（如生成阶段分步替换）复用。
 */
export function substituteVars(
  text: string | undefined | null,
  vars: Record<string, string>,
  missing?: Set<string>,
): string | undefined {
  return substituteAll(text, vars, {}, missing);
}

/** 旧写法归一化：${name} / ${name:N} / ${name[:N]}（name 命中系统变量名单）→ {{name}} / {{name[:N]}}。
 *  未知名与 ${...} 形态的其他文本原样保留；入参为 null/undefined 原样返回。
 *  用于把模型输出的旧写法在入库前统一成 {{...}}（运行时两种写法等价，统一只为口径一致）。 */
export function legacyToUnifiedSystemVars(text: string | undefined | null): string | undefined {
  if (text == null) return undefined;
  return text.replace(LEGACY_SYSTEM_VAR_PATTERN, (full, name: string, param?: string) => {
    if (!KNOWN_SYSTEM_NAMES.has(name)) return full;
    return param ? `{{${name}[:${param}]}}` : `{{${name}}}`;
  });
}

/** 变量名合法字符规则（与 VAR_PATTERN 的捕获组同源，改其一需同步）：字母/下划线开头，含字母/数字/下划线，支持中文等 Unicode 字母。 */
export const VAR_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** 判断字符串是否为合法变量名（可作为 {{name}} 的 name 被识别和替换）。 */
export function isValidVarName(name: string): boolean {
  return VAR_NAME_RE.test(name);
}
