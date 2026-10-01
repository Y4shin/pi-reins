---
type: deviation report
title: Deviation report for steering-injection
status: stable
---

## Deviation report: steering-injection

Verified against the diff `main...ticket/steering-injection` (4 checkpoint
commits, 9 files, +539/-12), the arch spec's per-ticket contract (section 6)
plus the shared sections (steering injection, seams, layout, state machine)
and the as-built amendments from the five landed tickets, a direct read of
every changed source and test file, and an independent suite run (typecheck
clean, 13 files, 101 tests). All four acceptance criteria are satisfied at
the declared seams (context-handler in/out, content lines); the deltas below
are additive surface extensions, none dependent-breaking.

### API surface changes

- **Planned:** `SteeringPort` with `forceInject(reason, note?)` as the single
  override entry point the nudge ticket calls.
  **Actual:** the port additionally gained an optional
  `takeForced(): ForcedTrigger[]` mailbox drain (with the exported
  `ForcedTrigger` shape) that the engine's context leg consumes; queued
  triggers force the next eligible injection regardless of cadence and
  carry their note as a `Note: ...` line.
  **Impact:** additive and optional (`noopSteering` leaves it unset; the
  engine tolerates its absence via optional chaining). The nudge ticket
  (10) and the renegotiation machinery (9) still call `forceInject`
  exactly as the interface contract pins; the drain is the engine's
  consume side of the same port.
- **Planned:** the steered phases bounded by the Do-NOT list (detached and
  attached named).
  **Actual:** an explicit `STEERED_PHASES` set in the engine: executing,
  renegotiating, plan-editing, reviewing, reconciling. `completed` is
  excluded by judgment (steering ends with the contract), recorded by the
  implementer for ticket 9 to confirm.
  **Impact:** gate phases receive the summary (it carries the Gate line,
  which is the point there); no dependent names the narrower set.
  Renegotiation-session (ticket 9) should confirm this reading.
- **Planned:** completion-attempt forcing "via the state flag", with the
  task-lifecycle amendment saying the engine reads
  `state.completionAttempted`.
  **Actual:** the engine reads it AND one-shot-clears it on the injection
  that consumes it (otherwise every subsequent call would re-force).
  **Impact:** completion-guard (ticket 7) owns the flag's setter
  (`reins_complete`) and must expect the engine's clear; its declared seam
  ("the tool sets `state.completionAttempted` (forcing injection)")
  covers the pair end-to-end.
- **Planned:** `STEERING_MESSAGE_TYPE` declared and exported from
  `src/pi.ts` (the scaffold's surface).
  **Actual:** the constant moved to `src/steering/engine.ts` (avoiding a
  pi.ts import cycle) and is re-exported from `src/pi.ts`, so the public
  export surface is unchanged.
  **Impact:** none; importers of either path see the same value.
- **Planned:** cadence "every Nth LLM call (default 4, --reins-cadence
  flag)".
  **Actual:** `resolveConfig` accepts non-negative integers only; anything
  else keeps the default 4. A cadence of 0 disables periodic injection
  (forced triggers still inject), which the spec does not address.
  **Impact:** additive flag semantics; the cadence rhythm uses the
  session-global call counter while first-of-run forcing uses the per-run
  counter reset on `before_agent_start`, exactly the two scopes the spec
  names side by side.
- **Planned:** the minimal measured variant with a target of roughly 445
  characters.
  **Actual:** the named content line list was implemented exactly
  (invariant header, goal, counts, active, blocked, gate, latest progress
  line, progress instruction), composing to roughly 267-340 characters on
  the plan-active fixture. The prototype's 445 figure included lines the
  arch spec's list omits (contract title/status, pending proposal counts,
  a Next line), a spec-internal tension the implementer resolved in favor
  of the named list.
  **Impact:** none functional; recorded as workflow feedback on the spec.

### Abstraction usage

- Used/was specified: yes. The prototype findings supplied the measured
  variant and the defaults (cadence 4, pushbackMax 2 in `config.ts`);
  `composeSummary` reuses the widget's exported `latestProgress` for the
  Now line instead of re-deriving it; `state.completionAttempted` is the
  pre-declared flag; `discoverPlanDir` runs fresh per injection (derived
  state recomputed, never persisted; the fresh-reread test pins it); the
  context handler follows the plan-mode context-ownership pattern; tests
  run at the event-handler seam through `h.fire("context")` with the
  shared harness, and the content assertions bind only the required
  content lines as substrings, never whole-summary exact strings. The
  system prompt is never touched (no system-prompt surface exists in the
  diff), nothing persists into the session (asserted), and the summary
  never accumulates (per-call fresh list, asserted byte-identical plan
  directory). No YAML or Markdown parsing was reimplemented.

### Out-of-scope changes

- `docs/testing.md`: one sentence documenting that the steering recorder
  doubles as the forced-trigger mailbox. Docs convention upkeep, in the
  spirit of the harness-recorder documentation; harmless.
- `tests/harness/index.ts`: the recorder's `takeForced` implementation
  (drains `h.steering.forced`). Test infrastructure, additive, mirroring
  the port extension.
- `ContextResult` in `src/steering/engine.ts`: a structural return type
  because the peer dependency's `ContextEventResult` exists only in
  `types.d.ts` and is not exported from its package index. Environment
  constraint, documented by the implementer.
- `docs/tasks/state.yaml`: the orchestrator's unstaged `task:
  steering-injection` pointer was inherited and deliberately left
  uncommitted for the orchestrator (workflow state, not product code).

### Ticket doc update needed?

Yes. The land-worker's implementation note should record: the
`takeForced` port extension (additive, `forceInject` still the single
entry point); the explicit steered-phase set with `completed` excluded
pending ticket 9's confirmation; the one-shot clear of
`state.completionAttempted` that ticket 7's setter must expect; cadence-0
disabling periodic injection; the two deliberate untested pass-downs
(completionAttempted forcing until ticket 7's setter exists,
`resolveConfig` flag parsing as prod glue outside the four seams with
engine-side configurability pinned by the harness-config test); and the
summary-length note (named line list exact, character target not met
because the spec's figure measured a richer variant).

### User attention needed?

No. No planned API surface that a dependent calls differs: the context
tail injection point, the cadence and forced-trigger semantics, the
custom message shape, the flag name and default, and the
`forceInject` entry point all match the spec. Every delta is additive,
spec-consistent, and recorded above for tickets 7, 9, and 10.
