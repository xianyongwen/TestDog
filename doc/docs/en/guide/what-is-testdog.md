# Introduction

**TestDog** is a desktop test case management tool: generate UI test scripts from natural language or manual recording, then replay them as-written with Playwright to verify (everyday regression costs no model tokens). Built for end-to-end regression testing of web applications.

## Core capabilities

- **AI script generation** — Describe the test in natural language (attachments and login state supported). The model pre-splits a step plan, then executes it in a real browser via a tool-calling loop, turning each step into a semantic-locator script. Pause/resume, AI repair and manual takeover are all supported.
- **Manual recording** — Operate the browser through Playwright codegen; the recording is parsed into editable structured steps.
- **Deterministic replay** — Playwright replay consumes no model tokens. UI / API / WebSocket assertions included; broken selectors trigger automatic AI self-healing with one-click write-back.
- **Plugin system** — Semantic-action plugins for dropdowns, tree selects and date pickers, dispatched per component-library variant, eliminating "clicked but didn't select" false successes.

## Key terms

Don't worry if these are new — each page explains them in context; quick reference:

| Term | Meaning |
| --- | --- |
| **AI gateway** | The service endpoint for calling LLMs; anything speaking the OpenAI-compatible protocol works (see [Settings](/en/menus/settings)) |
| **Pre-split (step plan)** | Before executing, the model turns your natural-language description into a step-by-step plan for confirmation |
| **Semantic locator** | Step locators written the way humans describe elements (e.g. `role=button name=Login`) — more resilient to page changes than raw CSS/XPath |
| **Replay** | Re-executes the script step by step, exactly as written, to verify the result |
| **Self-healing** | When a selector breaks (page redesign), the AI re-finds the element using the step's natural-language instruction and continues |
| **Headless mode** | Replay runs silently in the background without showing a browser window; off by default so you can watch the process |
| **Login config** | A login state recorded once, reused by generation and replay — no need to test login in every case |
| **Preset** | An execution group of plugins: only projects linked to a preset get its plugins injected during generation/replay |
| **Token usage** | The billing unit of model calls made by AI generation/self-healing; cache-hit portions cost far less than normal calls |

## How it works

```
Tauri 2 desktop shell (Rust + system webview)
  └ React frontend (Ant Design 5 + Tailwind CSS 4, zh/en)
      · fetch  → backend REST
      · WebSocket → live progress (generate / run / record)
Node backend (Fastify 5 + Prisma 7 + SQLite)
  · LLM tool-calling loop (OpenAI-compatible gateway)
  · Stagehand 4 (generation execution / self-healing relocation)
  · Playwright (replay / recording / precise verification)
```

The LLM only participates in **generation** and **self-healing relocation**; everyday regression replay is fully deterministic and offline.

## UI map

| Menu | Purpose | Documentation |
| --- | --- | --- |
| Projects | Manage projects, test cases and script versions | [Getting started](/en/guide/getting-started) |
| Run records | Replay results, failure screenshots and diagnostics | [Replay](/en/guide/replay) |
| Generation logs | Step-level logs and token accounting | [AI generation](/en/guide/ai-generate) |
| Plugins | Built-in/custom plugins and preset orchestration | [Plugin system](/en/menus/plugins) |
| Settings | AI gateway, model, browser path, etc. | [Settings](/en/menus/settings) |

## When to use TestDog

- Regression testing: capture repetitive smoke/regression flows as scripts and replay them on demand.
- Component-heavy apps: dropdowns, cascaders and date pickers on Ant Design / Element UI / Element Plus.
- Team collaboration: share cases as `.testcase` files, or have coding agents generate them from the bundled skill.
