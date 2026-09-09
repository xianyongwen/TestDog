---
description: Use TestDog's test intent, AI generation, assertions, replay and diagnostics to build test design, front-end analysis, evidence-based judgment and automation maintenance skills.
---

# Leveling Up Test Engineering with AI: From Operating Pages to Verifying Outcomes

AI can fill in forms, find elements and generate scripts, but a test engineer's value lies in judgment: what to test, what result is actually correct, whether the evidence supports the conclusion, and what a failure really exposed.

When using TestDog, treat each generation as a collaboration: you provide the business goal and acceptance basis, the AI executes and collects results, you review whether the test is valid, then replay turns that judgment into repeatable verification. The time saved on operations should go into test design and problem analysis.

This article uses "create a customer" as its running example to show how to train these skills in daily work. The customer fields and business rules below are examples only — substitute your own project's real requirements.

## 1. State what to prove before arranging what to click

"Open customer management, click Create, fill in the form, click Save" describes an operation route, but it never defines the correct result. Even if a success toast pops up, the customer may not have been saved, or the phone number may have been saved wrong.

A more complete test requirement states preconditions, input constraints and expected results together:

```text
Verify that a user with create permission can create a customer and that the saved information is correct.

Preconditions: use a login config with create permission and enter the customer management page.
Data: the customer name is unique to this run; the phone number uses valid test data.
Steps: create a customer, fill in name and phone number, save.
Acceptance: locate the customer created in this run and verify name and phone number
      within that record; refresh the page, find the customer again and verify it still exists.
Basis: the requirement states that a saved customer must persist and appear in the customer list.
Cleanup: after verification, clean up the customer created in this run per project
      conventions, without affecting other records.
```

After submitting the requirement on TestDog's [AI Generation](/en/guide/ai-generate) page, review the **Test Intent & Acceptance Criteria** in the plan confirmation modal carefully:

| What to review | Questions an engineer should ask |
| --- | --- |
| Scenario type | Is this verifying success, verifying rejection, or a mix of scenarios? |
| Preconditions | Are account permissions, login state and dependent data in place? |
| Data constraints | Which values are fixed, and which may be generated? |
| Acceptance criteria | Is the expected result specific? Does the verification scope point at the right record? |
| Acceptance basis | Does it come from requirements, API contracts or confirmed rules — or from the AI's guess? |
| Required items | Which results, left unverified, mean the test is not done? |
| Cleanup | What data does the test leave behind, when is it cleaned up, and by whom? |

**How the page currently behaves is the actual result; requirements and confirmed rules are the standard of judgment.** If the requirement doesn't say whether duplicate phone numbers are allowed, clarify the rule first. Never write "duplicates allowed" as the expected result just because the page lets it through.

A practical exercise: for every case you write, state in one sentence "which class of bug is this case meant to find". If the only answer you have is "see if it can be clicked", keep working on the acceptance criteria.

## 2. Protect the test intent, especially for negative tests

Experienced engineers distinguish "a data problem blocking the test" from "erroneous input that is exactly what's being verified". The same duplicate phone number is handled completely differently in two scenarios:

| Scenario | Sensible handling |
| --- | --- |
| Verifying normal creation, but old data already occupies the phone number | Under a generated-data constraint, change the data and verify again |
| Verifying that a duplicate phone number is rejected | Keep the duplicate, check the rejection and that no record was created |

For the second scenario, describe the requirement like this:

```text
Verify that the system rejects creating a customer with an already-used phone number.
Precondition: an existing customer uses the "existing phone" project environment variable.
The phone number is a fixed value and must not be swapped to make the submission succeed.
Other required fields use valid data, so this run exercises only the duplicate-phone rule.
After submission, verify the explicit duplicate message and confirm no new customer
was created by this attempt.
Do not delete the failed submission or the rejection assertions — they are necessary
test steps.
```

In the confirmation modal, mark the phone number as a **fixed value** and list the rejection as a required criterion. In a negative test, the test passes when the product rejects the input as expected; it fails when the product unexpectedly accepts it.

