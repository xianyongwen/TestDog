# .testcase Files

`.testcase` is TestDog's open case format: one file equals one test case (including its first script version, v1), stored as UTF-8 JSON. It powers import/export, team sharing and offline generation by coding agents.

<video class="doc-video" src="/videos/case-scripts.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">Case detail: script versions & step table; Export produces a .testcase file</p>

## Import & export

![Case list](/images/project-cases.png)
<p class="doc-img-caption">Case list: Import Case / Batch Import in the toolbar</p>

- **Export**: the **Export** button on the case detail exports the current version steps as a `.testcase` file.
- **Import**: **Import Case** (single) and **Batch Import** (pick multiple files or a whole folder) in the case list toolbar; files are validated on import with clear error messages.
- Imported cases are identical to manually created ones — AI generation, recording and replay all work.

## File structure

```json
{
  "format": "testcase",
  "version": 1,
  "title": "Case title (required)",
  "description": "Optional case description",
  "naturalLanguage": "Optional original natural-language response",
  "steps": [],
  "rawCode": ""
}
```

## Step (TestStep) essentials

Key fields per step:

| Field | Notes |
| --- | --- |
| `instruction` | Natural-language sub-instruction. **Strongly recommended** — self-healing relies on it to re-locate elements when selectors break |
| `action` | `goto` / `click` / `fill` / `press` / `check` / `select` / `assert` / `wait` etc. |
| `locator` | `{strategy, value, role?, name?, scope?}`, prioritized by stability: testid → role → … |
| `assertion` | Required for `action=assert`: `visible` / `hidden` / text / `url` / `response_status` / `response_body` / `response_json` / `ws_sent` / `ws_received` |
| `value` | Input text, option value, wait milliseconds; supports <code v-pre>{{var}}</code> placeholders |
| `description` | Human-facing step description |

::: tip Full field spec
For the complete enums, locator priority and execution semantics, see `testcase-schema.md` inside the skill package (download via "Testcase Skill" on the project list page).
:::

## Generating cases with coding agents

Two downloads on the project list page (see [Projects](/en/menus/projects)):

- **Testcase Skill**: the `generate-testcase` skill (zip). Drop it into the target project's `.claude/skills/` and coding agents like Claude Code read the skill and schema, then produce `.testcase` files importable into TestDog — optionally smoke-tested with local Playwright to verify locators resolve.
- **Test-Friendly Rule**: coding rules that add `data-testid` markers and similar conventions to your codebase for stabler locators.

## Recommended workflow

1. Developers add testids as they code (or adopt the test-friendly rule).
2. Coding agents batch-produce `.testcase` files via the generate-testcase skill.
3. Import into TestDog via Batch Import, verify by replay, and promote into the regression suite.
