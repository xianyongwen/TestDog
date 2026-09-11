---
layout: home

hero:
  name: TestDog
  text: AI-powered test case management
  tagline: Natural-language script generation · Manual recording · Deterministic replay · Component-library semantic plugins
  image:
    src: /logo.png
    alt: TestDog
  actions:
    - theme: brand
      text: Download Latest
      link: /en/download
    - theme: alt
      text: Get Started
      link: /en/guide/getting-started
    - theme: alt
      text: AI Generation
      link: /en/guide/ai-generate
    - theme: alt
      text: FAQ
      link: /en/guide/faq
    - theme: alt
      text: GitHub Repo
      link: https://github.com/xianyongwen/TestDog

features:
  - icon: 🤖
    title: AI script generation
    details: Describe your intent in natural language, review a pre-split step plan, then watch the AI execute it step by step in a real browser, producing semantic-locator scripts.
    link: /en/guide/ai-generate
    linkText: How generation works
  - icon: 🎥
    title: Manual recording
    details: Record browser actions with Playwright codegen and get editable structured steps automatically.
    link: /en/guide/record
    linkText: Record a session
  - icon: ▶️
    title: Deterministic replay
    details: Zero-LLM Playwright replay with UI / API / WebSocket assertions and automatic AI self-healing when selectors break.
    link: /en/guide/replay
    linkText: Assertions & self-healing
  - icon: 🧩
    title: Component-library plugins
    details: Semantic actions for dropdowns, tree selects and date pickers with in-page post-verification — no more "clicked but didn't select" false positives.
    link: /en/menus/plugins
    linkText: Plugins & presets
  - icon: 📦
    title: Open .testcase format
    details: Import/export test cases, or let coding agents like Claude Code generate importable files via the bundled skill.
    link: /en/guide/testcase-file
    linkText: Format & skill
  - icon: 📊
    title: Generation logs & accounting
    details: Step-level logs and token usage accounting for every generation run.
    link: /en/guide/ai-generate
    linkText: Learn more
---

## See TestDog in 45 seconds

<video class="doc-video" src="/videos/ai-generate.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">Describe the test intent in natural language → the model pre-splits a step plan → confirmed steps run in a real browser → saved as a semantic-locator script</p>