When designing cases, also build out boundary values, missing required fields, permission differences and state transitions around the same business rule. Give each case a single clear failure cause, and avoid filling in several wrong fields at once — you will only ever verify the first error message.

## 3. Learning front-end knowledge is about understanding state and locating causes

Front-end knowledge helps you explain "why didn't this action produce the expected result". You don't need to master an entire framework on day one; start by understanding these common phenomena:

| Page symptom | Possible cause | Evidence to check first |
| --- | --- | --- |
| Button visible but unclickable | Disabled, loading, covered by an overlay | Button state, overlay region, loading indicator |
| Value disappears or reverts after typing | Field linkage, input formatting, async state overwrite | Value before/after, validation message, related requests |
| Dropdown can't be typed into | Custom component; the trigger isn't an input | Expanded options, search box, how the component interacts |
| Search returns nothing at first | Debounce, request in flight, results not rendered yet | Request timing, response body, loading state |
| Record not found in the list | Pagination, filters, virtual scrolling, or data never saved | Current filter, pagination range, list response |
| Modal still open after save | Form validation, failed API call, page not updated | Field errors, the submit request, page feedback |

All of these are hypotheses to verify. "The parent field got cleared after I picked the child" may be normal linked behavior or a product defect — that observation alone never proves the user picked wrong.

In TestDog, start from the snapshots, action results and API details in the generation trail; when replay fails, look at the screenshot, console and network records in the run detail. When needed, use browser developer tools to inspect the DOM, computed styles, events and request timing. See [Generation Logs](/en/menus/genlogs) and [Run Records](/en/menus/runs) for where to look.

When inspecting the DOM and framework behavior, keep to real user interaction paths. Mutating internal page state, removing the disabled attribute or bypassing form validation may let the flow continue, but it cannot prove an ordinary user could complete the operation. If you need such techniques to prepare test data, keep them as a separate, declared preparation step — never pass them off as the operation under test succeeding.

## 4. Prove results with assertions that can discriminate

A good assertion distinguishes "business correct" from "looks successful". After writing one, ask yourself: **if the product hadn't really done this, could this assertion still pass?**

For example: checking only that "John Smith" appears somewhere on the page may match an old customer; checking only "save succeeded" may miss a persistence failure; checking only that the list has more than zero rows may never verify this run's new record at all.

In TestDog's plan, link each assertion to its acceptance criterion and double-check the locator scope, assertion type and expected value:

| Result to prove | Ways to verify |
| --- | --- |
| A customer's phone number is correct | Uniquely locate that customer, then `text_exact` on its phone-number cell |
| The form echoes input correctly | `value` on the corresponding input |
| An option's state is correct | `checked` / `unchecked` |
| A control is disabled per the rule | `disabled`, with the rule's preconditions made explicit |
| A specific record does not exist | `count = 0` on a stable, precise locator for that record |
| The save persists | Refresh or re-enter the page, then assert on the same record again |

Note what each assertion actually means: `text` is substring matching, `text_exact` compares full text after whitespace normalization; `count` counts matching nodes, hidden ones included. In paginated or virtualized lists, "the record isn't in the current DOM" does not prove "the record doesn't exist in the system" — narrow it down with a precise query or a suitable API check first.

