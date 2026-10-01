---
title: Phase 1 decisions for the pi-reins execution contract
status: stable
type: map
---

## Destination

The Phase 1 MVP of pi-reins, as specified in
[docs/plans/plan.md](../../plans/plan.md) (both Phase 1 sections)
against the durable format in
[plan-fs-contract.md](../../plans/plan-fs-contract.md): the
decisions needed so that `to-spec` can collapse this map into a buildable
Phase 1 spec with nothing left to decide.

Done looks like: every Phase 1 design question that `to-spec` and
`implement-task` would otherwise have to improvise is settled here as a
recorded decision with constraints and consequences:

- the durable plan-directory format is verified against upstream OKF 0.2
  and the compliance decisions are reconciled into
  `docs/plans/plan-fs-contract.md`;
- the material deviation boundary is defined with practical examples, so
  that steering knows what counts as user-involvement-required and what
  remains ordinary implementation freedom;
- the replanning state machine (proposal gate, plan-editing mode, review
  gate) is fully designed, including its trigger conditions;
- the enforcement and context strategy in Pi is chosen from evidence about
  what Pi's extension substrate actually provides, not guesses.

This map produces decisions, not deliverables: no plugin code is written
here. The output is a decision graph that `to-spec` consumes.

## Constraints

- plan.md and plan-fs-contract.md are binding specs. Decisions in this map
  must trace back to them; changes to either document are material changes
  (see AGENTS.md), and the OKF compliance work item reconciles changes into
  the fs-contract as its own pinned requirement.
- pi-reins is not a planner. Nothing in this map may add planning features;
  requests for them belong in `docs/tasks/out-of-scope/`.
- Phase 1 is the MVP and MUST already demonstrate the plugin's defining
  behavior (plan.md, Phase 1 intro), including the two-gate replanning
  protocol as a core feature.
- Wayfinder default: decisions, not deliverables. One deliberate override,
  recorded in the Notes: the OKF compliance grilling task edits the binding
  fs-contract spec as part of settling the compliance decisions.
- No em-dashes in any doc written in this repo.

## Decisions so far

(Recorded from the entry grilling session, 2026-09-15, and kept current as
tasks complete. High-level direction; concrete choices pending their task.)

- **Map scope**: both Phase 1 halves, core contract (§1.1-1.5) and two-gate
  replanning (§1.6-1.8). Replanning is part of the MVP per plan.md.
- **Initial task set and wiring**: the six tasks below, each grilling task
  fed by its research where one exists; the replanning-state-machine
  grilling also waits on the deviation-boundary grilling.
- **Spec-edit placement**: the OKF 0.2 compliance decisions are reconciled
  into `docs/plans/plan-fs-contract.md` inside the `grill-okf-compliance`
  task itself, as an explicit plan-don't-do override.
- **Research source boundary (enforcement surface)**: bundled
  pi-coding-agent documentation plus local extensions (task-workflow,
  pi-subagents, pi-telemetry, browser-goblin) as prior art.
- **Materiality test (grill-material-deviation-boundary, 2026-09-29):** the
  surprise test is the semantic standard; the structural contract-significant
  test is its code-enforced proxy; ambiguity resolves toward proposing; every
  Phase 1 spec trigger is labeled code-enforced or agent-judged.
- **Implied-work line, change proposals, and binding sections
  (grill-material-deviation-boundary, 2026-09-29):** only work necessary
  to satisfy an agreed task's binding sections is execution freedom;
  customary artifacts (tests, doc updates) must be grounded in them.
  Material deviations become durable, visible change proposals, never
  executed before approval. Renegotiation fires when a proposal bears on
  current or imminent work (goal changes bear on all tasks), at
  exhaustion (no eligible agreed work with proposals pending; plan
  completion blocked while undispositioned), or by initiative (agent
  tool, user slash command); every session addresses all pending
  proposals; a proposal about other work never interrupts the current
  task (fixup tasks instead). This amends plan.md 1.6's
  immediate-proposal timing; the mechanics feed
  grill-replanning-state-machine. Task documents carry exactly three
  binding H2 sections (Description, Acceptance Criteria, Constraints)
  under a literal `# Task` H1; all other prose and headings outside it
  are advisory; all three required at activation, Constraints may be
  empty; unknown H2s under `# Task` fail activation; this amends the
  fs-contract task body structure and converges with its Phase 3
  convention.
