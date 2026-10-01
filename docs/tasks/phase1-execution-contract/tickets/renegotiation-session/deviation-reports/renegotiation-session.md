---
type: deviation report
title: Deviation report for renegotiation-session
status: stable
---

## Deviation report: renegotiation-session

### API surface changes

- **Planned:** trigger evaluation `shouldOpenSession(state, scan, cause)` covering the four
  triggers (current-work bearing, imminent-work entanglement at task start, exhaustion,
  initiative via `reins_renegotiate` and `/reins-renegotiate`); the session terminates the
  run at the gate (current task stays in_progress), takes the pre-session snapshot,
  presents every pending proposal including deferred ones (rationale plus draft content
  for additions) one blocking approve/defer/reject dialog each, fail-closed without UI;
  dispositions apply when the sweep completes (deferred markers set, rejected proposals
  deleted); plan-editing on any approval with the tool-set swap, otherwise back to
  executing; the session result carries the approved-intent list (proposal ids by kind
  and target) plus the snapshot handle that plan-editing-review consumes.
- **Actual:** `src/handlers/renegotiate.ts` exports
  `shouldOpenSession(state, scan, cause: SessionCause)` and
  `openRenegotiationSession(deps, state, cause)` returning
  `{ state, result: RenegotiationOutcome }`; `RenegotiationOutcome` carries
  `terminateRun`, `approved: ApprovedIntent[]` (`proposalId`, `kind`, optional
  `target`), `deferred` and `rejected` id lists, `snapshot?: PlanSnapshot`, `report`,
  and a `kind` of completed, abandoned, or refused. `src/tools/renegotiate.ts` builds
  `reins_renegotiate`; `/reins-renegotiate` is registered in `src/pi.ts` and calls
  `ctx.abort()` when the gate opened. Every spec-named behavior landed as contracted.
  The handler lives in `src/handlers/renegotiate.ts`, one file beyond the spec layout's
  handlers/ list, continuing the attach/activate precedent from earlier tickets.
- **Additions beyond the planned surface** (all additive, confirmed against the diff):
  - `FsPort.delete(path)` on the shared port (`src/deps.ts`) plus its `NodeFsPort`
    implementation; the spec names rejected-proposal deletion but never a port method
    for it.
  - A required `setState` accessor on `TaskToolIo` and `ProposeToolIo` (and the new
    `RenegotiateToolIo`): a gate opened inside a tool execution must propagate the
    phase transition into the wiring's live state.
  - Optional `terminate?: boolean` on the task, propose, and renegotiate tool results
    (pi's `AgentToolResult` run-termination hint).
  - Harness: the `h.aborts` recorder and `isIdle`/`abort` on the synthetic ctx,
    documented in `docs/testing.md`.
- **Trigger 1 semantics (spec versus ticket doc):** the ticket doc says "a proposal
  bearing on the task currently being worked on or on the goal"; the arch spec narrows
  it to "a non-deferred proposal bearing on an in_progress task". The implementation
  follows the binding spec: unlinked (goal-level) additions never fire current-work on
  their own; they surface via exhaustion, initiative, or a later task-start once
  linked. The dialog presentation still labels unlinked additions as new work toward
  the goal.
- **Impact:** no dependent broke. plan-editing-review (ticket 11) consumes
  `RenegotiationOutcome.approved` and `.snapshot`, both present as contracted;
  out-of-band-detection (ticket 8) now finds `snapshotPlanDir` already landed beside its
  fingerprint work; every future `FsPort` implementor must carry `delete`.

### Abstraction usage

- Used/was specified: yes, with one availability gap.
  - Used as specified: the proposal store (`pending()`, `bearingOn()`), `requireUi`
    fail-closed, `SteeringPort.forceInject` at both gate transitions, `renderWidget`
    (gate state renders as `Gate: <phase>`), the `transition` state machine, and
    `writeFields` under the runtime's `withFileMutationQueue` for both the deferred
    marker write and the deletion.
  - Gap: `snapshotPlanDir` was listed as an existing abstraction, but its owner ticket
    (out-of-band-detection, ticket 8) had not landed and the `blocked_by` edges did not
    encode that dependency. This ticket pre-implemented the snapshot half itself.

### Out-of-scope changes

- `src/plan/fingerprint.ts` created (35 lines): `PlanSnapshot` and `snapshotPlanDir`,
  the module ticket 8 owns, snapshot half only, with the fingerprint half explicitly
  deferred to ticket 8 in the module doc.
- The shared-surface and harness additions listed above (`FsPort.delete`, `setState`,
  `terminate`, `h.aborts`).
- `reins_task_start` now also performs its already in_progress / already done legality
  check before the mutation queue (the in-queue check remains; same error text), so an
  illegal start on an entangled task refuses instead of opening a gate.
- Semantics pinned where spec and ticket were silent, each documented in code:
  - Trigger evaluation sites: current-work inside `reins_propose_change` after
    recording; exhaustion inside `reins_task_complete` after the flip; task-start
    entanglement inside `reins_task_start` before the flip, where an entangled start is
    not applied and reports "not started".
  - "Nothing startable" pinned as no pending, no blocked, and no in_progress tasks
    plus at least one non-deferred proposal (an in_progress task is current work, not
    exhausted work).
  - A dismissed or unrecognized dialog answer mid-sweep abandons the session: nothing
    durable applies, the phase returns to executing, a gate-closed entry with
    `abandoned: true` is recorded, and the run still terminates.
  - Private session entries `reins-gate-open` / `reins-gate-closed` record the open
    gate state the state machine doc names, for ticket 11's crash recovery; the ticket
    doc did not name them.
  - Approved proposals are deliberately kept (never deleted here); ticket 11 deletes
    applied proposals at review acceptance, per the proposal store's lifecycle.

### Ticket doc update needed?

Yes. The doc has no Implementation notes section yet; create it and append: the
trigger 1 spec-first resolution; the three trigger evaluation sites; the exhaustion
pinning; the mid-sweep abandonment semantics; the gate entry types and their ticket 11
consumer; the additive surface (`FsPort.delete`, `setState` on the tool IOs, the
`terminate` hint, harness `h.aborts`); and the `snapshotPlanDir` pre-implementation
with ticket 8 adding `fingerprintContract` beside it.

### User attention needed?

Yes (review-level, no blocker): the trigger 1 narrowing changes gate behavior relative
to the ticket's "or on the goal" wording; scope moved into ticket 8's module; the
shared `FsPort` and the tool IO interfaces grew required members (additive here; no
external implementors exist). Separately, the full suite carries one pre-existing
environment failure (inert-load: the user's custom pi theme JSON crashes the pi CLI
before extension load, verified identical on main) that will keep the effort's suite
red until the theme config is fixed outside the repo.