Browser assertions retry automatically within a timeout budget. Wait for a definitive result instead of stacking fixed multi-second sleeps to paper over flakiness. For assertion types and completion rules, see [AI Generation](/en/guide/ai-generate#assertion-types).

The current tooling requires every required criterion to have real passing assertion evidence before generation can finish. That prevents missed verification — but whether the acceptance criteria themselves are correct, and whether they cover the key risks, is still the engineer's call to review.

## 5. On failure, gather evidence before deciding what to fix

When you see a red failure, don't rush to edit the script. First organize the problem into four sentences:

```text
Expected: per which requirement, under which conditions, what result should appear.
Actual: what was executed, and what actually happened to the page and data.
Evidence: the corresponding steps, inputs, screenshots, request/response and error logs.
Judgment: which explanation the evidence supports so far, and what evidence is missing.
```

Take "no new customer in the list after submit": first locate the request for this submission, check its parameters, status code and response body, then check whether the list refreshed and whether a filter excluded the new record. HTTP 200 is not business success, and a success field in the response body alone doesn't prove both the UI and the data are right. The API and the page are both evidence — check them together against the acceptance basis.

Let the evidence decide the next step:

| Judgment | Next step |
| --- | --- |
| Script located wrongly or interaction mismatched | Fix the locator or interaction, re-verify the original target |
| Login expired, permission missing, or dependent data missing | Restore preconditions and re-run |
| Actual behavior contradicts an explicit requirement | Keep the failure evidence, file a defect and create a reproduction case |
| Requirement unclear or evidence insufficient | Record the open question; conclude only after more information |

When generation suspends to ask for help, prefer concrete additions like "the customer is on page two" or "this account has no create permission". **AI repair** fits re-locating an element; **rephrase** clarifies intent; after a **manual takeover** you still need to verify the business result. **Skip** means that criterion went unverified — never list it among passed items.

TestDog does not self-heal failed assertions, so a real problem can't be turned into a pass. After an action locator is self-healed, still check the right element was operated before adopting the write-back.

**Finding a real defect is a valuable test output.** When a required assertion fails, the generation flow cannot report full completion; keep the existing steps and logs, record the defect, then continue or replay after the fix. Never lower the acceptance bar just to see a "finished" status.

## 6. Make scripts repeatable, and worth maintaining

One successful execution only proves the flow works in that environment, with that data, at that moment. Stable regression also means managing login, data, versions and cleanup.

Maintain login configs and environment variables that fit each scenario in the project. For positive data creation, use system variables; within one run the same variable resolves to the same value, so fills and assertions should reference the same variable. For example:

```text
Customer name: TestCustomer_{{systemTime}}
Phone number: {{randomPhone}}
Later locators and assertions keep referencing the same variables.
```

Random generation doesn't guarantee every business rule, and collisions are never fully impossible. For fixed lengths, number-range restrictions, or data that must pre-exist, prepare it per project rules. See [Test Data & Login](/en/guide/test-data) for usage.

After saving the script, use **Run Current Version** to validate the replay and check:

- Does it depend on login state, page position or test data accidentally left over from generation?
- Does it precisely locate this run's record, avoiding same-name old data?
- Are necessary refreshes, repeated operations and negative submissions fully preserved?
- Did cleanup actually run, and could it destroy data other cases depend on?
- Does self-healing fire often, suggesting locators or page structure need another look?

For scripts that have proven stable, prefer [Replay & Runs](/en/guide/replay) for daily regression. Deterministic replay calls no model; model cost appears only when locator self-healing kicks in. Reviewing repeated observations and failed retries in the generation logs often exposes unclear requirement descriptions or preconditions — which also cuts token cost on later generations.

## 7. Measure growth with reviews, not case counts

Each week, pick one successful case, one failed case and one that self-heals frequently, and review them:

1. Could the successful case's assertions catch a defect like "toast says success but data wasn't saved"?
2. Does the failed case carry enough evidence for another engineer to reproduce and judge it independently?
3. Does frequent self-healing stem from unstable locators, environment drift, or a test design coupled too tightly to the page?

In an isolated practice page, you can also plant a few known bugs: an invalid phone number accepted, data lost after save, a failed response displayed as success. Watch whether existing cases catch them, and improve assertions accordingly. Don't modify product behavior in a shared environment for practice.

When measuring progress, watch coverage of key risks, real defects found, false passes, repeat-run stability, and the cost to generate and maintain each useful case. A rising pass rate sometimes just means weaker assertions; more cases don't necessarily mean more valuable coverage.

Keep practicing — turning requirements into verifiable conventions, page symptoms into testable hypotheses, and execution results into reviewable evidence — and AI becomes an assistant that sharpens professional judgment. Next time the plan confirmation modal opens in TestDog, ask first: what can this plan actually prove?
