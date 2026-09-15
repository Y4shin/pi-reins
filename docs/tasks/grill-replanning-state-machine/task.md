---
kind: task
type: grilling
slug: grill-replanning-state-machine
title: Design the two-gate replanning state machine
map: phase1-execution-contract
status: ready
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

- `grill-material-deviation-boundary`: the boundary defines the protocol's
  trigger conditions. The state machine cannot be designed without
  knowing what counts as material; that is why this task blocks on it.
- (Informative) `grill-enforcement-and-context-strategy` will have chosen
  the mechanism class for gate interactions and execution blocking; this
  task designs the protocol on top of whatever surfaces exist.

## Choices already known

- The protocol shape is fixed by plan.md: proposal gate (approve intent,
  not concrete edits), plan-editing mode (execution paused, agent modifies
  the plan, no implementation work), review gate (concrete changes
  become authoritative on acceptance, execution resumes; rejection keeps
  execution paused and revising continues).
- The fs-contract fixes the durable side: the negotiation is ephemeral,
  proposal approval state and pending-plan-diff state stay in memory, and
  the durable representation of an accepted change is the revised plan
  plus a `log.md` entry at revision acceptance.
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
