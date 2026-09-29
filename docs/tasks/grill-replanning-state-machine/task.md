---
kind: task
type: grilling
slug: grill-replanning-state-machine
title: Design the two-gate replanning state machine
map: phase1-execution-contract
status: done
blocked_by:
- grill-material-deviation-boundary
---

## Decision to settle

The exact behavior of the two-gate replanning protocol: the states, the
transitions, the triggers, and the failure and crash paths, so that
`to-spec` can specify the plugin's replanning control flow with nothing
left to decide.

plan.md's grilling surface 2 lists the questions to settle:

- What information must the proposal contain?
- What may the agent do while waiting for proposal approval?
- Exactly what is permitted during plan-editing mode?
- How is actual execution prevented before the second gate passes?
- What does review rejection do?
- Can the user abandon the revision entirely?
- What happens if Pi exits or crashes in the middle of this ephemeral
  transaction?

Throughout, the design must preserve the distinction between:

```text
approval of intent
```

and:

```text
approval of concrete plan changes
```

## Parent decisions it depends on

- `grill-material-deviation-boundary` (settled 2026-09-29): the boundary
  and the trigger model are settled inputs, not open design.
  Renegotiation fires when a change proposal bears on current or
  imminent work (goal changes bear on all tasks), at exhaustion (no
  eligible agreed work with proposals pending; plan completion blocked
  while they are undispositioned), or by initiative (an agent tool and
  a user slash command, both designed here). Sessions address all
  pending proposals; work other than the current task is never
  interrupted (fixup tasks instead). Executing-with-pending-proposals
  is the normal state; the session is the interrupt.
- (Informative) `grill-enforcement-and-context-strategy` will have chosen
  the mechanism class for gate interactions and execution blocking; this
  task designs the protocol on top of whatever surfaces exist.

## Choices already known

- The protocol shape is fixed by plan.md: proposal gate (approve intent,
  not concrete edits), plan-editing mode (execution paused, agent modifies
  the plan, no implementation work), review gate (concrete changes
  become authoritative on acceptance, execution resumes; rejection keeps
  execution paused and revising continues).
- The fs-contract fixes the durable side, as amended by
  `grill-material-deviation-boundary`: change proposals (additions,
  modifications, deletions, with dependency hints) are durable and
  accumulate while execution continues; the negotiation session itself
  is ephemeral (in-session approval and diff state stay in memory); the
  durable representation of an accepted change is the revised plan plus
  a `log.md` entry at revision acceptance.
- The plan directory is the complete durable representation; no separate
  negotiation directory exists (fs-contract, Durable Versus Ephemeral
  State).

## Recommended starting answer

Design a minimal explicit state machine: `executing -> proposing ->
plan-editing -> reviewing -> (accepted -> executing | rejected ->
plan-editing)`, with an abandon path from any replanning state back to the
pre-proposal executing state with the old contract intact, and a
crash-recovery rule: after restart, any ephemeral negotiation state is
gone, so the durable plan directory alone defines the contract, and the
plugin resumes in `executing` against it. Grill the crash question early:
it is the strongest constraint on how much state the negotiation may keep
in memory.

## Recommended starting answer (additional questions to grill)

- Proposal content contract: why the plan no longer suffices, what to
  change, why it is necessary/preferable (plan.md §1.6 lists these; make
  them the required fields).
- During proposal-pending and plan-editing: ordinary execution of
  unaffected, already-active work may continue or pause; grill the choice
  with the deviation boundary in mind.
- Review presentation: what the user sees at the review gate and how
  changes are made legible (Phase 1 keeps it simple; Phase 4 will improve
  presentation).
- Interaction with multiple concurrently active tasks when replanning is
  triggered (the durable model permits parallel in_progress).

## What downstream work the answer may create

The settled state machine (states, transitions, triggers, crash rule)
lands in the Phase 1 spec's replanning section, consumed by `to-spec` and
then `implement-task` feature tickets. If design exposes a genuinely new
decision (e.g. an approval-quorum question for multi-task replanning),
route it back to Wayfinder rather than improvising.

## Notes

- Execution follows `implement-task/resources/grilling.md`: one focused
  question at a time, concrete recommended answer with each, decisions
  recorded in the user's terms, never answering for the user.

## Decisions so far

- **R1 (2026-09-29): The renegotiation state machine.** Five states with
  the abandon path: executing (zero or more pending change proposals;
  the normal state), renegotiating (gate 1 over the entire pending set
  as blocking dialogs; the current run terminates at the gate; the
  current task stays in_progress), plan-editing (only plan-directory
  writes; tool swaps active), reviewing (gate 2 over the concrete
  revised plan), and back to executing on acceptance (revision bump,
  log Update entry plus verified event, batch dispositioned) or
  plan-editing on rejection (revise loop). Abandon from renegotiating
  or reviewing returns to executing with the old contract intact and
  the proposals still pending. The task doc's original proposing state
  is dissolved: executing-with-pending-proposals is the normal state
  and the session is the interrupt. Crash recovery: after a restart the
  plugin resumes in executing; in-session state is gone; durable
  proposals survive; the settled triggers re-fire; if the durable facts
  show a gate-2 acceptance (the log Update entry plus the bumped
  revision), the accepted state is authoritative and execution resumes
  against it.
