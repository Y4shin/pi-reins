---
type: ticket
subtype: feature
title: Plan-level completion guard and settled pushback
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
size: m
---

## What to build

The plan-level completion guard: completing the plan refuses with the
remaining-work list thrown to the model while any task is pending,
in_progress, or blocked, and the agent_settled backstop that compares
durable state against the run's claims and starts a corrective run
seeded by a real user-role pushback message when the agent stopped
without completing. No text heuristics; the plan directory is the
structural truth.

## Acceptance criteria

- [ ] Completing with remaining work throws a refusal naming the
      remaining tasks, and the run continues.
- [ ] A settled run that claimed completion while work remains triggers
      a user-role pushback run.
- [ ] A settled run with clean state triggers nothing.
- [ ] The pushback channel is the user-role message, per the prototype
      measurement.

## Blocked by

- `task-lifecycle` (the guard compares durable task state and runs inside the same tool surface).
