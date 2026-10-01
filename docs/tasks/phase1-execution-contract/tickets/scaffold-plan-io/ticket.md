---
type: ticket
subtype: feature
title: Package scaffold, test harness, and plan-directory IO
status: stable
workflow_state: ready
blocked_by: []
size: l
---

## What to build

The pi-reins package scaffold and the foundation everything else stands
on. A single pi extension whose event handlers are importable functions
with injected dependencies (event payloads, ui, filesystem root) and a
thin registration shell over them; the synthetic-event test harness
(scripted dialog stubs, captured widget and notification calls,
temporary plan directories); and the plan-directory module that parses
and discovers the plan document, task documents, change-proposal
documents, and the log per the execution-plan contract, with a
conforming sample plan fixture for tests.

## Acceptance criteria

- [x] The extension loads in a print-mode pi session via the CLI
      extension argument and is inert without an attached contract.
- [x] The harness drives handlers with synthetic events and scripted
      dialog stubs and asserts on outputs and durable file effects.
- [x] The module parses a conforming sample plan: plan document, task
      documents with binding sections, index, log.
- [x] Unparseable files, missing types, and malformed frontmatter are
      surfaced as parse findings rather than crashes.

## Blocked by

- None (can start immediately).

## Implementation notes

Landed from `ticket/scaffold-plan-io` as a `--no-ff` merge (10
checkpoint commits). Gate at landing: typecheck clean and the full suite
green (6 files, 24 tests, including the live print-mode inert load
against the real pi CLI, 0.84.4). No linter is configured in the repo
yet, so the lint gate is a no-op. Full deviation analysis lives in
`deviation-reports/scaffold-plan-io.md`. Notes for downstream tickets:

- Consume `PlanScan` from `discoverPlanDir`, or compose `parseDoc` +
  `extractBindingSections`; there are no per-type parser functions.
- `writeFields` throws on unparseable frontmatter (callers surface it
  as a tool error) and re-serializes frontmatter: YAML comments and
  non-semantic formatting are lost, bodies are preserved verbatim.
- `deps.actor` is resolved eagerly from the session cwd's repository at
  wiring time, as a plain string without the `human:` prefix.
  Attach-validation should revisit for plan directories outside cwd;
  activation must settle who prepends `human:` when writing the first
  `verified` event.
- The real FsPort is rooted at `ctx.cwd` until the attach ticket owns
  the plan path; the harness roots it at the plan directory.
- The malformed fixture family grows one directory per validation rule
  class; do not inline malformed content in tests.
- The `session_start` handler (`src/handlers/session.ts`) returns fresh
  ephemeral state; reconciling an attached plan lands with
  attach-validation.