- **R2 (2026-09-29): Uniform change-proposal documents (user decision,
  over the hybrid).** Every change proposal is a `type: Change Proposal`
  document in a `proposals/` subdirectory at the plan root; the plan
  directory's task documents are agreed work and nothing else. User
  rationale: it is clearer what is actually agreed upon, and cleaner,
  one OKF type per concept, no task documents that are not yet tasks.
  Resolved within the choice: (a) addition proposals carry the draft
  task content (the three binding sections, proposed id and title) in
  their body, so gate 1 reviews the real shape; materialization into
  real task documents happens at plan-editing; the proposal document is
  deleted at disposition; gate 2 reviews the materialized result and
  polices drift between the approved sketch and the concrete form, so
  the dual-representation window is bounded by deletion. (b)
  Frontmatter: `id` (required, semantic), `kind` (required: add,
  modify, or remove), `target` (required for modify and remove: the
  target task id), `title` (recommended), optional `dependsOn` and
  `enables` dependency hints in both directions (boundary task D3), and
  a `deferred` marker for parked proposals. (c) Consequences: the
  task-level executionStatus vocabulary stays
  pending/in_progress/blocked/done with no proposed value, superseding
  the boundary task's pinned expectation of a proposed-style task
  status; proposal documents are not contract content, so creating,
  editing, and deleting them is record-keeping rather than a
  contract-significant event; agreed work is exactly the task
  documents. The fs-contract amendments (a Change Proposal section, the
  proposals/ convention, the classification updates) land in this
  task's close-out under its pinned representation override.
- **R3 (2026-09-29): Dispositions and deferral semantics, with the
  user's completion-walkthrough addition.** Session dispositions per
  proposal: approve (intent approved in session memory; realized at
  plan-editing; the proposal document is deleted at review acceptance,
  its content now contract), reject (the document is deleted when the
  renegotiating state ends; re-proposing later with better arguments is
  always allowed), defer (the document stays, marked `deferred: true`).
  Deferral suppresses the item's trigger participation (current-task,
  goal, and start coupling never fire from a deferred item) but not its
  membership: deferred items reappear in every session that fires
  anyway, per the whole-set sweep principle, with guaranteed resurface
  points at exhaustion and via user initiative. Disposition maintenance
  applies at state transitions, not mid-dialog. User addition:
  completion walkthrough for deferred items. When the plan's agreed
  work is done, every remaining deferred proposal is walked through
  with the user and must end in a persistent disposition: folded into a
  user-designated durable location (typically the higher-level planning
  system's artifact, for example the plan's `sources` provenance target
  or a user-specified file, written by the agent) or consciously
  dropped. The plan cannot complete while deferred items are
  unresolved; pi-reins does not own the planning system, so the fold-in
  target is user-directed and the plugin's duty is that nothing
  vanishes silently into a completed plan directory.
- **R4 (2026-09-29): The plan.md amendment applied.** Section 1.6 is
  retitled Change proposals and rewritten to the recorded model:
  material deviations are recorded as durable change proposals, never
  executed before approval; recording does not interrupt execution;
  renegotiation is deferred until it becomes necessary (current-task
  and goal coupling, start coupling, exhaustion, initiative); a
  renegotiation session presents all pending proposals with
  approve, defer, or reject per proposal. Section 1.7's entry condition
  becomes After a renegotiation session has approved intents, normal
  execution pauses; the rest of 1.7 and all of 1.8 stand unchanged. The
  completion walkthrough for deferred items (R3) lands in the Phase 1
  spec; plan.md makes no Phase 1 claim it would contradict.

## Final decision

Settled 2026-09-29 with the user's explicit confirmation. The
replanning state machine is R1 through R4: the five-state machine
(executing with pending proposals as the normal state, renegotiating,
plan-editing, reviewing, abandon), uniform change-proposal documents
in proposals/ (the user's decision over the hybrid), dispositions and
deferral semantics with the completion walkthrough, and the plan.md
amendment. The durable-representation override was pinned to this task
by the boundary close-out and is applied here.

Dependent-task implications:

- `to-spec` receives the state machine, the permission matrix per
  state (renegotiating and reviewing: the run is terminated at the
  gate; plan-editing: plan-directory writes only, reads allowed;
  executing: normal), the disposition mechanics, the completion
  walkthrough, and the fs-contract's Change Proposal section.
- Mechanism naming reconciliation for to-spec: recording a proposal is
  one plugin tool (writes the proposal document); opening a
  renegotiation session is a distinct control (the initiative tool or
  the user slash command, plus the settled triggers); the enforcement
  grilling's gate tools carry the session's dialogs.
- The widget lists pending and deferred proposals alongside agreed
  work; layout is a to-spec detail.

Remaining fog: none from this task.
- **Plan-don't-do override (pinned by grill-material-deviation-boundary's
  close-out, 2026-09-29):** this task applies its settled amendments to
  the binding specs: the plan.md 1.6 timing amendment (immediate
  proposal becomes record-as-change-proposal, renegotiate when
  load-bearing) and the fs-contract's durable change-proposal
  representation, its shape (a proposed-style task status or otherwise)
  coordinated with grill-okf-compliance's status-naming decision.
