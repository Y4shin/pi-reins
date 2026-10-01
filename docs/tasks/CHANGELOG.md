---
type: changelog
title: Task Changelog
---
# Task Changelog

## 2026-10-01, Renegotiation triggers and the batched proposal session (renegotiation-session)
The renegotiation gate opens over the entire pending proposal set on
four triggers (current-work bearing on an in_progress task, task-start
entanglement, exhaustion of eligible agreed work, initiative via
`reins_renegotiate` tool and `/reins-renegotiate` command); the session
terminates the run at the gate with the current task left in_progress,
presents every pending proposal (deferred included, draft content for
additions) one blocking approve/defer/reject dialog each, and applies
dispositions durably (deferred markers, rejected deletions), entering
plan-editing on any approval or back to executing otherwise; dialogs
fail closed without UI and gate state renders on the widget. Landed
`shouldOpenSession`/`openRenegotiationSession` in
`src/handlers/renegotiate.ts`, the snapshot half of
`src/plan/fingerprint.ts` (`PlanSnapshot`, `snapshotPlanDir`),
`FsPort.delete`, required `setState` on the tool IOs, the `terminate`
run-termination hint, and `reins-gate-open`/`reins-gate-closed` session
entries for ticket 11's crash recovery. Gate: typecheck clean, 134/134
tests.

## 2026-10-01, Steering summary injection with cadence and forced triggers (steering-injection)
The steering engine injects the measured summary variant (invariant
header, goal, counts, active work, blocked, gate, latest progress,
progress instruction) into the context tail on the first call of a run
and every Nth LLM call (cadence via `--reins-cadence`, 0 disables
periodic), with forced triggers (run start, post-compaction,
completion attempt, `SteeringPort.forceInject`) overriding cadence;
injections re-read the plan directory fresh and never persist. Landed
the `takeForced` mailbox drain tickets 9 and 10 call unchanged and
the `completionAttempted` one-shot clear ticket 7 must expect. Gate:
typecheck clean, 101/101 tests.

## 2026-10-01, Change proposal recording and visibility (change-proposals)
The `reins_propose_change` tool records uniform change-proposal
documents under `proposals/` (kind add/modify/remove, resolvable
targets, rationale, draft binding sections for adds, optional
`dependsOn`/`enables` hints) with a wide refuse-at-recording set;
attach-time validation grew `checkProposals` plus the
`malformed-proposals` fixture family, and the widget counts pending
and deferred proposals while proposals stay execution-ineligible.
Landed the proposal store (`pending()`/`deferred()`/`bearingOn()`) and
`ProposalDocument.draft` at the discover site that tickets 9 and 11
consume. Gate: typecheck clean, 90/90 tests.

## 2026-10-01, Task lifecycle tools with write-path enforcement (task-lifecycle)
The five reins task tools (start with resume semantics, complete with
required summary, block with required reason, status, progress with
append-only progressLog) are the only write path into task state; a
tool_call guard blocks raw edit, write, and shell writes into the plan
directory in every bound state, naming the plugin tool; the widget
gained Active, Now, and counts lines. Landed the contractStatus
remaining-work listing and the guard's write-target exports tickets 7,
10, and 11 build on. Gate: typecheck clean, 71/71 tests.

## 2026-10-01, User-controlled plan activation (activation)
`/reins-activate` previews the plan (goal plus task summary) and on
confirmation flips executionStatus to active, ensures the Creation
entry then appends the Activation entry, writes the first human-actor
verified event, enters executing, and renders the minimal widget;
without an interactive UI it blocks fail-closed through `requireUi`.
Landed the acceptance write utilities (`prependLogEntry`,
`appendVerifiedEvent`) plan-editing-review reuses, and settled the
actor resolution pass-down. Gate: typecheck clean, 53/53 tests
including the live inert-load check.

## 2026-10-01, Attach-time validation of the execution-plan contract (attach-validation)
`validatePlan` returns every violation `{ file, rule, message }` with
rule classes composed via a `RULE_CHECKS` extension point (reserved
filename and unknown subheading rules surface as discovery/parse
findings), and the `/reins-attach <path>` command binds on pass,
refuses with a complete report otherwise, and never writes into the
plan directory. Gate: typecheck clean, 44/44 tests including the live
inert-load check.

## 2026-10-01, Package scaffold, test harness, and plan-directory IO (scaffold-plan-io)
pi-reins package scaffold landed: a pi extension with importable DI
handlers under a thin registration shell, the synthetic-event test
harness (scripted dialogs, captured UI calls, recorder ports, temp
plan dirs), the plan-directory IO module (discover, parse with
binding-section extraction, findings never crashes, generated-stamped
writes), and the plan-valid plus malformed fixture family. Gate:
typecheck clean, 24/24 tests, live inert-load verified against the
real pi CLI (0.84.4).
