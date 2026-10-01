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
