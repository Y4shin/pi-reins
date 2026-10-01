---
type: ticket
subtype: feature
title: Steering summary injection with cadence and forced triggers
status: stable
workflow_state: ready
blocked_by: [task-lifecycle]
---

## What to build

The context-tail steering summary, the plugin's single injection point.
Nothing is injected when no contract is active; during active execution
the minimal measured variant (invariant header, goal, counts, active
work, blocked, gate state, latest progress line, progress-recording
instruction) is appended after stable history on every fourth LLM call
(configurable), with forced injection at the first call of a run,
after compaction, at gate transitions, at completion attempts, and on
expected-declaration hits (wired by the nudge ticket). The summary
never persists into the session and the system prompt is never
modified.

## Acceptance criteria

- [ ] Without an active contract the outgoing message list is returned
      untouched.
- [ ] With an active contract the summary appears on the first call and
      then on every fourth call; each forced trigger injects
      immediately regardless of cadence.
- [ ] The summary content reflects current durable state and includes
      the invariant header and progress instruction.
- [ ] The cadence is configurable and the summary never accumulates in
      the session.

## Blocked by

- `task-lifecycle` (the summary reflects task state, the Now line, and the gate-aware tool surface).
