---
type: task
title: Define the material deviation boundary with practical examples
status: deprecated
blocked_by: []
subtype: grilling
workflow_state: done
---

## Decision to settle

Where the material deviation boundary runs: which agent behaviors during
execution count as **material changes** requiring user involvement through
the proposal gate, and which remain ordinary implementation freedom the
agent may exercise without asking. plan.md calls this the central semantic
question and demands a boundary defined by practical examples, not an
abstract definition.

The target principle, from plan.md:

> Require user involvement when a change would materially alter the user's
> reasonable understanding of what the agent agreed to do.

The decision must produce a concrete classification of these example
categories (plan.md's own list, plus scenarios surfaced during grilling):

- ordinary implementation freedom;
- tactical deviations that do not affect the agreement;
- new work reasonably implied by an existing task;
- task reinterpretation;
- scope expansion;
- removal or replacement of agreed work.

Plus the steering-side consequence: for each side of the boundary, what
the plugin does (steer, warn, block, or route to the proposal gate).

The fs-contract already provides the durable-format counterpart: its
Contract-Significant Versus Execution-State Changes section classifies
changes to *documents*. This grilling settles the *behavioral* boundary
for the agent during execution, and must stay consistent with that
document-level classification.

## Parent decisions it depends on

- None hard. It informs the replanning state machine's trigger conditions
  (`grill-replanning-state-machine` waits on this task) and sharpens the
  steering summary's pushback targets (informative for
  `grill-enforcement-and-context-strategy`).

## Choices already known

- The two-gate protocol itself is fixed by plan.md: proposal (approve
  intent), then review (approve concrete changes). This task defines what
  *triggers* it, not its mechanics.
- The document-level classification (contract-significant vs
  execution-state changes) is fixed in the fs-contract and binding.

## Recommended starting answer

Anchor every classification in the user's reasonable understanding: a
change is material when it would surprise the user reading the plan before
approving it. Work through the plan.md categories with 8-12 concrete
execution scenarios, classify each, and record the pattern that emerges
plus the closest hard cases and their verdicts. Keep the steering response
conservative on the ambiguous middle (warn and offer the gate, never
silently decide), and record rejected alternative boundaries (e.g. any
file edit outside task scope, or only explicit user-visible scope
statements) with why they fail plan.md's too-permissive/too-strict test.

## What downstream work the answer may create

The settled boundary (with its examples) lands in the Phase 1 spec as the
steering policy's classification rules, and feeds
`grill-replanning-state-machine`'s trigger design. It may also update
`CONTEXT.md`'s Material change entry if the definition sharpens (via the
domain-modeling conventions); that edit is part of settling this decision.
If the boundary work exposes the need for user reaction to concrete
boundary-artifact examples beyond conversation, route that to Wayfinder as
a prototype candidate.

## Notes

- Execution follows `implement-task/resources/grilling.md`: one focused
  question at a time, concrete recommended answer with each, decisions
  recorded in the user's terms, never answering for the user.
- plan.md's own warning applies: too permissive makes the contract
  advisory; too strict makes routine implementation bureaucratic. The
  examples must include cases that stress both failure modes.
- CONTEXT.md's Unresolved section already tracks this boundary as a live
  design question; resolving it here should close that entry.

## Decisions so far

- **D1 (2026-09-29): The materiality test.** The boundary is defined by the
  surprise test as the semantic standard: a change is material when it would
  alter the user's reasonable understanding of what the agent agreed to do.
  The code-enforced proxy is the structural test: contract-significant
  document changes always route to the proposal gate. Corollaries: ambiguity
  resolves toward proposing (a false proposal costs one gate round-trip; a
  missed one is the expensive error), and every trigger in the Phase 1 spec
  is labeled code-enforced or agent-judged. Rejected alternatives:
  structural-only (blind to purely behavioral drift, would make the
  contract advisory) and explicit-statement-only (unwritten implications
  would never count, and scope expansion contradicts nothing explicit).
- **D2 (2026-09-29): The implied-work line, revised by the user.** New work
  not grounded in any task document is execution freedom only when it is
  necessary to satisfy an agreed task as written (its stated content,
  constraints, and acceptance criteria). The recommended
  customary-practice clause (tests and doc updates as auto-implied) is
  rejected: customary artifacts are executed only when the task text
  grounds them (an explicit acceptance criterion, the task description,
  or a dedicated task). Rationale: auditability. The user wants to know
  ahead of time whether the agent planned for tests and similar steps;
  plans whose tasks stay vague about them should surface that vagueness
  rather than hide it as implied execution. General guideline recorded
  with it: enforcement must not be draconic (agents thrive with freedom),
  with reasonable bounds and forced renegotiations when plans change.
  Scenario ledger so far: S1 helper file necessary for the task as written
  (freedom); S1 test file freedom only if the task text grounds tests,
  otherwise it queues; S2 unrelated latent-bug fix not necessary (queues,
  not executed); S3 README update not grounded (queues); S4 caching
  layer serves the goal's spirit only (queues, never without approval).