- **OKF 0.2 compliance decisions (grill-okf-compliance, 2026-09-29):**
  the execution-status key is renamed to `executionStatus` and the OKF
  `status` key reverts to its lifecycle meaning; `verified` events
  (git-email human ids) append at activation and each review-gate
  acceptance; `generated` is plugin-maintained as a content-freshness
  record, explicitly not a Phase 7 timing fact; log.md gains the
  Activation entry and a closed bold-word vocabulary; the required root
  index/log and pinned okf_version strictness is kept; the Pending
  Phase 1 Work section is replaced by an OKF 0.2 profile note;
  `stale_after` is not adopted; the §11 hard rules become attach-time
  validation checks. All edits are applied to plan-fs-contract.md,
  including the pinned task-body-structure amendment (three binding H2
  sections under `# Task`).
- **Enforcement and context strategy (grill-enforcement-and-context-strategy,
  2026-09-29):** the seven-surface mechanism set adopted per the task's
  briefing with amendments: single injection point (context tail,
  conditional on active execution, every 4th LLM call plus forced
  triggers; no system-prompt layer); two-level completion guard plus a
  fresh-context verifier agent at plan completion; pi-subagents is a
  hard dependency; `reins_progress` writes durable `progressLog` entries
  on the active task; `expectedPathRegexes` and `expectedBashRegexes`
  drive immediate steering nudges (advisory, never permission); the
  belowEditor widget is the single status surface. Three optional task
  fields amended into the fs-contract under this task's override note.
  Policy residuals: pre-stop impossibility accepted (upstream request
  optional), `onTerminalInput` skipped, concurrent sessions documented
  as a known limitation, fail-closed confirmed. The injection spike
  became the task `prototype-steering-injection`.
- **Replanning state machine (grill-replanning-state-machine,
  2026-09-29):** five states (executing with pending proposals as the
  normal state; renegotiating; plan-editing; reviewing; abandon path);
  uniform Change Proposal documents in `proposals/` (type: Change
  Proposal; additions carry draft task content in the body;
  materialization at plan-editing; gate 2 polices drift);
  dispositions approve/defer/reject with deferral suppressing triggers
  but not membership; a completion walkthrough folds or drops deferred
  items into user-designated durable locations before the plan
  completes. plan.md 1.6 rewritten to the recorded model and 1.7's
  entry condition updated; the fs-contract gains the Change Proposal
  section under this task's pinned representation override.

## Fog

All former fog items resolved as of 2026-09-29:

- Activation-gate reach: settled by the enforcement grilling (user
  command plus confirm dialog; proposal and review as model-invoked
  gate tools).
- Steered-behavior taxonomy: settled by the enforcement grilling and the
  deviation boundary; summary content and cadence tuning moved to
  `prototype-steering-injection`.
- Phase 1 prototype: became the task `prototype-steering-injection`.
- Plan-validation surface: the §11 hard rules, the OKF profile rules,
  and the binding-sections checks are recorded for `to-spec` by the OKF
  grilling and this map's tasks.
- Parallel-active tasks in the status surface: the widget mechanism is
  settled (E6 of the enforcement grilling); layout is a `to-spec`
  detail.

New fog: none.

## Out of scope

- Phase 2-7 features: dependencies/phases, completion semantics, change
  detection, semantic drift steering, interoperability tooling, budgets.
  Each later phase gets its own map at its time.
- Planning or requirements-discovery features of any kind (plan.md
  explicit non-goals).
- External planner integration specifics (which planner, which handoff):
  the format defines the interchange boundary; concrete provenance
  conventions belong to the higher-level planning skills/workflows.
- Subagent orchestration, auditing agents, autonomous continuation (plan.md
  non-goals).
- Publishing, packaging, CI, or release decisions for the plugin.

## Notes

- **Plan-don't-do override:** the `grill-okf-compliance` task edits the
  binding spec `docs/plans/plan-fs-contract.md` as part of settling the
  OKF 0.2 compliance decisions. Justified by the fs-contract's own pinned
  note: the reconciliation must land in the spec, and keeping one task per
  decision keeps the audit trail simple.
- The fs-contract's Pending Phase 1 Work section pins this exact work: a
  research task followed by a grilling task to verify and reconcile full
  OKF 0.2 compliance of the execution-plan filesystem format against the
  upstream specification.
- plan.md's Deliberate Grilling Surfaces name the deviation boundary, the
  replanning state machine, and enforcement/context strategy as the areas
  that materially affect whether the plugin fulfills its mission; this map
  operationalizes them.
