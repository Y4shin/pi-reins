---
kind: task
type: grilling
slug: grill-enforcement-and-context-strategy
title: Choose the Phase 1 enforcement and context strategy in Pi
map: phase1-execution-contract
status: ready
blocked_by:
  - research-pi-enforcement-surface
---

## Decision to settle

Which Pi mechanism set the Phase 1 plugin builds on for each surface:
steering-summary injection, premature-completion pushback, state
synchronization, gate-active execution blocking, unexpected-change
reaction, approval/review interaction, and user-visible status. The
strategy must deliver plan.md's stated goal: **reliable steering with
minimal context pollution**, avoiding the trap of solving weak enforcement
by dumping ever-larger instructions into every turn.

This is plan.md's grilling surface 3. The decision includes:

1. **Context injection**: which mechanism injects the compact steering
   summary, at what cadence, and with what content contract.
2. **Premature completion**: how the plugin reacts when the agent declares
   the goal complete against execution state.
3. **State synchronization**: how task-status transitions become durable
   and stay authoritative without redundant per-turn chatter.
4. **Gate blocking**: how plan-editing mode prevents implementation work
   before the review gate passes.
5. **Change reaction**: how out-of-band plan edits during execution are
   detected and responded to.
6. **Approval and review interaction**: which `ctx.ui` or command surface
   presents the activation, proposal, and review gates.
7. **Status surface**: how current goal, progress, active work, blocked
   work, and paused/waiting state reach the user at low friction.

## Parent decisions it depends on

- `research-pi-enforcement-surface`: the evidenced mechanism map. No
  mechanism may be chosen that the research did not evidence.
- (Informative) `grill-material-deviation-boundary` may sharpen what the
  steering summary pushes back on, but this task does not block on it.

## Choices already known

- The durable state model is fixed by the fs-contract: `plan.md`
  frontmatter + body, task documents, execution state in frontmatter,
  derived state never persisted.
- Phase 1 is the MVP and must already demonstrate the defining behavior;
  the strategy cannot defer enforcement to later phases.

## Recommended starting answer

Follow the research shortlist per surface, preferring mechanisms the local
prior art already exercises in production (task-workflow's durable-state
and command patterns, browser-goblin's ctx.ui usage) over purely
documented-but-unproven ones. Prefer the smallest context footprint that
the evidence says is reliable: per-turn injection of a bounded summary plus
event-driven pushback, rather than whole-plan re-injection. Where the
research flagged unresolved capability questions, grill those first as
hard constraints before choosing.

## What downstream work the answer may create

`to-spec` collapses this decision into the Phase 1 spec's architecture
section: the extension's event subscriptions, tools, commands, and UI
surface. If settling the strategy surfaces the need for the user to react
to a concrete steering-summary or gate artifact first, that becomes a
prototype task via Wayfinder (the map's Fog holds this candidate).

## Notes

- Execution follows `implement-task/resources/grilling.md`: one focused
  question at a time, concrete recommended answer with each, decisions
  recorded in the user's terms, never answering for the user.
