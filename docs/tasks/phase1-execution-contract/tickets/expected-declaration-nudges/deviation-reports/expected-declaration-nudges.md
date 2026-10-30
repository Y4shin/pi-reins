---
type: deviation report
title: Deviation report for expected-declaration-nudges
status: stable
---

## Deviation report: expected-declaration-nudges

### API surface changes
- **Planned:** the tool_call observation leg consuming the guard's exported
  `rawWriteTargets(event)` and `shellWriteTargets(command)`
  (`src/handlers/tool-call.ts`) plus the raw command lines from the events;
  matching against the union of the active (in_progress) tasks'
  `expectedPathRegexes` / `expectedBashRegexes`; on no match,
  `forceInject("expected-declaration", note)` with a targeted note naming the
  deviation, overriding the injection cadence. Advisory only: the write
  proceeds, the lists are never permission, tasks without the fields never
  trigger. Interface contract: none forward; note wording matches the
  summary's plain style.
- **Actual:** As planned, plus:
  - `src/handlers/tool-call.ts` additionally exports
    `observeExpectedDeclarations(event, ctx, io)` and `ExpectedDeclarationIo`
    (state accessor plus per-event deps factory rooted at the plan dir). The
    spec named the leg but not the export shape; this is the module's
    composition surface, additive.
  - `src/steering/engine.ts`: `STEERED_PHASES` is now exported (one-word
    change). The observer gates on the engine's steered-phase set so a queued
    trigger can never sit undrained; without the gate a nudge queued in a
    non-steered bound phase would surface as a stale note at some later
    injection.
  - The raw command line comes from a local `shellCommandOf(event)` helper
    rather than a new export; `shellWriteTargets` stays consumed via
    `rawWriteTargets`, which the spec's composition language already covers.
  - Composition decision, pinned by a test: a blocked plan-directory write
    queues no nudge. The guard's block reason already names the deviation and
    the legal tools; a queued note would be double feedback for a call that
    never proceeds. The spec's guard-precedence composition ("the observer
    composes with the guard") did not state which leg wins; this settles it
    in the guard's favor.
  - One `forceInject` per event, deviations joined with "; " (a bash event can
    deviate both as a write target and as a command line) instead of one
    trigger per deviation.
  - Matching is on raw, unnormalized strings (the path argument and the
    command line verbatim), mirroring the guard's documented best-effort
    stance; an absolute-path write to a declared location can therefore still
    nudge. Advisory noise only; the fs-contract calls tuning the lists normal
    plan maintenance.
- **Impact:** None forward-facing: the spec declared no interface contract
  for this ticket ("none forward"). plan-editing-review (ticket 11) extends
  this same tool_call surface (it inverts the guard to block out-of-plan-dir
  writes) and consumes the guard-precedence pattern established here
  (blocked calls return the guard's decision; nothing else observes them).
  `STEERED_PHASES` becoming public is a naming addition the engine's own
  module already owned.

### Abstraction usage
- Used/was specified: yes. Reused `rawWriteTargets` (and transitively
  `shellWriteTargets`) from the guard, `SteeringPort.forceInject` drained by
  the engine's `takeForced` mailbox, `discoverPlanDir` for the fresh
  per-event scan, and the harness/fixtures substrate. No reimplementation of
  guard scanning, steering composition, or plan parsing.

### Out-of-scope changes
- None removed. Additions beyond the ticket's named export are the
  composition surface listed above (the `observeExpectedDeclarations` export,
  `ExpectedDeclarationIo`, the `STEERED_PHASES` export, the wiring block in
  `src/pi.ts` that composes guard-then-observe in one `tool_call` handler).
  The pre-existing `inert-load` test failure under this session's exported
  `PI_PACKAGE_DIR` was confirmed environmental (documented hazard in
  `docs/testing.md`), reproduced identically off-ticket, and left untouched.

### Ticket doc update needed?
Yes: append to `## Implementation notes` that the observation leg landed as
`observeExpectedDeclarations` in `src/handlers/tool-call.ts`, composed after
`guardPlanDirWrites` in `src/pi.ts`; that `STEERED_PHASES` is exported for
the phase gate; that blocked plan-directory writes queue no nudge (the block
reason is the targeted feedback there); and that matching is raw-string,
best-effort, with one joined note per event.

### User attention needed?
No. All deltas are additive, advisory-only by construction, and within the
ticket's and the spec's scope; no API surface diverged in a way dependents
consume differently than planned.
