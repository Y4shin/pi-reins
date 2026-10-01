---
type: ticket
subtype: feature
title: User-controlled plan activation
status: stable
workflow_state: ready
blocked_by: [attach-validation]
---

## What to build

The activation command: a plan preview and a confirmation dialog, and
on confirmation the proposed-to-active flip, the log Creation and
Activation entries, the first verified event (human actor from git
email, else the OS username), the plugin entering executing state, and
the minimal widget (goal and counts) appearing. Fail-closed when no UI
exists.

## Acceptance criteria

- [ ] The command shows a preview and requires confirmation;
      declining changes nothing durable.
- [ ] On confirm the plan is active, the log carries the Creation and
      Activation entries, and the plan carries a verified event with a
      human actor.
- [ ] The widget renders goal and counts after activation and nothing
      before.
- [ ] Without UI, activation blocks fail-closed rather than
      auto-approving.

## Blocked by

- `attach-validation` (validation must exist before a plan can be bound).
