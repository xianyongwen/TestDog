# Changelog

What's new in each TestDog release. Installers are available on the [Download page](/en/download); the latest release notes are also published on [GitHub Releases](https://github.com/xianyongwen/TestDog/releases).

## v0.1.6 (2026-09-18): Native save dialog and bilingual generation logs

This release focuses on everyday usability: exporting a file on desktop now opens the system's native "save as" dialog so you choose where it goes, and tool names and status text in the generation log are rendered in the interface language, so the log reads in your own language in both Chinese and English.

### Exports use a native save dialog

- Downloading skill bundles, rule files, and plugin templates on desktop now opens the system's native "save as" dialog, letting you choose the destination and file name.
- Writing happens only at the path you select in the dialog, and file names are restricted to a whitelist, so the frontend cannot choose a write path.
- The result is reported clearly: saved (with the path shown), download started (browser build), cancelled, or failed.

### Generation logs render in the interface language

- Generation steps now store the raw tool name; the display name is translated per interface language, so the same record reads in the corresponding language in both Chinese and English instead of being hardcoded to Chinese.
- Fixed status text during generation (browser viewport, login-config loading, attachment loading, outline confirmation, pause and completion notices) is delivered as message keys with each event and rendered by the frontend per language.
- Chinese tool names in older generation records are normalized and translated on display; existing records are unaffected.
- Added Chinese and English display names for actions such as upload, scroll, and set_date, which previously fell back to English action names in the UI.

### Fixes and improvements

- Adjusted the plan-type select width on the generation page to 100px.
- Upgraded the GitHub Actions used by CI to their current major versions.

### Upgrade notes

- **v0.1.3 and later can upgrade to v0.1.6 directly via in-app "Software Update"; v0.1.2 and earlier must manually install v0.1.3 (which includes the updater) first, then update in-app.**
- Upgrades keep the existing app data directory — projects, scripts, and settings; new settings are auto-added at startup, no manual database changes needed.
- Bilingual generation logs apply to both new and old records; existing scripts and replay are unaffected and stay compatible.
- Acceptance completion still means the corresponding assertions actually passed during generation; run a regression replay as usual after generation.

## v0.1.5 (2026-09-16): Project test files, locator scope and the scroll action

This release extends AI generation and replay into more realistic business scenarios: test files can be managed centrally in a project and uploaded during generation/replay, locators can be scoped to a container to handle dialogs and duplicate controls, and a new scroll action lets snapshots perceive scroll state. It also lets you send corrections while generation is running, strengthens idle-loop protection, preserves login state after the browser closes, and syncs the native window theme on desktop.

### Project test files and upload

- New project test file management: upload project test files during generation; they are stored centrally and cleaned up by reference (24-hour grace period plus reference detection), so files no longer have to exist only locally.
- New upload action: generation and replay upload with consistent semantics, supporting both direct injection into `input[type=file]` and the file-chooser path; disabled controls, multi-file limits, and file-chooser timeouts all produce clear errors.
- New list_files generation tool: the model pages through project test files before choosing; the upload step's fileIds must come from that list; file resolution happens uniformly before the action runs, avoiding mid-action failures.

### Scroll action and snapshot awareness

- New scroll action: supports scrolling the page, a scroll container, or an element into view, on either axis, by distance, or to top/bottom; generation and replay use the same DOM scrolling implementation without synthesizing mouse-wheel events.
- Snapshots now perceive the position and scrollability of the page and scroll containers, so the model can judge page changes before and after scrolling.

### Locator scope

- The steps table supports editing locator scope: configure a scope container per step (scope strategy, role, name, and locator value) to locate a unique container first, then find the target element inside it — handling duplicate controls in dialogs, attachment areas, and the like.
- New "pick scope": select the container to use as the scope in the browser; confirming updates only the scope and keeps the target locator, with no need to re-pick the target.
- Target picking validates against the configured scope: picked targets are validated for membership and generate a container-relative locator, avoiding cross-container confusion.

### Testcase package v2: test files carried in the package

