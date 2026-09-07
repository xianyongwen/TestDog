# Plugin Development

The built-in plugins don't cover your in-house components? Write a "component adapter plugin" so AI generation understands and operates your custom widgets (homegrown dropdowns, cascaders, tree selects, date panels). This page walks you through a verifiable, uploadable plugin from scratch.

## What is a plugin

A plugin is a **pure in-page JS script** — an expression evaluating to a "plugin definition object":

- It executes only **in the browser environment of the site under test**; the platform's Node side contains no plugin code;
- **No IIFE wrapper, no register call, no id needed** — the platform wraps it on injection; for internal helpers use an IIFE expression returning the object: `(() => { …helpers…; return {…}; })`;
- **ES6+** works directly (const / arrow functions / optional chaining) — plugins run in the tested site's Playwright Chromium, **no build step**;
- It hooks into the platform through four slots: `detect` (membership), `candidates` (locator candidates), `annotate` (semantic annotation), `actions` (semantic actions).

The full contract lives in `references/plugin-api.md` inside the plugin template; hard red lines in `references/red-lines.md`.

## Quick start: the template project (~2 min)

Download the **Plugin Template** (zip) from the Plugins page, unzip, then:

```bash
npm install
npx playwright install chromium    # first run downloads the browser, then cached
npm run harness -- sample-widget index.js --probe
```

A browser opens and scans the sample page; expected output:

- Trigger and input candidates marked **✓unique** (`css=.demo-select`, `placeholder=请选择`)
- `✅ 验收通过：存在页内唯一的候选定位器` (acceptance passed: a page-unique candidate exists)
- Registered actions include `select` (plugin id comes from the filename, e.g. `index -> ["select"]`)

The harness only verifies candidate uniqueness and the action list — it **doesn't execute actions**. To self-test actions, add `--hold` to keep the browser open, then run in the page console:

```js
await window.__ttPluginRegistry__.invokeAction('demo-select', 'select', document.querySelector('.demo-select'), { value: '上海' })
// Expect { status: 'success', message: '已选择：上海' } and the input showing the selection
```

## Plugin package format

