# AI Script Generation

Describe the test in natural language and TestDog executes it in a real browser, step by step, turning each action into script — visible, interruptible and resumable. Before running, the model agrees with you on a **test intent and acceptance criteria**: generation only completes once every required criterion has a real passing assertion behind it.

<video class="doc-video" src="/videos/ai-generate.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">A real full generation: send → plan confirmation → start execution → step-by-step write-back → done</p>

## Starting a generation

Click **AI Generate** on the case detail to open the generation page:

![Generation page](/images/ai-generate-page.png)
<p class="doc-img-caption">Generation page: execution trail on top, requirement input at the bottom</p>

1. Fill in the **start URL** (defaults to the project's URL).
2. Describe the test requirement in natural language.
3. Optionally:
   - **Attachments**: drop screenshots/files into the input. Text files (xlsx / pdf / docx / csv / json) are extracted automatically; images are compressed and sent directly to the model (vision required).
   - **Login config**: pick a recorded login state to generate from a logged-in session.
4. Click **Send**.

![Filled requirement](/images/ai-generate-filled.png)
<p class="doc-img-caption">Describe the requirement, then click Send</p>

## The generation process

### 1. Step plan and test-intent confirmation

After you send, the model **pre-splits** a step plan and a test intent, shown together in one modal:

![Step plan](/images/ai-generate-plan.png)
<p class="doc-img-caption">Confirmation modal: test intent & acceptance criteria on top, step plan below, then Start Execution or Cancel</p>

**Step plan**: every step's action, params and assertion are editable; an assertion row can be linked to an **acceptance criterion** from a dropdown, which brings in that criterion's assertion type and expected value.

**Test intent & acceptance criteria**:

| Item | What it is |
| --- | --- |
| **Scenario** | Positive / negative / mixed |
| **Objective** | The business result to verify |
| **Preconditions** | Conditions that must hold before execution (one per line) |
| **Data constraints** | Field + value + policy: **fixed** (never auto-modified) or **generated** (supports `{{variables}}` for unique data) |
| **Acceptance criteria** | Expected business result, verification scope (specific record / field), acceptance basis, **required** flag, assertion type & expected value |
| **Cleanup** | Cleanup actions after the run; leave empty if none |

After confirmation you start executing. The route can still adapt to the actual page, but the confirmed assertion types and expected values cannot be changed or weakened by the model.

### 2. Execution loop

Click **Start Execution** and a tool-calling loop runs in a real browser, streaming into the execution trail:

- `snapshot` captures interactive elements
- `click` / `fill` / `select` performs clicks, typing and dropdown selection
- `assert` runs strong assertions (see [Assertion types](#assertion-types)); criterion assertions carry the criterion ID and target the agreed scope
- `read_coverage` reads acceptance criteria and coverage status (no model call, no page interaction); coverage changes appear in the trail
- `see` visual observation (requires vision capability)
- `api` performs API requests

In negative tests, illegal inputs, failed submissions and rejection assertions are kept as necessary steps — they are the test objective; fixed data is never replaced.

### 3. Write-back

Each successful action is parsed into a **semantic locator** into the "Generated Steps" table on the left (action / strategy / locator / params). You can pause or cancel at any time without losing finished steps.

![Generation done](/images/ai-generate-done.png)
<p class="doc-img-caption">Generation finished: the trail shows each tool call with token usage (cache hits labeled); steps land in the table, ready to Save Script</p>

## Assertion types

Generation and replay share the same browser assertion semantics, retried within a timeout budget:

| Type | Meaning |
| --- | --- |
| **visible / hidden** | The unique target is visible / hidden or absent; multiple matches error out, not counted as hidden |
| **text / text_exact** | Visible text within scope contains / equals (whitespace-normalized) the expected text |
| **value** | Form field value equals exactly (empty string allowed) |
| **checked / unchecked** | Control checked / unchecked |
| **enabled / disabled** | Control enabled / disabled |
| **count** | Number of matching nodes (hidden nodes included, 0 supported) |
| **url / url_exact** | URL contains / equals exactly |

Criterion assertions verify that type and expected value strictly match the confirmed convention and must locate the agreed scope — a generic page-wide text or success toast cannot substitute for verifying the specific record.

## Completion gate & evidence

- A criterion's `assert` must carry the criterion ID, strictly reusing the confirmed type, expected value and scope.
- Only assertions that **actually ran and passed** (and were written back) register passing evidence; the model's summary or self-declaration does not count as verification.
- Changing locators, data, step order, or deleting related steps invalidates existing evidence and requires re-assertion.
- `finish` requires every **required** criterion to hold valid evidence and the script to end with an assertion; a re-check runs again after the global script review, so removing a key assertion during review cannot slip through.
- Required criteria may be skipped to continue with the rest, but the run cannot be reported as fully complete.

::: warning No self-healing for assertions
Assertion failures do not trigger AI re-locating self-healing — a real defect must not be "healed" into a pass. Action steps keep the existing locator self-healing.
:::

## Help requests

When the AI gets stuck locating an element, generation pauses and offers four options:

| Option | What it does |
| --- | --- |
| **AI repair** | Let the AI re-locate the element (consumes model calls) |
| **Rephrase** | Describe the action differently and retry |
| **Manual takeover** | Perform the step yourself in the browser |
| **Skip** | Skip the step and continue; if it was tied to a required criterion, that criterion stays unverified |

## Pause and resume

You can pause generation at any time; **Continue** later resumes from the breakpoint — no re-run needed. Passed acceptance evidence is saved with the pause checkpoint and keeps counting toward coverage after resuming.

## Where conventions live

Acceptance conventions are saved with the script version: after saving, view them via **Test Intent & Acceptance Criteria** on the case detail page, and they survive save-as-version, export and import. Older scripts without conventions keep working unchanged.

## Generation logs

Every run is archived under **Generation logs**: step-level logs (tool calls, visual observations, help decisions) and token accounting are fully traceable, with automatic cleanup after the retention period. See [Generation logs](/en/menus/genlogs).