- `.testcase` export upgraded to v2: upload steps that reference project test files are exported with the package (embedded file contents and hash verification); import verifies integrity and rebuilds files as needed; cases that reference no files stay in v1 format for backward compatibility.

### Generation controllability

- Send corrections while generation runs: enter a correction note on the generation page (1–8000 characters); it is injected into subsequent planning after the current action finishes, with no need to interrupt the whole generation.
- Stronger idle-loop protection: new short-cycle loop detection triggers a help request when the same action returns to the same state 3 rounds in a row and aborts automatically after 9 repeats, avoiding pointless idle consumption; the progress/observation counter lifecycle was reworked to distinguish real progress from idling more accurately.

### Login state and desktop theme

- Browser login recording keeps the most recent successful snapshot, so the most recently captured login state is saved automatically after the browser closes.
- Switching themes now syncs the Tauri native window title-bar theme and clears the override when following the system, preventing the WebView media query from being stuck on a forced theme.

### Fixes and improvements

- Deleting an assertion step from the plan now cleans up acceptance goals that are no longer referenced, avoiding leftover invalid goals affecting completion validation.
- The test file list on the generation page keeps only files uploaded this session, no longer mixing in historical files.
- The confirm/cancel buttons in the picking toolbar no longer overflow at narrow viewports.
- Run-detail info columns are width-limited, with full errors shown via hover.
- The script tab sidebar in case details was adjusted to 380px; plugin table column widths and long-text display were improved.
- README demo assets were updated to the main-flow video.

### Upgrade notes

- **v0.1.3 and later can upgrade to v0.1.5 directly via in-app "Software Update"; v0.1.2 and earlier must manually install v0.1.3 (which includes the updater) first, then update in-app.**
- Upgrades keep the existing app data directory — projects, scripts, and settings; new settings are auto-added at startup, no manual database changes needed.
- Test files, scope, and the scroll action are used by newly generated scripts; existing scripts and generation records are unaffected and replay stays compatible.
- Testcase v1 import continues to work; exported v2 packages require v0.1.5 or later to import.
- Acceptance completion still means the corresponding assertions actually passed during generation; run a regression replay as usual after generation.

## v0.1.4 (2026-09-12): Test data binding, acceptance-goal amendment and assertion diagnostics

This release focuses on controllable AI generation and trustworthy assertions: test data written by the generator is bound consistently with assertion expectations, acceptance goals can be amended directly while generation is suspended, and assertion failures come with actionable locator diagnostics. It also adds checkbox and radio-group component plugins, and fixes usage under-recording on cancelled generations and broken self-heal for recorded scripts.

### Test data binding and conflict review

- Instance values written by fill and semantic actions that match a data template are auto-bound back to placeholders: the script saves a "data pattern" instead of a one-off instance value; the same placeholder is resolved by the same rule during replay, and assertion expectations automatically equal what was actually written.
- When a value swap retries during generation (regenerate), later references to that placeholder and assertion expectations are synced automatically, avoiding the mismatch of "filled the new value but asserted the old one".
- Editing filled values on the plan-confirmation page syncs the test intent's data constraints and acceptance goals, keeping all three consistent.
- Before first confirmation, fixed data constraints are automatically reviewed against planned values; on conflict a dialog shows the differences and you can choose to proceed with the planned values.

### Suspended waiting and acceptance-goal amendment

- The wait limit for plan confirmation and assist decisions is relaxed from 5 minutes to 2 hours; the confirmation dialog shows a countdown that turns warning-colored under 10 minutes; the dialog auto-collapses on timeout or failure end states.
- When suspended for help, a new "amend acceptance goals" action lets you adjust acceptance data and expectations directly in the assist panel; guardrails release against the amended criteria without redoing the full confirmation flow.
- Assertions inconsistent with confirmed acceptance goals are recognized as contract errors: they do not count toward the failure-help limit or trigger mechanical help requests; concrete amendment suggestions are fed back instead. The duplicate "AI fix" option was removed from the assist panel.
- The idle-observation help threshold is configurable per model (2–20, default 6): models billed per image view can raise it to reduce screenshot overhead.

