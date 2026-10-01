---
type: ticket
subtype: feature
title: Attach-time validation of the execution-plan contract
status: stable
workflow_state: ready
blocked_by:
- scaffold-plan-io
size: m
---

## What to build

Attach-time validation of a plan directory against the full
execution-plan contract: the upstream hard rules, the documented OKF
profile rules, the binding-section structure and roles, the
executionStatus vocabularies, unique ids, reserved filenames, and the
log structure. A failing attach produces the precise rejection report
naming every violated rule; the plugin never repairs or generates.

## Acceptance criteria

- [ ] A conforming plan attaches cleanly.
- [ ] Each rule class (frontmatter, binding sections, vocabulary, id
      uniqueness, reserved filenames, log structure) has a test with a
      representative malformed plan.
- [ ] The rejection report names every violation with its rule, not
      only the first.
- [ ] Missing or insufficient plans are refused with a report, never
      improvised around.

## Blocked by

- `scaffold-plan-io` (package scaffold, test harness, and plan-directory IO).

## Implementation notes

Landed from `ticket/attach-validation` as a `--no-ff` merge (12
checkpoint commits, deviation report staged into the merge). Gate at
landing: typecheck clean and the full suite green (8 files, 44 tests,
including the live inert-load check against the real pi CLI). No
linter is configured in the repo yet, so the static gate is
`tsc --noEmit` only. Full deviation analysis lives in
`deviation-reports/attach-validation.md`. Notes for downstream
tickets:

- `ReinsWiring.createDeps` now takes an optional `ReinsDepsOptions
  { fsRoot }`; the attach command roots the fs port at the plan
  directory and the harness honors it, so refusals of missing plans
  behave as they do live.
- `reserved-filename-role` (a reserved file carrying an execution
  type, and a nested `type: Execution Plan` document) surfaces as a
  discovery finding; `unknown-task-subheading` as a parse finding;
  both aggregate into the attach report via `validatePlan`.
- The private session entry written on attach is `reins-attached`
  with `{ planDir, phase }`; the durable plan directory remains the
  authority for reconciliation.
- `RULE_CHECKS` in `src/plan/validate.ts` is the extension point the
  change-proposals ticket adds proposal rules to.
- Attach never writes into the plan directory; a test asserts the
  plan directory is byte-identical after a passing attach.
- Deferrals: `deps.actor` resolution for plan directories outside the
  cwd repository (and the `human:` prefix) passes to activation; the
  session-start crash-resume rebuild passes to plan-editing-review
  (ticket 11), which owns the session-entry read machinery. Until then
  every session starts detached and re-attaches by command.
- Residual validation gaps: log newest-first ordering,
  `schemaVersion` value pinning, and log-entry placement before the
  first date heading.
- The `discover.ts` import-line blemish (two imports merged onto one
  line) awaits the coherence pass.
