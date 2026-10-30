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

## Implementation notes

Landed from `ticket/completion-guard` (8 checkpoint commits) onto
`task/completion-guard`; verified on the merge: typecheck clean, full
suite 15 files / 145 tests green (run with the session's
`PI_PACKAGE_DIR` and `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`
stripped; the plain `npm test` failure in `tests/inert-load.test.ts` is
the documented environment issue, reproduced identically on `main`).

- `reins_complete` (`src/tools/complete.ts`): every call reads the plan
  directory fresh, refuses as a tool error with the remaining-work list
  (every non-done task with its status; blocked tasks carry their
  reason) while anything is pending, in_progress, or blocked, and sets
  `state.completionAttempted` so the steering engine forces the next
  injection, one-shot. The listing reuses `contractStatus().remaining`
  from `src/tools/task.ts`, the arch-spec pass-down.
- `agent_settled` backstop (`src/handlers/agent-settled.ts`): a settled
  run under an active, incomplete contract triggers one corrective run
  seeded by a real user-role pushback message via
  `deps.messenger.sendUserMessage`, naming the remaining tasks with
  statuses and blocked reasons. No text heuristics; durable task state
  decides. Clean state and inactive contracts fire nothing.
- Pushback chain: `state.pushbackCount` capped at `config.pushbackMax`
  (default 2), reset by a user-submitted prompt but not by the pushback
  run's own start, which the backstop distinguishes with an armed
  marker consumed at the next run boundary.
- Known limitation, documented in the module: a user prompt submitted
  between the pushback send and the pushback run's start is treated as
  the pushback run, so the chain counter stays capped until the next
  prompt. Structural, accepted.
- Divergences from plan, all additive: the clean-state branch of
  `reins_complete` refuses ("plan-level completion is not yet
  implemented in this version; the contract stays executing") until
  plan-completion (ticket 12) replaces it, whose IO already carries the
  `setState` accessor the flip needs; `ReinsState.pushbackCount?:
  number` added, where the arch-spec interface contract places the
  chain counter; `requireActiveContract` exported from
  `src/tools/task.ts` (was private) so the guard refuses on the same
  grounds with the right tool name.
- Pushback scope is deliberately broad per spec decision 2: every
  settled run under an active, incomplete contract is pushed back, not
  only runs after an explicit completion attempt.
- Post-effort lesson: the temporarily-refusing clean-state branch named
  above was replaced by plan-completion's full path (deferred
  walkthrough, completion verifier, durable records) on the same
  `planComplete` / `CompleteToolIo` surface; the refusal-with-remaining
  list remains the guard half of the tool, unchanged by that ticket.