### More trustworthy assertions and snapshots

- Assertion failures distinguish locator breakdown from page-state mismatch: they explicitly report "locator matched 0 elements" or "matched N elements (multi-match conflict)", so the generation model can immediately switch to a correct locator, reducing trial-and-error and accidental help requests.
- If a hidden assertion never matches any element within the whole wait window, the result carries an "empty assertion" warning, guarding against always-true passes caused by broken selectors.
- Retries that change the locating strategy are counted independently per new locator, no longer mixed with "same-target retries", so model self-correction is not misjudged as a dead loop.
- Snapshot collection now covers div onClick pointer cards (list record cards were previously invisible to the model and caused false-negative acceptance); when a keyword query matches nothing on interactive elements, page text is used for a second judgment with a fallback hint.
- The generation model is instructed to wait for dialog animations to finish before reading controls, reducing misjudgment during dialog transitions.

### New checkbox and radio-group component plugins

- New checkbox and radio-group plugins for Ant Design and Element: check/uncheck runs idempotently and waits for the controlled state to settle; radio groups select by visible text; disabled options fail with a clear error.
- Compatible with Ant Design v5/v6 and element-ui/element-plus.

### Fixes and improvements

- Fixed usage under-recording of the in-flight call on the last step when a generation is cancelled; usage reconciliation now falls back to runtime accumulators.
- Fixed manually recorded scripts not triggering AI self-heal: the self-heal instruction now falls back to the step description, so both recorded and generated scripts can self-heal.
- Self-heal locators in run details and Excel exports now render as readable Playwright chained expressions instead of raw JSON.
- Adjusted the main-container height calculation on the generation page to improve layout.
- Rewrote the bilingual README, added quick-start demo videos and a recording script; the download page now uses a manifest fetched at build time, with deployment scripts added.

### Upgrade notes

- **v0.1.3 users can upgrade to v0.1.4 directly via in-app "Software Update"; v0.1.2 and earlier must manually download v0.1.3 first, then update in-app.**
- Upgrades keep the existing app data directory — projects, scripts, and settings; new settings are auto-added at startup, no manual database changes needed.
- Test data binding and acceptance-goal amendment take effect in new generation sessions; existing scripts and generation records are unaffected and replay stays compatible.
- The idle-observation help threshold default changed from 4 to 6; adjust it in app settings based on the pricing model of your gateway.
- Acceptance completion still means the corresponding assertions actually passed during generation; run a regression replay as usual after generation.

## v0.1.3 (2026-09-09): Test intent with acceptance validation, desktop auto-update

This release strengthens acceptance constraints for AI-generated tests: define the business results to verify before generation, track real assertion evidence during generation, and require all required goals to pass before completion. It also adds a desktop update entry and fixes theme/font-size switching consistency.

### Test intent and acceptance criteria

- Configure positive, negative, or mixed scenarios plus test objectives, preconditions, data constraints, and cleanup requirements in the existing plan-confirmation window — no extra confirmation round.
- For each acceptance goal, fill in the expected business result, verification scope, acceptance basis, and assertion conditions, and mark whether it is required; required goals must link to a planned assertion.
- Stronger negative testing and fixed data constraints: the generator follows the confirmed requirements, preserving inputs expected to fail and refusal-verification steps; assertion types and expectations of confirmed goals cannot be replaced or weakened by generation tools.
- Acceptance criteria are saved with the script version, viewable in case details, and preserved across save-as-version, single/bulk export, and import.

### More precise assertions and completion validation

- New browser assertions: exact text equality, field value equality, checked/unchecked, enabled/disabled, matched element count, and exact URL; empty fields and zero-match results can be verified.
- Generation and replay share consistent assertion semantics and wait for async page states within the timeout; exact text comparison normalizes whitespace.
- Only assertions that actually executed successfully and were saved can register acceptance progress. Generation logs show per-goal coverage; completion requires valid evidence for all required goals and an assertion as the script's last step.
- After modifying or deleting related steps, old evidence no longer counts; evidence is re-checked after pause/resume and script review. Skipping a required goal allows continuing other steps but completion cannot be reported as full.
- Replay assertion failures are no longer judged as passed via AI re-location, reducing the risk of masking real issues; action locating failures keep the existing self-heal.

