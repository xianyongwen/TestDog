---
layout: home

hero:
  name: TestDog
  text: AI 驱动的测试用例管理工具
  tagline: 自然语言生成脚本 · 手动录制 · 确定性回放 · 组件库语义插件
  image:
    src: /logo.png
    alt: TestDog
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: AI 生成脚本
      link: /guide/ai-generate
    - theme: alt
      text: 常见问题
      link: /guide/faq
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/xianyongwen/TestDog

features:
  - icon: 🤖
    title: AI 生成脚本
    details: 自然语言描述测试意图，模型预拆分步骤计划，确认后在真实浏览器逐步执行，落为语义化定位器脚本。
    link: /guide/ai-generate
    linkText: 了解生成流程
  - icon: 🎥
    title: 手动录制脚本
    details: 基于 Playwright codegen 录制浏览器操作，自动解析为可编辑的结构化步骤。
    link: /guide/record
    linkText: 录制一次试试
  - icon: ▶️
    title: 确定性回放
    details: Playwright 回放零 LLM 成本，支持 UI / 接口 / WebSocket 断言，选择器失效自动 AI 自愈。
    link: /guide/replay
    linkText: 断言与自愈
  - icon: 🧩
    title: 组件库语义插件
    details: 下拉、树选、日期、滑块、级联、时间选择等组件的语义动作插件，三态结果协议 + 页内后验，杜绝「点了但没选上」的假成功。
    link: /menus/plugins
    linkText: 插件与预设
  - icon: 📦
    title: .testcase 开放格式
    details: 用例可导入导出，配套技能包让 Claude Code 等编程 agent 直接生成可导入用例。
    link: /guide/testcase-file
    linkText: 格式与技能包
  - icon: 📊
    title: 生成记录与记账
    details: 每次生成留步骤级日志与 token usage 记账，随时复盘生成过程与成本。
    link: /guide/ai-generate
    linkText: 查看说明
---
