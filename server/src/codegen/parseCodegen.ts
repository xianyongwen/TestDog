import type { Locator, TestStep } from '../shared/testScript';

/** 解析 Playwright codegen 生成的 JS 代码为结构化 TestStep[]。容忍常见模式，不匹配则存 raw（不丢行）。 */

const QUOTED = /'([^']*)'|"([^"]*)"|`([^`]*)`/;

function firstQuoted(s: string): string | undefined {
  const m = s.match(QUOTED);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}

function parseLocator(chain: string): Locator | undefined {
  const roleM = chain.match(
    /getByRole\(\s*['"](\w+)['"]\s*(?:,\s*\{\s*name:\s*(['"])(.*?)\2\s*\})?\s*\)/,
  );
  if (roleM) return { strategy: 'role', value: roleM[1], role: roleM[1], name: roleM[3] };

  if (/getByLabel\(/.test(chain)) return { strategy: 'label', value: firstQuoted(chain) ?? '' };
  if (/getByText\(/.test(chain)) return { strategy: 'text', value: firstQuoted(chain) ?? '' };
  if (/getByPlaceholder\(/.test(chain)) return { strategy: 'placeholder', value: firstQuoted(chain) ?? '' };
  if (/getByTestId\(/.test(chain)) return { strategy: 'testid', value: firstQuoted(chain) ?? '' };

  const locM = chain.match(/locator\(\s*(['"])(.*?)\1\s*\)/);
  if (locM) {
    const val = locM[2];
    return { strategy: val.startsWith('//') ? 'xpath' : 'css', value: val };
  }
  return undefined;
}

function buildActionStep(method: string, args: string, loc: Locator | undefined, line: string): TestStep {
  switch (method) {
    case 'click':
      return { kind: 'action', action: 'click', locator: loc, description: line };
    case 'fill':
      return { kind: 'action', action: 'fill', locator: loc, value: firstQuoted(args), description: line };
    case 'press':
      return { kind: 'action', action: 'press', locator: loc, key: firstQuoted(args), description: line };
    case 'check':
    case 'uncheck':
    case 'setChecked':
      return { kind: 'action', action: 'check', checked: method === 'check' || (method === 'setChecked' && args.trim().startsWith('true')), locator: loc, description: line };
    case 'selectOption':
      return { kind: 'action', action: 'select', locator: loc, value: firstQuoted(args), description: line };
    default:
      return { kind: 'action', action: 'raw', code: line, description: line };
  }
}

function parseLine(line: string): TestStep {
  // 断言：await expect(<locator>).toBeVisible() / .toBeHidden() / .toHaveText('x')
  const assertM = line.match(/await expect\((.*)\)\.(toBeVisible|toBeHidden|toHaveText)\(([^)]*)\)/);
  if (assertM) {
    const loc = parseLocator(assertM[1]);
    const m2 = assertM[2];
    const type: 'visible' | 'hidden' | 'text' =
      m2 === 'toHaveText' ? 'text' : m2 === 'toBeHidden' ? 'hidden' : 'visible';
    return {
      kind: 'assert',
      action: 'assert',
      locator: loc,
      assertion: { type, expected: firstQuoted(assertM[3]) },
      description: line,
    };
  }

  // 导航：await page.goto('url')
  const gotoM = line.match(/^await page\d*\.goto\((.*)\)$/);
  if (gotoM) {
    return { kind: 'navigate', action: 'goto', url: firstQuoted(gotoM[1]), description: line };
  }

  // 动作：await page.<locator chain>.METHOD(args)
  const m = line.match(/^await page\d*\.(.+?)\.(\w+)\(([^)]*)\)$/);
  if (m) {
    return buildActionStep(m[2], m[3], parseLocator(m[1]), line);
  }

  return { kind: 'action', action: 'raw', code: line, description: line };
}

export function parseCodegen(code: string): TestStep[] {
  const lines = code
    .split('\n')
    .map((l) => l.trim().replace(/;$/, ''))
    .filter((l) => /^await (page\d*\.|expect\()/.test(l));
  return lines.map(parseLine);
}
