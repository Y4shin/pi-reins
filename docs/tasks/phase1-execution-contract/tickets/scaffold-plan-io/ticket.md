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

- [ ] The extension loads in a print-mode pi session via the CLI
      extension argument and is inert without an attached contract.
- [ ] The harness drives handlers with synthetic events and scripted
      dialog stubs and asserts on outputs and durable file effects.
- [ ] The module parses a conforming sample plan: plan document, task
      documents with binding sections, index, log.
- [ ] Unparseable files, missing types, and malformed frontmatter are
      surfaced as parse findings rather than crashes.

## Blocked by

- None (can start immediately).
