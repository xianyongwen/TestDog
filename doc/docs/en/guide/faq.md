# FAQ

## Does AI generation really operate my system?

Yes. Generation is not a dry run — it **actually performs** every step in a real browser (clicks, typing, submissions) and only then writes the script. So:

- Always point TestDog at a **test environment**, never production (generation may create real business data, e.g. real orders or submissions);
- Replay executes for real too — point it at a test environment as well.

## Generation keeps asking for help

- Check the gateway configuration ([Settings](/en/menus/settings)); verify connectivity with a simple case first.
- When a help request appears, try **Rephrase** — rewording the intent often locates the element more easily.
- For complex interactions (dropdowns, date pickers), make sure the plugin preset is linked to the project ([Plugins](/en/menus/plugins)).
- For stubborn pages, use **Manual takeover** and perform the step yourself.

## Gateway connection fails?

- Verify the gateway URL, key and model name on the Settings page.
- The gateway must be **OpenAI-compatible** (`/v1` style).
- For intranet gateways, make sure the machine running TestDog can reach it.

## Browser not found?

- Leave **Browser path** empty to auto-detect system Chrome; specify the path manually if your browser is in a non-standard location.

## Replay reports "element not found"?

- If the frontend changed recently, replay automatically enters **AI self-healing** to re-locate; after a successful heal, **write it back** to the original script.
- If it keeps failing, check the failed step's **screenshot and console/network capture** in run records to see the actual page state.
- The `url` assertion reads the URL instantly; for navigation steps, add a `visible` assertion or a short `wait` first.

## Plugin uploaded but not taking effect?

Uploading is not enough — two more steps:

1. Add the plugin to a preset on the **Preset** tab of the plugins page;
2. Link that preset to the test project.

Also run **Try run** once so the action list gets written back.

## Is my data safe after an upgrade?

Yes. Upgrades never overwrite the existing database; an idempotent migration adds new fields at startup.

## Does replay consume model tokens?

No. Replay is deterministic Playwright execution at zero LLM cost. Only **script generation** and **self-healing relocation** call the model.

## Which component libraries are covered?

Built-in plugins cover select, tree-select, date-picker, time-picker, slider and cascader components across **Ant Design / Element / Vant / MUI**; other variants can be added via custom plugins ([Plugins](/en/menus/plugins)).

## Why was this step written this way?

- Each step has a description column — fill it in when generating/editing.
- The full AI decision trail (tool calls, visual observations, help decisions) is traceable under **Generation logs**.
