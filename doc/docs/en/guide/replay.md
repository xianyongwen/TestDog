# Replay & Runs

Replay a script with one click: deterministic Playwright execution at **zero LLM cost** (only self-healing consumes a few tokens), ideal for daily regression.

<video class="doc-video" src="/videos/replay-run.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">A real replay end to end: Run Current Version → live progress → per-step detail in Run Records</p>

## Run entries

- **Case detail** → **Run Current Version**, or the **Run** button on a script version row (headless toggle and login config available).
- **Case list** → row action **Run** runs the default script version directly.
- You can **stop** a run in progress; cases have a **default script version** (the Version column in the case list) for bulk regression.

## The run process

Clicking Run shows a **Run Progress** card on the case detail (with a Stop button) streaming per-step logs:

![Run detail](/images/replay-run-detail.png)
<p class="doc-img-caption">Run detail: per-step status (passed/failed), self-healed flag, duration, token usage and the run log</p>

When the run finishes, open the **Run Records** tab (or click View detail in the global Run Records menu) for the full breakdown:

- **Per-step table**: action, status (passed/failed), **self-healed** flag, duration, token usage, message.
- **Run log**: browser viewport, login-config state, and each `goto / fill / press / assert → PASSED/FAILED`.
- **Failure diagnostics**: failed steps save a **screenshot** automatically and collect browser **console and network** logs.
- **Export** (top right): results as JSON / Excel (test report).

## Assertion types

| Category | Assertion | Notes |
| --- | --- | --- |
| **UI** | Element visible | Waits for the element (auto-wait, up to 10s) |
| | Element hidden | Waits until the element is invisible/removed — good for toasts and spinners |
| | Text content | Verifies element text |
| | Page URL | Current URL contains the expected substring |
| **API** | Status code | Status of the latest response matching a URL keyword |
| | Response body | Body contains the expected substring |
| | JSON field | Reads a field by JSON path (e.g. `data.items.0.id`) and compares |
| **WebSocket** | Sent message | Matches a client-sent WS message |
| | Received message | Matches a server-pushed WS message |

::: tip Locating API/WS traffic
`locator.value` holds a **URL keyword substring** (e.g. `/api/login`); the engine matches the most recent response/frame whose URL contains it.
:::

## Unique test data

<code v-pre>{{var}}</code> placeholders support **system variables** (random phone/email/ID numbers) and **project environment variables**, generating unique test data to avoid dirty-data collisions like "phone already registered". See [Test Data & Login](/en/guide/test-data) for the variable list and rules.

## Self-healing

- When a selector no longer matches (e.g. after a frontend redesign), replay automatically switches to **AI self-healing** using the step's natural-language instruction, then continues.
- Self-healed locators can be **written back** to the original script with one click, effective for the next run.

## Review & export

- Run list and per-step details live under **Run Records** (see [Run records](/en/menus/runs)): per-step status, duration, failure screenshots and console/network capture.
- Results can be exported as **JSON / Excel** (test report).