- **D3 (2026-09-29): The deferred-proposal queue (user proposal, direction
  accepted, immediacy rule open).** Material deviations are recorded as
  queued proposals, covering additions and, once generalized, also
  modifications and deletions of agreed work, with optional dependency
  hints in both directions (the new item depends on agreed or queued work,
  or agreed or queued work probably depends on the new item). The queue is
  durable and visible in the user-facing state surface; queued work is
  never executed before approval. Renegotiation is deferred until
  necessary, then runs the existing two-gate flow over the batch: the
  queue is the intake of the proposal gate. Consequence: this amends
  plan.md 1.6's immediate-proposal timing (a material change to the
  binding spec, decided deliberately here); the amendment text is owed to
  plan.md, and the state machine, trigger conditions, and the durable
  queue representation belong to grill-replanning-state-machine.
- **D4 (2026-09-29): The renegotiation trigger model, consolidated over
  rounds 4 and 5.** One mechanism: the change proposal queue (final naming
  deferred to the CONTEXT.md sharpening at task close). One principle:
  renegotiation fires when a queued proposal bears on work that is current
  or about to become current; the goal bears on all tasks (every task
  operates under the assumption of the overall goal), so goal-level
  proposals always trigger immediately. Concretely: (1) current-task
  coupling, a proposal against the task being worked on renegotiates now;
  (2) start coupling, renegotiation fires before starting a task that a
  queued proposal adds to, modifies, or deletes, or that a queued item is
  flagged as a likely dependency of; (3) exhaustion, when no eligible
  agreed work remains (all done or blocked) and the queue is non-empty,
  the finish-line batch renegotiation runs, and the plan cannot be
  declared complete while the queue is undispositioned; (4) initiative,
  an agent-side tool and a user-side slash command open renegotiation
  immediately at any time. Every renegotiation session sweeps the entire
  queue of pending changes and addresses all of them (dispositions
  include doing, deferring, and rejecting; mechanics belong to the state
  machine). A proposal about work other than the current task never
  interrupts the current task: discovering task A (done) was wrong while
  executing task C neither blocks nor interrupts C; fixup tasks for
  affected work are created inside the renegotiation instead. Closed by
  D5: deferred proposals fire only at the standing triggers plus
  initiative.
- **D5 (2026-09-29): No task-boundary default.** Completing a task during
  which proposals accumulated is not itself a renegotiation trigger
  (option (a) adopted): deferred proposals fire only at the standing
  triggers (current-task coupling, goal coupling, start coupling,
  exhaustion) or through initiative (agent tool, user slash command).
  Rejected alternatives: the task-boundary checkpoint (an observant agent
  queueing adjacent improvements constantly would force a session after
  nearly every task, recreating the interruption-heavy design that
  deferral exists to remove) and the rework-class special case (a
  proposal taxonomy to maintain for little gain).
- **D6 (2026-09-29): What binds inside a task document, made structural
  by the user.** The task prose carries exactly three binding H2 sections
  under the task H1: `## Description` (authoritative for interpreting what
  the task is about: identity and scope), `## Done-Contract` (provisional
  name: what must have been done to call the task done), and `##
  Constraints` (all explicit execution constraints). No other direct
  subheading of the task H1 is allowed; all other prose is advisory. Each
  binding section binds by its role: Description binds task identity and
  scope, Done-Contract binds completion conditions, Constraints bind
  execution boundaries. Sentence-level force inside the sections (a
  suggestion phrased inside a binding section) remains a small
  agent-judged gray area with the D1 conservative bias applying.
  Consequences: the D2 necessity test reads exactly these three sections;
  a missing Done-Contract is plan.md 1.1's insufficient information and is
  rejected at activation, making the S7 backstop structural; the rule
  amends plan-fs-contract.md (task body structure; Phase 3's
  acceptance-criteria example reconciles into Done-Contract). Scenario
  ledger: S5, the constraint lives in `## Constraints`, so deviating means
  queueing a modification to the current task, and the session fires
  immediately; S6, advisory prose, tactical freedom, note in the
  completion summary (placement decides force: the same sentence inside
  Description would bind task scope, not technique choice); S7, thin
  Description with no Done-Contract fails activation, and if execution
  reaches such a task anyway, the conservative move is queueing a
  clarification, which fires immediately as a current-task change.
  Finalized (Q7, 2026-09-29): the task H1 is the literal `# Task`, exactly
  one per task document, with the display name in frontmatter `title`;
  other H1s, heading-free top-level text, and top-level H2 through H6
  outside the `# Task` section are allowed and advisory. All three binding
  sections are required at activation; `## Constraints` may be empty (an
  explicit None). An unknown H2 under `# Task` is a validation error at
  activation, not advisory. The completion section is named
  `## Acceptance Criteria` (the user's choice over Done-Contract and
  Definition of Done; it converges with the fs-contract's own Phase 3
  acceptance-criteria convention, which this rule now makes a required
  Phase 1 structure).
