---
type: ticket
subtype: feature
title: Steering summary injection with cadence and forced triggers
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
size: m
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

## Implementation notes

Landed on `task/steering-injection` (created from `main`, the branch
point of the working branch) by merging `ticket/steering-injection`
(4 TDD checkpoints) with `--no-ff` and deleting the ticket branch.
Gate at landing: typecheck clean and the full suite green (13 files,
101 tests, including the real-pi inert-load check); no linter is
configured in the repo, so the static gate is `tsc --noEmit` only. Full
deviation analysis lives in `deviation-reports/steering-injection.md`.
Notes for downstream tickets:

- `SteeringPort` gained an optional `takeForced(): ForcedTrigger[]`
  mailbox drain (with the exported `ForcedTrigger` shape): the
  engine's context leg drains queued triggers to force the next
  eligible injection regardless of cadence, carrying any note as a
  `Note: ...` line. The extension is additive and optional
  (`noopSteering` leaves it unset); `forceInject(reason, note?)`
  remains the single override entry point, so
  `expected-declaration-nudges` and the renegotiation machinery call
  it unchanged.
- `STEERING_MESSAGE_TYPE` moved from `src/pi.ts` to
  `src/steering/engine.ts` (avoids a pi.ts import cycle); `src/pi.ts`
  re-exports it, so the public export surface is unchanged.
- Steered phases are the explicit set in the engine: `executing`,
  `renegotiating`, `plan-editing`, `reviewing`, `reconciling`;
  `completed` is excluded by judgment (steering ends with the
  contract). `renegotiation-session` should confirm the gate phases
  want steering; the summary carries the Gate line, which is the
  point there.
- The engine reads `state.completionAttempted` and one-shot-clears it
  on the injection that consumes it (otherwise every later call
  would re-force). `completion-guard` owns the setter
  (`reins_complete`) and must expect the clear; the forcing path is
  implemented but untested until that setter lands (deliberate
  pass-down, covered end-to-end by completion-guard's declared seam).
- `resolveConfig` accepts non-negative integers only for
  `--reins-cadence`; anything else keeps the default 4, and a cadence
  of 0 disables periodic injection (forced triggers still inject). Flag
  parsing is prod glue outside the four test seams (only its
  registration is exercised via the inert-load check); the
  engine-side configurability is pinned by the harness-config test.
- The summary implements the arch spec's named line list exactly
  (invariant header, goal, counts, active work, blocked, gate, latest
  progress line, progress-recording instruction), composing to
  roughly 267 to 340 characters on the plan-active fixture, under the
  "roughly 445 characters" figure because that figure measured a
  richer variant (contract title/status, pending proposal counts, a
  Next line) that the spec's list omits.
- The context handler types its result structurally (`ContextResult`
  in `src/steering/engine.ts`) because the peer dependency's
  `ContextEventResult` exists only in `types.d.ts` and is not exported
  from its package index.
- `tests/harness/index.ts`: the steering recorder doubles as the
  forced-trigger mailbox (`takeForced` drains `h.steering.forced`),
  documented with one sentence in `docs/testing.md`.
- The orchestrator's `task: steering-injection` pointer in
  `docs/tasks/state.yaml` was swept into this landing's docs commit
  (workflow state, not product code); finalize-task owns clearing it.
