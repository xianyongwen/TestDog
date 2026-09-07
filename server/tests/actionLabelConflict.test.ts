/**
 * 插件 label 一致性检测单元测试（纯 Node，无浏览器/DB）：
 * - extractDeclaredActionLabels：actions 声明的静态词法扫描（label 提取、字符串/注释跳过、fn 内嵌套不误读）
 * - actionLabelConflicts 的比对逻辑通过 DB mock 不可行（依赖 prisma），此处仅测纯提取函数；
 *   冲突比对逻辑简单（同名 + label 不同），由试运行/上传链路人工验证。
 */
import { describe, it, expect } from 'vitest';
import { extractDeclaredActionLabels } from '../src/services/genToolsPlugin';

describe('extractDeclaredActionLabels', () => {
  it('提取对象形态动作的 label', () => {
    const code = `(
      {
        id: 'my-plugin',
        detect: (el) => !!el.closest('.my'),
        actions: {
          pick_address: {
            doc: '选择收货地址',
            label: '选择收货地址',
            preferFill: true,
            async fn(el, args) { return 'ok'; },
          },
          set_date: {
            doc: '设置日期',
            async fn(el, args) { return 'ok'; },
          },
        },
      }
    )`;
    expect(extractDeclaredActionLabels(code)).toEqual([
      { name: 'pick_address', label: '选择收货地址' },
      { name: 'set_date' },
    ]);
  });

  it('跳过字符串与注释里的花括号/伪声明', () => {
    const code = `(
      {
        // actions: { fake: { label: '注释里的假声明' } }
        annotate: (el) => "文本含 actions: { x: { label: 'no' } } 字面量",
        actions: {
          /* label: '块注释假声明' */ select: {
            doc: "含 // 的字符串 'label: \"x\"'",
            label: "选择选项",
            fn: async () => 'ok',
          },
        },
      }
    )`;
    expect(extractDeclaredActionLabels(code)).toEqual([{ name: 'select', label: '选择选项' }]);
  });

  it('fn 内部的嵌套对象不误读为动作', () => {
    const code = `(
      {
        actions: {
          select: {
            async fn(el, args) {
              const conf = { inner_thing: { label: '不应提取' } };
              return conf.inner_thing.label;
            },
          },
        },
      }
    )`;
    expect(extractDeclaredActionLabels(code)).toEqual([{ name: 'select' }]);
  });

  it('函数形态动作无 label 不参与提取；解析不出 actions 时返回空', () => {
    const fnForm = `({ actions: { select: async (el) => 'ok' } })`;
    expect(extractDeclaredActionLabels(fnForm)).toEqual([]);
    expect(extractDeclaredActionLabels('({ detect: (el) => true })')).toEqual([]);
  });
});