- **D7 (2026-09-29): Naming.** The durable collection holds **change
  proposals**. The working name change proposal queue, and the word queue
  generally, is rejected: a queue connotes FIFO adoption order that the
  collection does not have. The collection itself needs no special noun;
  it is simply the change proposals. This finalizes the term deferred
  from D3 and D4; those records keep their historical working names.

## Final decision

Settled 2026-09-29 with the user's explicit confirmation of shared
understanding. The material deviation boundary, in the user's terms:

- Execution freedom is work necessary to satisfy the current task's
  binding sections (Description, Acceptance Criteria, Constraints under
  the literal `# Task` H1). All other prose and headings are advisory.
- Everything else that would alter the agreement becomes a change
  proposal: a durable, visible record of a suggested addition,
  modification, or deletion, never executed before approval.
- Renegotiation fires when a proposal bears on current or imminent work
  (goal changes bear on all tasks), at exhaustion (no eligible agreed
  work with proposals pending; plan completion blocked while
  undispositioned), or by initiative (agent tool, user slash command);
  every session addresses all pending proposals; work other than the
  current task is never interrupted (fixup tasks instead).
- The surprise test remains the semantic standard (D1); the structural
  and binding-sections rules are its code-enforced proxies; every
  trigger is labeled code-enforced or agent-judged.

Scenario ledger (the practical examples plan.md demanded):

| # | Scenario | Verdict |
|---|---|---|
| S1 | Task yields a helper file and a test file the plan never mentions | helper: freedom (necessary); test: freedom only if grounded in the binding sections, else change proposal |
| S2 | Unrelated latent bug fixed in passing | change proposal (fixup), never silent execution |
| S3 | README updated for an added endpoint | change proposal unless grounded |
| S4 | Caching layer added because the goal implies performance | change proposal (the goal's spirit grounds nothing) |
| S5 | A `## Constraints` entry deviated from | change proposal modifying the current task; session fires immediately |
| S6 | An advisory suggestion (consider pattern X) not followed | tactical freedom; note in completion summary |
| S7 | Vague task (improve the loader) exploited for a three-subsystem rewrite | fails activation (no Acceptance Criteria); else conservative clarification |
| S8 | Task A (done) discovered wrong during task C | change proposal (fixup); C is not interrupted; session at a standing trigger or by initiative |

Constraints and rationale: anchored in plan.md's target principle and
consistent with the fs-contract's document-level classification
(contract-significant changes are exactly the proposals' modification
and deletion items; execution-state changes remain plugin-mediated
freedom). The user's guideline throughout: enforcement is not draconic
(agents thrive with freedom), with reasonable bounds and forced
renegotiations when plans change.

Rejected alternatives (with failure modes): structural-only test (too
permissive: blind to behavioral drift); explicit-statement-only (too
permissive: unwritten implications never count); customary-practice
implied work (rejected for auditability); four-trigger immediacy
taxonomy (superseded by the single coupling principle); task-boundary
checkpoint (too strict: a session after nearly every task); rework-class
special case (complexity without gain); sentence-level prose binding
(too judgment-heavy; superseded by the binding sections).

Dependent-task implications:

- `grill-replanning-state-machine` receives the settled trigger model
  and durable change proposals as inputs; its ephemerality premise is
  amended in its task doc by this task; it owns the state machine, the
  session mechanics (pause behavior, dispositions, waiting states),
  the plan.md 1.6 timing amendment, and the change-proposal durable
  representation in the fs-contract.
- `grill-okf-compliance` carries the D6 task-body-structure amendment
  into the fs-contract as the designated editor (pinned in its task
doc by this task), coordinating with its status-naming decision.
- The Phase 1 spec (to-spec) receives the response ladder with
  code-enforced and agent-judged labels, the scenario ledger as the
  classification examples, and the activation-validation requirements
  (binding sections present, unknown H2s rejected).

Remaining fog (routed): the durable shape of change proposals
(a proposed-style task status versus a separate representation) goes to
`grill-replanning-state-machine` with the OKF status decision in view;
the steered-behavior taxonomy sharpens in the map's fog once
`grill-enforcement-and-context-strategy` lands; the plan-validation
surface now includes the binding-sections rules.

CONTEXT.md was updated as part of settling: Material change sharpened,
Execution freedom sharpened, Change proposal, Binding sections, and
Renegotiation added, the boundary's Unresolved entry closed.
