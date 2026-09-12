import type { Locator } from '@shared/testScript';

/**
 * 定位器 → 人读字符串（运行记录「信息」列 / 导出「自愈定位器」列展示用）。
 * 语义策略转 Playwright 链式写法（与 resolveQuery 的解析口径一致），css 原样、xpath 加显式前缀；
 * 带 scope（弹层容器）时前置容器链，如 getByRole('dialog').getByRole('button', { name: '确定' })。
 */
export function describeLocator(loc: Locator): string {
  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const one = (l: Locator): string => {
    switch (l.strategy) {
      case 'role':
        return `getByRole(${q(l.role ?? l.value)}${l.name ? `, { name: ${q(l.name)} }` : ''})`;
      case 'label':
        return `getByLabel(${q(l.value)})`;
      case 'text':
        return `getByText(${q(l.value)})`;
      case 'placeholder':
        return `getByPlaceholder(${q(l.value)})`;
      case 'testid':
        return `getByTestId(${q(l.value)})`;
      case 'alt':
        return `getByAltText(${q(l.value)})`;
      case 'title':
        return `getByTitle(${q(l.value)})`;
      default: {
        // css/xpath 统一按 locator('...') 展示；css 名下可能存的是 xpath（单斜杠开头），
        // 与 resolveQuery 的解析口径一致加 xpath= 前缀，保证字符串与实际解析行为一致
        const v = l.strategy === 'xpath' || /^\//.test(l.value) ? `xpath=${l.value}` : l.value;
        return `locator(${q(v)})`;
      }
    }
  };
  return loc.scope ? `${one(loc.scope as Locator)}.${one(loc)}` : one(loc);
}