### Desktop software update

- New "Software Update" entry in the sidebar: manual checks, download progress and release notes, and an option to disable auto-check.
- Official desktop builds with updates enabled check for the latest official version after startup, periodically, and on network recovery, and download update packages automatically.
- After signature verification, you confirm "restart and install", or postpone. The built-in backend is stopped before installing; on failure it attempts to restore the current backend.
- The release pipeline produces signed update packages and manifests for macOS Apple Silicon, macOS Intel, and Windows x64.

### Fixes and improvements

- Fixed possible desync between global component styles and page styles after saving theme or font size; the UI refreshes after settings change to apply consistent configuration.
- Adjusted generation input-area height and case-list created-time column width.
- The docs homepage picks Chinese or English by browser language and remembers your explicit switch; individual page links keep their designated language.
- Refined the bilingual README entries with a better project introduction and architecture overview.
- Fixed SQLite empty-DB template initialization during packaging; backend, component plugins, and DB schema shipped with installers are synced.

### Upgrade notes

- **Upgrading from v0.1.2 requires manually downloading and installing v0.1.3.** Older versions have no updater; after installing v0.1.3 with updates enabled, in-app updates become available for later versions.
- Auto-update depends on the update public key in the release package and published signed update assets. Local builds without the key do not enable auto-update; the browser version has no update entry.
- Upgrades keep the existing app data directory — projects, scripts, and settings; new fields are auto-added by startup migration, no manual database changes needed.
- Existing scripts and old paused tasks without test intent remain compatible. Existing HTTP API and WebSocket replay assertions keep working; the new acceptance planning focuses on browser assertions.
- Acceptance completion means the corresponding assertions actually passed during generation, not that a fresh full replay succeeded; run a regression replay after generation.

## v0.1.2 (2026-09-08): Initial release

TestDog is a desktop test-case management tool that integrates case management, AI script generation, browser recording, and automated replay — taking you from a test description to a repeatable test script.

### AI script generation

- Describe test goals in natural language, combined with a start URL, attachments, and login profiles.
- Confirm the AI-proposed step plan first, then execute step-by-step in a real browser and save the script.
- Pause and continue generation; when stuck, use AI repair, rephrase, manual takeover, or skip.
- OpenAI-compatible API with configurable gateway, API key, and model; vision models can use image attachments and page screenshots.

### Browser recording and case management

- Record browser operations and import them as editable test steps.
- Save login states for reuse in generation and replay.
- Manage cases and script versions per project, with drag-sorting and batch default-version setting.
- Single or bulk import/export of `.testcase` files.

### Automated replay and test reports

- One-click script replay with headless batch runs across a project.
- Page UI, HTTP API, and WebSocket message assertions.
- AI self-heal for broken locators, with one-click adoption back into the script.
- Failure screenshots, console logs, and network info recorded; export run results as JSON / Excel and Excel test reports.
- Regular replay never calls an LLM; AI generation, repair, and self-heal call your configured model service.

### Component plugins and experience

- Built-in plugins for Ant Design, Element UI / Element Plus, Vant, and MUI, covering dropdowns, tree selects, cascaders, dates, times, and sliders.
- Import custom JavaScript / ZIP plugins and combine them via presets.
- Generation logs with token usage, and random test-data variables.
- Simplified Chinese / English UI, light / dark / system themes, and font size settings.

### Installation notes

- **macOS**: this release uses ad-hoc signing without Apple notarization. First launch may be blocked; after verifying the installer's origin, allow it under "System Settings → Privacy & Security".
- **Windows**: the installer is not code-signed with a paid certificate and may show an unknown publisher or SmartScreen prompt.
- AI generation and self-heal quality depends on the model and the pages under test; review generated steps and assertions before using them for regression testing.