| Item | Notes |
| --- | --- |
| Single file | Recommended: upload the entry `.js` directly (the template's `index.js`) |
| zip bundle | `manifest.json` only needs `{"entry": "index.js"}`; **name/version/description go in the upload form**, not the manifest |
| Size | single file ≤ 512KB |
| Compatibility | Common single-level-directory zips upload fine (registers the template's demo plugin for the full flow) |

## The plugin definition object: four slots

From the template's `index.js` (a searchable dropdown demo-select); replace the two `TODO` markers to make it yours.

### 1. detect — membership

```js
detect: (el) => !!el.closest('.demo-select, .demo-select-popup')
```

**Be inclusive** for detection, but plugins **registering actions must match precisely** — detect drives action dispatch; loose class names dispatch actions to the wrong components.

### 2. candidates — locator candidates

```js
candidates: (el) => {
  const out = [];
  // trigger (not inside the popup)
  const trigger = el.closest('.demo-select');
  if (trigger && !el.closest('.demo-select-popup')) {
    if (el === trigger) out.push({ strategy: 'css', value: '.demo-select' });
    if (el.tagName === 'INPUT') {
      const ph = el.getAttribute('placeholder');
      if (ph) out.push({ strategy: 'placeholder', value: ph });
    }
  }
  // popup: only produce candidates for a visible popup (hidden ones fail uniqueness)
  const popup = el.closest('.demo-select-popup');
  if (popup?.classList.contains('is-open')) {
    if (el === popup) out.push({ strategy: 'css', value: '.demo-select-popup' });
    if (el.classList.contains('demo-select-option')) {
      const text = el.textContent.trim();
      if (text) out.push({ strategy: 'text', value: text, scope: { strategy: 'css', value: '.demo-select-popup' } });
    }
  }
  return out;
}
```

The platform verifies each candidate's "**page-wide uniqueness + real locator count===1 on the same node**" and silently drops the rest — **prefer fewer but accurate**. Key points:

- Harvest form labels: a row's `<label>` text makes a good label candidate;
- Popup content must **scope-anchor to the popup container** (popups portal to body and instances stay mounted; without scoping you hit hidden instances).

### 3. annotate — one-line semantic annotation

```js
annotate: (el) => {
  if (el.closest('.demo-select-popup')) return 'demo-select 的选项弹层（点击选项即选中并回显到输入框）';
  if (el.closest('.demo-select')) return '自研可搜索下拉 demo-select：输入可过滤，Enter 或点击选项选择（非原生 select，平台原生 select 步骤不适用）';
  return '';
}
```

Write "operational facts the AI needs to know" — they're spliced into the page snapshot fed to the model.

### 4. actions — semantic actions

```js
actions: {
  select: {
    doc: '选择下拉选项（args.value=选项文本，如 上海）。真实 fill+Enter 优先，失败走页内点击选项。',
    label: '选择选项',          // optional display name, shown in action dropdowns/step labels
    preferFill: true,           // for typeable controls: platform tries fill+Enter first, falls back to fn
    async fn(el, args, pw) {
      const value = String(args?.value || '').trim();
      if (!value) throw new Error('缺少参数 value（要选中的选项文本）');
      // idempotent: already at target state → return success
      // 1) open the popup (skip if open)
      // 2) type to filter, wait for the matching option
      // 3) click the option
      // 4) wait for the true final state: selected marker + input echo
      return `已选择：${value}`;
    },
    verify: (el, args) => {     // optional in-page post-check: failing it counts as failed
      // verify "it really got selected" — blocks false successes
    },
  },
}
```

Key conventions:

- **Stateful multi-step operations must close the loop inside fn** (open → locate → select → wait for echo); never return "click these N times" for the shell to split;
- **Idempotency**: already at the target state → return success immediately;
- **Don't verify by echo alone** — the filter text also lands in the input; check the component's selected-state marker (step 2 already typed the filter text, so echo-only would mistake "filtered but not selected" for success).

## Tri-state result protocol

Every action returns an explicit tri-state:

| Return | Meaning |
| --- | --- |
| a string | **success** (the string becomes the result message) |
| throw Error | **failed** (error shown to user/model) |
| `{status, message}` | explicit: `success` / `failed` / `uncertain` (uncertain falls back to the platform's effect-hash) |

A failing `verify` counts as failed — that's the mechanism blocking "clicked but didn't select" false successes.

## pw bridge: Playwright API inside actions

The third `pw` argument of action/verify fns is the platform-injected **Playwright bridge** (runs on the Node side: real keyboard/mouse, auto-wait, network waits):

```js
async fn(el, args, pw) {
  const rootHandle = await pw(el);               // in-page element → Node-side handle, chainable
  await rootHandle.locator('input').fill('上海'); // auto-wait real fill
  await pw.page.keyboard.press('Escape');         // real keyboard event
  await pw.page.waitForLoadState('networkidle');  // wait for network idle
}
```

Caveats: each pw call is a **cross-process round trip** — never use it in hot polling loops; prefer Playwright auto-wait or `{ timeout }` for waiting; calling outside the platform shell/harness throws "bridge not injected". While debugging (`--hold`), it's also available as `await window.__ttPw.page.title()`.

## Acceptance harness

```bash
npm run harness -- <fixture|URL> <plugin.js> --probe
npm run harness -- <fixture|URL> <plugin.js> --probe --hold   # keep the browser open after the report
npm run harness -- --list                                     # list available fixtures
```

- Fixtures: add `tests/fixtures/<component>.html` (no build, self-contained, full component markup), or point directly at a running page URL of your project;
- Acceptance criteria: **unique candidates + complete action list**; under `--hold`, self-test every action with `invokeAction` in the console.

## Upload & activation

1. Upload on the Plugins page (single `.js` or zip);
2. Run **Try run** once: writes back the action list (detect hits, candidate count, actions);
3. Add the plugin to a **preset** and link that preset to the test project — the pairing is the switch, nothing is injected without it;
4. Preset members form a **match chain** by priority: higher order number = higher priority, tried first, first success wins (newly added members get top priority).

**Overriding built-ins**: overriding is allowed — order your plugin before the builtin to enhance or replace the builtin dropdown/tree-select/date handling. ⚠️ If your component **shares a root class** with an action-registered builtin (e.g. antd TimePicker and DatePicker are both `.ant-picker`), also narrow the builtin's detect/annotate and add mis-dispatch protection.

**Updating**: no need to delete and re-upload — use **Re-upload** in the row actions; name and preset links stay, and the action list is rewritten from the new source at the next try-run.

## Developing with coding agents

Prefer not to hand-write? Download the **Plugin Skill** (`tt-plugin-from-source`, zip) from the Plugins page into the tested project's `.claude/skills/`. Coding agents like Claude Code will then:

1. Read the project source (framework, component library, `src/components/`);
2. Identify custom widgets worth adapting (dropdowns/cascaders/tree selects/transfer/rating/slider/color picker/upload/custom popups);
3. Derive and verify DOM contract hypotheses from source, producing a four-slot in-page script;
4. Deliver after offline harness acceptance, ready to upload.
