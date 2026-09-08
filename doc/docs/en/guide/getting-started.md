# Getting Started

From installation to your first passing case in about 10 minutes.

## 1. Install

[Download the latest installer](/en/download) for your operating system and chip.

- **macOS**: open the `.dmg` and drag TestDog into **Applications**.
- **Windows**: run the NSIS installer and follow the wizard.

The installer bundles a Node runtime and browser environment — end users **do not need Node.js**. Upgrades never overwrite your existing database; new columns are migrated automatically on startup.

::: tip For developers
To run from source: `npm install` → `npm --prefix server install` → `npm run tauri dev`. See "Development" in the repository README.
:::

## 2. Configure the AI gateway

AI generation and self-healing need an LLM. TestDog talks to model services over the **OpenAI-compatible protocol**, so any compatible service works: DeepSeek official, OpenRouter, a company gateway/proxy, etc. Open **Settings** in the sidebar and fill in:

- **Gateway URL / API key / model name** (required, provided by your provider; DeepSeek's official URL is `https://api.deepseek.com`)
- **Model has vision**: sends image attachments and screenshots directly to the model (the model must support vision)
- **Reasoning depth** (reasoning models only; keep off for normal models)

See [Settings](/en/menus/settings) for details.

## 3. Create a project and a case

1. Open **Projects** and create a project with a **start URL** (the address under test; generation/recording/replay open it by default).
2. Inside the project, create a test case with a title and description.

::: tip Does the system under test need login?
Record the login state once as a **login config**; generation and replay then run logged-in, without testing login in every case. See [Test Data & Login](/en/guide/test-data).
:::

## 4. Generate your first script

Three ways — pick any:

| Method | Best for | Docs |
| --- | --- | --- |
| **AI generation** | You can only describe the flow in words, or interactions are complex | [AI generation](/en/guide/ai-generate) |
| **Manual recording** | You already know each step | [Manual recording](/en/guide/record) |
| **Import .testcase** | Shared case files / coding-agent output | [.testcase files](/en/guide/testcase-file) |

Recommended flow: **AI-generate the first version → tweak steps manually → verify by replay → keep as a regression case**.

## 5. Run the replay

Hit **Run** on a script version; Playwright replays deterministically and executes assertions. Results and failure diagnostics live under **Run records**. See [Replay](/en/guide/replay).
