# Test Data & Login State

The two most common walls in UI automation: **login** and **dirty data**. TestDog solves the former with login configs, the latter with environment + system variables.

<video class="doc-video" src="/videos/test-data.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">Project row actions: Env Vars → Login Configs (with the new-config form)</p>

## Login config (login state recording)

Strip "login" out of every case: record the login state once, reuse it in generation and replay.

![Login config manager](/images/login-configs.png)
<p class="doc-img-caption">Login config manager: config list + new-config form (opened via the 🔒 row action)</p>

### Record a login state

1. Click the 🔒 **Login config** row action on the project list to open the manager.
2. In the "New login config" area, fill the **start URL** (the login page); the name can be left blank (auto-named).
3. Click **Start Recording** — a browser opens; log in manually.
4. Click **Stop & Save** to save the logged-in browser state (**cookies + localStorage**).

::: warning Note
**Closing the browser directly during recording cancels and saves nothing**; to abort click "Cancel Recording", and when finished log in then click "Stop & Save".
:::

### Using a login state

- **Replay**: pick it in the case detail's Login config dropdown — the browser starts already logged in, skipping the login steps.
- **AI generation**: pick it likewise, so flows behind the login page can be generated directly.
- **Project default**: set a project-level default via the case list's top-right dropdown.
- In the manager you can **rename**, **set as default**, **re-record** (after session expiry) and **delete** configs.

::: warning Login state validity
How long a login state stays valid depends on the system under test (session/cookie policies vary). **Re-record before each test session** to avoid a batch of false failures from an expired login state.
:::

## Environment variables

Project-level key-value pairs, referenced in scripts as <code v-pre>{{name}}</code> and replaced at runtime.

![Env var manager](/images/env-vars.png)
<p class="doc-img-caption">Env var manager (opened via the 🔑 row action)</p>

- **Define**: click the 🔑 **Env vars** row action and maintain key-value pairs via "Add variable". Names allow letters/Chinese/digits/underscore, no leading digit.
- **Reference**: write <code v-pre>{{baseUrl}}</code> or <code v-pre>{{测试账号}}</code> (Chinese names supported) in input values, URLs, assertion expectations, etc.
- **Replacement scope**: `instruction`, `url`, `value`, `locator.value`, `locator.name`, `assertion.expected`, `assertion.jsonPath`.
- **Undefined** variables keep the literal <code v-pre>{{name}}</code> and raise a warning in the run log.

Typical use: externalize environment-specific values (domains, accounts, passwords) — the same script runs against test/staging by swapping variable values.

## System variables

Built-in random data sources, same <code v-pre>{{...}}</code> syntax as environment variables — **no definition needed**:

| Variable | Generates | Example |
| --- | --- | --- |
| <code v-pre>{{systemTime}}</code> | Current timestamp (13-digit ms) | <code v-pre>test_{{systemTime}}</code> → unique account |
| <code v-pre>{{randomNumber}}</code> | Random digit string, 6 by default | <code v-pre>SN-{{randomNumber:8}}</code> |
| <code v-pre>{{randomChinese}}</code> | Random common Chinese chars, 2 by default | <code v-pre>user_{{randomChinese}}</code> |
| <code v-pre>{{randomPhone}}</code> | Random Chinese mobile number (11 digits) | phone fields |
| <code v-pre>{{randomEmail}}</code> | Random email | email fields |
| <code v-pre>{{randomIdCard}}</code> | Random 18-digit ID number (GB 11643 checksum) | ID fields |

- **`:N` parameter**: <code v-pre>{{randomChinese:4}}</code> for 4 chars, <code v-pre>{{randomNumber:8}}</code> for 8 digits.
- **Consistent within one run**: the random phone filled by `fill` and the one asserted later are the same value — it won't change mid-run.
- **Name collision**: environment variables win over system variables (explicit definitions override built-in randomness).

Main purpose: **generate unique test data** to avoid rerun collisions like "phone already registered".
