---
type: ticket
subtype: feature
title: Renegotiation triggers and the batched proposal session
status: stable
workflow_state: done
blocked_by:
- steering-injection
- change-proposals
size: l
---

## What to build

The renegotiation trigger set and the gate-1 session. Triggers: a
proposal bearing on the task currently being worked on or on the goal;
work about to start entangled with a pending proposal; exhaustion of
eligible agreed work with the set non-empty; deliberate opening by the
agent (tool) or the user (slash command). The session terminates the
current run at the gate (the current task stays in_progress) and
presents every pending proposal, including deferred ones and draft task
content for additions, with approve, defer, or reject per proposal
through blocking dialogs that fail closed without UI. Dispositions are
maintained durably at the state transitions: deferred markers set,
rejected proposals deleted. Gate state appears on the widget.

## Acceptance criteria

- [ ] Each trigger opens a session over the entire pending set;
      deferred items appear in the sweep but never trigger a session on
      their own.
- [ ] The dialogs present each proposal with rationale and, for
      additions, draft content; answers record approve, defer, or
      reject.
- [ ] Approved intents transition toward plan-editing; deferred
      proposals carry the deferred marker; rejected proposals are
      deleted when the renegotiating state ends.
- [ ] The current run terminates at the gate and the current task stays
      in_progress.
- [ ] Gate state appears on the widget; without UI the session blocks
      fail-closed.
- [ ] Both the agent tool and the user slash command open sessions.

## Blocked by

- `change-proposals` (the session presents the recorded pending set).
- `steering-injection` (gate transitions are forced-injection triggers and the widget gate state rides the status surface).

## Implementation notes

Landed on `task/renegotiation-session` (created from `main`, the branch
point of the working branch) by merging `ticket/renegotiation-session`
(9 TDD checkpoints) with `--no-ff` and deleting the ticket branch. Gate
at landing: typecheck clean and the ticket suite green
(`tests/renegotiation-session.test.ts`, 33 tests); the full suite runs
133 passed with 1 failed, the known pre-existing inert-load environment
failure (the session `PI_PACKAGE_DIR` pointing at pi 0.99.2 themes while
vitest's PATH runs the repo-pinned pi 0.84.4 resolver), verified
identical on `main` and not caused by this ticket; no linter is
configured in the repo, so the static gate is `tsc --noEmit` only. Full
deviation analysis lives in `deviation-reports/renegotiation-session.md`.
Notes for downstream tickets:

- Trigger 1 is implemented per the arch spec, which narrows this
doc's "or on the goal" wording: only a non-deferred proposal bearing on
an in_progress task fires current-work. Unlinked (goal-level) additions
never open a session on their own; they surface via exhaustion,
initiative, or a later task-start once linked. The dialogs still present
them as new work toward the goal.
- Trigger evaluation sites (this doc did not name them): current-work
inside `reins_propose_change` after the recording; exhaustion inside
`reins_task_complete` after the flip that empties the board; task-start
entanglement inside `reins_task_start` before the flip, so an entangled
start is refused ("not started") instead of applied.
- "Nothing startable" (the exhaustion condition) is pinned as: no pending,
no blocked, and no in_progress tasks (all agreed work done) plus at
least one non-deferred proposal; an in_progress task counts as current
work, not exhausted work.
- A dismissed or unrecognized dialog answer mid-sweep abandons the
session: nothing durable applies, the phase returns to executing, a
gate-closed entry with `abandoned: true` is recorded, and the run still
terminates.
- Private session entries `reins-gate-open` / `reins-gate-closed` record
the open gate state (the state machine doc's gate lifecycle);
plan-editing-review (ticket 11) consumes them for crash recovery.
- Additive shared surface: `FsPort.delete(path)` (durable rejected
proposal deletion, required for every future implementor); a required
`setState` accessor on `TaskToolIo`, `ProposeToolIo`, and the new
`RenegotiateToolIo` (a gate opened inside a tool execution must
propagate the phase transition); an optional `terminate?: boolean` on
the task, propose, and renegotiate tool results (pi's
`AgentToolResult.terminate` run-termination hint); harness `h.aborts`
recorder plus `isIdle`/`abort` on the synthetic ctx, documented in
`docs/testing.md`.
- `PlanSnapshot` and `snapshotPlanDir` live in `src/plan/fingerprint.ts`,
pre-implemented here (snapshot half only) because the owner ticket had
not landed; out-of-band-detection (ticket 8) should add
`fingerprintContract` beside it and the coherence pass should unify the
shapes.
- Entering plan-editing swaps edit and write out of the active tool set
here (the contract assigns the swap to the phase entry); until ticket 11
lands there is no restore path, so plan-editing is a deliberate dead-end
phase (no review or finish tools yet).
- Approved proposals are deliberately kept (not deleted here): they stay
pending until review acceptance, where ticket 11 deletes applied
proposals, per the proposal store's lifecycle.
- The deferred marker shape is owned here as the strict boolean
`deferred: true`, taking over the shape decision the change-proposals
notes deferred to this ticket.
- The orchestrator's `task: renegotiation-session` pointer in
`docs/tasks/state.yaml` was swept into this landing's docs commit
(workflow state, not product code); finalize-task owns clearing it.
