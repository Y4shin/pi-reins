---
type: ticket
subtype: feature
title: Plan completion with deferred walkthrough and verifier agent
status: stable
workflow_state: ready
blocked_by:
- renegotiation-session
size: l
---

## What to build

Plan-level completion end to end. The completion walkthrough: when
agreed work is done but deferred proposals remain, each is walked
through with the user and must end in a persistent disposition, folded
into a user-designated durable location (written by the agent) or
consciously dropped; the plan cannot complete while any are unresolved.
The completion-verifier agent: a shipped fresh-context agent run
through pi-subagents (a hard dependency added here, failing visibly
when absent) receiving the completion contract and a change digest and
returning fulfilled or a gap list, with gaps returned to the model as
the refusal. On success: the log Completion entry and the plan flipped
to completed.

## Acceptance criteria

- [ ] Completing with unresolved deferred proposals runs the
      walkthrough; each item ends folded or dropped, and the plan
      cannot complete otherwise.
- [ ] The verifier agent runs on completion attempts; a gap list is
      returned to the model as a refusal with the gaps named.
- [ ] A clean, verified completion writes the Completion entry and
      flips the plan to completed.
- [ ] With pi-subagents absent the plugin fails visibly at session
      start rather than silently skipping verification.

## Blocked by

- `renegotiation-session` (deferred proposals and the disposition machinery must exist, and the walkthrough reuses the session's dialog mechanics).

## Implementation notes

Landed from `ticket/plan-completion` (7 checkpoint commits) onto
`task/plan-completion`; verified on the merge: typecheck clean, ticket
file 17/17 green, full suite 2 failed / 217 passed (run with
`PI_PACKAGE_DIR` and `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`
stripped; the plain `npm test` failure in `tests/inert-load.test.ts` is
the documented environment issue). The 2 failures are the recorded
divergence below, not regressions in this ticket's surface.

- `reins_complete` (`src/tools/complete.ts`) runs in order: structural
  guard (remaining-work refusal, from completion-guard), the
  verifier-availability refusal (named error, never a silent skip),
  the deferred-proposal walkthrough, the fresh-context verifier
  verdict, then the durable records.
- Walkthrough: one blocking fold-or-drop dialog per deferred proposal,
  reusing the renegotiation session's `presentationOf`. A drop deletes
  the proposal document immediately; a fold asks for a durable target,
  refuses targets inside the plan directory, and records an
  outstanding fold on the ephemeral state (`state.completionFolds`).
  Dismissed or unscripted answers abort fail-closed: drops so far
  stand, folds stay recorded, completion is refused naming the
  unresolved items. On the next attempt a fold whose designated target
  exists dispositions the proposal for good and deletes its document
  through `FsPort.delete` under the mutation queue; unverified folds
  re-present, so any item can still be folded differently or dropped.
  The plan cannot complete while any deferred item is unresolved.
- Completion verifier (`src/handlers/verifier.ts` plus
  `agents/reins-completion-verifier.md`): a read-only, no-tools
  fresh-context agent shipped as one markdown definition and
  registered at session_start through pi-subagents' runtime agent
  registration event (`pi-subagents:runtime-agent-register:v1`, the
  raw event contract, no runtime import of pi-subagents). The run goes
  through the in-process event-bus RPC spawn with a 15-minute timeout,
  carrying the completion contract and a change digest (the plan log's
  entry lines). `VERDICT: fulfilled` completes; bulleted lines become
  the refusal's named gaps; a failed run refuses naming the failure.
- Completion records: inside one mutation-queued step, `plan.md` flips
  to `executionStatus: completed`, the log gains the
  `**Completion**: Plan completed: <goal>.` entry newest-first, the
  state transitions to completed, and the widget re-renders (Gate:
  completed). No `verified` event is appended: the binding
  plan-fs-contract appends verified events only at activation and
  review acceptance and states nothing is appended at task completion,
  so the fs-contract wins over the arch spec's ticket-11 wording (the
  spec-reconciler should amend the spec, not the code).
- pi-subagents absence: the session_start install attempts the
  registration once per session and rides the outcome on
  `state.verifierUnavailable`. A session whose entries show a bound
  contract fails visibly at session_start (one error notification plus
  the widget's Verifier marker line); sessions without a bound
  contract stay inert per the landed inertness rule; `reins_complete`
  refuses with the named error either way, so no session silently
  skips verification.
- Known red on the tree, deliberate: two
  `tests/plan-editing-review.test.ts` crash-recovery tests assert
  unchanged notification counts across a session_start that follows an
  attach, and the spec'd visible-absence failure adds exactly one
  error notification when pi-subagents is absent from the bare vitest
  environment. Both tests pass unchanged with a simulated installed
  owner (per docs/testing.md). Foreign tests were left untouched per
  the divergence rule; the coherence pass owns the fix. Landing
  proceeded on that recorded routing because this is the effort's last
  ticket and the coherence pass, which fixes those tests, needs this
  ticket landed first. Full detail in
  `deviation-reports/plan-completion.md`.
