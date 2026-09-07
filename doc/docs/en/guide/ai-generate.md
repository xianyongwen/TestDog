# AI Script Generation

Describe the test in natural language and TestDog executes it in a real browser, step by step, turning each action into script — visible, interruptible and resumable.

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

### 1. Step plan confirmation

After you send, the model **pre-splits** a step plan shown in a modal — every step's action, params and assertion are editable:

![Step plan](/images/ai-generate-plan.png)
<p class="doc-img-caption">Step-plan modal: add/remove/edit steps, then Start Execution or Cancel</p>

### 2. Execution loop

Click **Start Execution** and a tool-calling loop runs in a real browser, streaming into the execution trail:

- `snapshot` captures interactive elements
- `click` / `fill` / `select` perform actions
- `assert` runs in-page assertions
- `see` visual observation (requires vision capability)
- `api` performs API requests

### 3. Write-back

Each successful action is parsed into a **semantic locator** into the "Generated Steps" table on the left (action / strategy / locator / params). You can pause or cancel at any time without losing finished steps.

![Generation done](/images/ai-generate-done.png)
<p class="doc-img-caption">Generation finished: the trail shows each tool call with token usage (cache hits labeled); steps land in the table, ready to Save Script</p>

## Help requests

When the AI gets stuck locating an element, generation pauses and offers four options:

| Option | What it does |
| --- | --- |
| **AI repair** | Let the AI re-locate the element (consumes model calls) |
| **Rephrase** | Describe the action differently and retry |
| **Manual takeover** | Perform the step yourself in the browser |
| **Skip** | Skip the step and continue |

## Pause and resume

You can pause generation at any time; **Continue** later resumes from the breakpoint — no re-run needed.

## Generation logs

Every run is archived under **Generation logs**: step-level logs (tool calls, visual observations, help decisions) and token accounting are fully traceable, with automatic cleanup after the retention period. See [Generation logs](/en/menus/genlogs).
