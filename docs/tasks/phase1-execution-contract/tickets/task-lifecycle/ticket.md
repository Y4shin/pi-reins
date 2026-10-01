---
type: ticket
subtype: feature
title: Task lifecycle tools with write-path enforcement
status: stable
workflow_state: ready
blocked_by:
- activation
size: l
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

## Implementation notes

Landed in place on `task/task-lifecycle`: the TDD loop committed its 13
checkpoints directly to the landing branch, so no `ticket/task-lifecycle`
branch existed and the `--no-ff` merge and branch deletion were no-ops.
Gate at landing: typecheck clean and the full suite green (10 files, 71
tests, including the inert-load check). No linter is configured in the
repo yet, so the static gate is `tsc --noEmit` only. Full deviation
analysis lives in `deviation-reports/task-lifecycle.md`. Notes for
downstream tickets:

- The tool_call guard blocks raw edit, write, and shell writes into the
  plan directory whenever a contract is bound (`planDir` set), in every
  phase, not only while executing: arch-spec decision 3 ("raw writes
  into the plan directory are blocked in every state") outweighs the
  ticket text's "while executing". Renegotiation-session, reconciling,
  and plan-editing inherit plan-directory blocking in gate phases with
  no extra work.
- There is no plugin-local mutation queue: every tool read-modify-write
  wraps in the pi runtime's own `withFileMutationQueue(filePath, fn)`
  from `@earendil-works/pi-coding-agent`, keyed by the task file's
  absolute path, so plugin writes also serialize against the built-in
  edit and write tools. Later tickets writing into the plan directory
  should import the same runtime symbol rather than inventing a queue.
- `writeFields(deps, file, fields, opts?)` in `src/plan/write.ts` gained
  an optional `{ remove?: string[] }` parameter, because resume must
  delete `blockedReason` from the frontmatter rather than null it;
  additive, existing callers unaffected.
- Export surface downstream tickets build on: `contractStatus(deps,
  state)` (its `remaining` field is the remaining-work listing the
  completion guard, ticket 7, reuses) and `formatStatus` in
  `src/tools/task.ts`; `rawWriteTargets(event)` and
  `shellWriteTargets(command)` in `src/handlers/tool-call.ts` (the
  nudge observer, ticket 10, consumes `rawWriteTargets`;
  plan-editing-review, ticket 11, inverts the guard decision);
  `latestProgress(scan)` in `src/ui/widget.ts` (the shared Now-line
  derivation, also consumed by `contractStatus`).
- `state.completionAttempted` is declared on `ReinsState` with no
  behavior in this ticket; completion-guard (ticket 7) sets it and
  steering-injection (ticket 6) reads it, per the interface contract.
- The task tools refuse outside an active contract and during gate
  phases (attached, renegotiating, reconciling) with the phase named;
  renegotiation-session may need to widen that gate check.
- Shell write detection in the guard is best-effort and documented:
  `cd` into the plan directory with relative targets, process
  substitution, and unquoted variable paths can evade it. Reads are
  never blocked; false blocks err toward contract safety.
- The widget renders in arch-spec order (goal, Active, Now, counts,
  Blocked, Gate; empty sections omitted); proposal counts land with
  ticket 5.
