---
kind: task
type: grilling
slug: grill-material-deviation-boundary
title: Define the material deviation boundary with practical examples
map: phase1-execution-contract
status: ready
blocked_by: []
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
