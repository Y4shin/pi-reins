---
type: ticket
subtype: feature
title: Task lifecycle tools with write-path enforcement
status: stable
workflow_state: ready
blocked_by: [activation]
---

## What to build

The task tools as the only write path into task state: start, complete
(requires a non-empty completion summary), block (requires a reason),
status query, and progress recording (append-only progressLog entries).
Plugin writes stamp `generated`; a tool_call hook blocks raw writes
into the plan directory with a reason naming the plugin tool; the
widget shows active work, the Now line, and counts; multiple
concurrently in_progress tasks are representable.

## Acceptance criteria

- [ ] Start, complete, block, and status produce durable frontmatter
      transitions and one-line results.
- [ ] Completing without a completion summary and blocking without a
      reason are refused with named requirements.
- [ ] Progress entries append to progressLog and the widget Now line
      shows the latest.
- [ ] Raw edit, write, and shell writes into the plan directory are
      blocked pre-execution with a reason naming the plugin tool.
- [ ] The widget reflects active work and counts after each
      transition; two tasks can be in_progress at once.

## Blocked by

- `activation` (tools operate on an active contract and the widget exists).
