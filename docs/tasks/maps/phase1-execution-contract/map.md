---
kind: map
slug: phase1-execution-contract
title: Phase 1 decisions for the pi-reins execution contract
status: active
tasks:
  - research-okf-compliance
  - grill-okf-compliance
  - research-pi-enforcement-surface
  - grill-enforcement-and-context-strategy
  - grill-material-deviation-boundary
  - grill-replanning-state-machine
---

## Destination

The Phase 1 MVP of pi-reins, as specified in
[docs/plans/plan.md](../../../plans/plan.md) (both Phase 1 sections)
against the durable format in
[plan-fs-contract.md](../../../plans/plan-fs-contract.md): the
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

## Fog

Questions in scope but not yet sharp enough to become tasks:

- How exactly the agent reaches the activation gate from within a session
  (tool, command, or both) is downstream of the enforcement-strategy
  decision; sharp question once `grill-enforcement-and-context-strategy`
  lands.
- The concrete steered-behavior taxonomy (what the compact steering summary
  contains, and how premature completion, stale state, skipped tasks, and
  scope expansion are each detected and pushed back on) is downstream of the
  enforcement strategy and the deviation boundary; sharp question once both
  grillings land.
- Whether the Phase 1 steering summary and gates need a Phase 1 prototype
  (user reacting to a concrete summary/gate artifact) may surface from the
  enforcement grilling; keep as a candidate, do not create speculatively.
- The concrete plan-validation surface (what "malformed or insufficient"
  means structurally for a plan directory) is downstream of the OKF
  compliance decisions; sharp once `grill-okf-compliance` lands.
- How pi-reins represents parallel-active tasks in the TUI status line /
  user visibility surface is downstream of enforcement strategy.

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
