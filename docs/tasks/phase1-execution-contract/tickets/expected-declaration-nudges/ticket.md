---
type: ticket
subtype: feature
title: Expected-declaration steering nudges
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
- steering-injection
size: s
---

## What to build

The advisory expected-declaration triggers: observing write targets
against the task's declared path regexes and shell commands against its
declared command regexes, and on an out-of-declaration write or an
unmatched command, triggering an immediate steering summary injection
with a targeted note naming the deviation, overriding the cadence.
Advisory only: the write proceeds; the declared lists never block, and
tasks without the fields get no triggering.

## Acceptance criteria

- [ ] A write outside every declared path regex triggers immediate
      injection with a targeted note, regardless of cadence.
- [ ] A command matching none of the declared command regexes triggers
      likewise.
- [ ] Declared matches, and tasks without the fields, trigger nothing.
- [ ] The nudge never blocks the write.

## Blocked by

- `task-lifecycle` (the observation hook rides the tool enforcement surface).
- `steering-injection` (the nudge is an immediate override of the injection cadence).

## Implementation notes

Landed from `ticket/expected-declaration-nudges` (5 checkpoint commits) onto
`task/expected-declaration-nudges`; verified on the merge: typecheck clean,
full suite 18 files / 179 tests green (run with the session's
`PI_PACKAGE_DIR` unset; the documented `tests/inert-load.test.ts`
environment issue does not fire without it).

- `src/handlers/tool-call.ts`: `observeExpectedDeclarations(event, ctx, io)`
  is the advisory observation leg. It consumes the guard's exported
  `rawWriteTargets(event)` plus the raw command lines of bash/powershell
  events, scans the plan directory fresh per event, and matches against the
  union of the active (in_progress) tasks' `expectedPathRegexes` /
  `expectedBashRegexes`. Each leg is armed only when that field is declared
  by an active task (no declared regexes means no triggering, never a
  vacuous all-undeclared match); unusable entries (non-strings, invalid
  regexes) are skipped, never a crash.
- `src/pi.ts`: the tool_call handler guards first, then observes. A blocked
  plan-directory write returns the guard's block decision and queues no
  nudge; the block reason is the targeted feedback for a call that never
  proceeds (settled in the guard's favor, pinned by a test).
- `src/steering/engine.ts`: `STEERED_PHASES` is now exported (one-word
  change); the observer gates on the same phase set the engine's context leg
  consumes, so a queued trigger is always promptly drained, never stale.
- On a deviation the observer calls `forceInject("expected-declaration",
  note)` with a one-line note naming the target, the unmatched field, and
  the active task id(s), overriding the cadence; one injection per event,
  with a bash event that deviates both as a write target and as a command
  line joined into a single note with "; ".
- Matching is on raw, unnormalized strings (the path argument and the
  command line verbatim), mirroring the guard's documented best-effort
  stance: an absolute-path write to a declared location can still nudge,
  advisory noise only (the fs-contract calls tuning the lists normal plan
  maintenance).
- Advisory by construction: the observer returns void and has no block
  path, so the nudge never blocks the write; the write always proceeds.
- `tests/expected-declaration-nudges.test.ts`: 12 seam tests covering all
  four acceptance criteria, including the cadence override (immediate
  injection mid-cadence and at cadence 0), the never-blocks pin, and guard
  precedence.
