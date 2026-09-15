---
kind: task
type: research
slug: research-pi-enforcement-surface
title: Map Pi's actual enforcement and interaction capabilities
map: phase1-execution-contract
status: ready
blocked_by: []
---

## The precise question

Which concrete Pi extension mechanisms can support each Phase 1 enforcement
and interaction requirement, with what reliability and cost, as evidenced by
the bundled pi-coding-agent documentation and by the working extensions
already installed on this machine?

For each of these Phase 1 requirements, name the mechanism(s), how they are
invoked, what they can and cannot do, and how established they are
(documented API vs undocumented behavior vs prior-art-only):

1. **Injecting compact execution context** (the steering summary) into the
   model's context per turn.
2. **Reacting when the agent tries to conclude prematurely**, e.g. when it
   declares the goal done while tasks remain.
3. **Keeping task state synchronized**: how a plugin observes and enforces
   durable state transitions without flooding context.
4. **Detecting execution while a gate is active** and pausing/blocking
   work, for the plan-editing mode.
5. **Reacting to unexpected plan changes** (out-of-band edits to the plan
   directory during execution).
6. **Presenting approval and review interactions** to the user: the
   activation gate, the proposal gate, the review gate.
7. **Surfacing execution state to the user**: current goal, progress,
   active work, blocked work, paused/waiting state, in a low-friction,
   always-visible way.

plan.md's grilling surface 3 asks exactly this with the goal: **reliable
steering with minimal context pollution**.

## The decision it unblocks

`grill-enforcement-and-context-strategy`: which mechanism set the Phase 1
architecture builds on. Without this evidence the strategy grilling would
be guessing at Pi's capabilities.

## Trusted source boundaries

- **Primary:** the bundled pi-coding-agent documentation at
  `/nix/store/lvys4szjr1mqpqnrbkqhl7qkcl23mswc-pi-coding-agent-0.84.4/lib/node_modules/pi-monorepo/docs/`
  (extensions.md, sdk.md, tui.md, session-format.md, skills.md, and
  related pages), plus the working examples under its `examples/extensions/`.
- **Prior art, informative:** locally installed extensions, readable as
  source: the task-workflow package (durable state, commands, tools), the
  pi-subagents extension, the pi-telemetry extension, and browser-goblin
  (custom UI, session persistence, permission-gate patterns). These show
  what actually holds up in practice, which the docs alone do not.
- **Binding context:** `docs/plans/plan.md` (Phase 1 requirements, grilling
  surface 3) and `docs/plans/plan-fs-contract.md` (what durable state
  exists). They define the requirements, not the mechanism.

## Evidence required for completion

A research artifact under `docs/tasks/research-pi-enforcement-surface/`
containing, requirement by requirement (1-7):

- the mechanism(s) Pi offers, with doc citations (file and section) or
  exact prior-art file paths;
- for each mechanism: what it guarantees, what it cannot do (e.g. can a
  context injection be suppressed? can a tool call be blocked
  mid-flight?), event ordering and timing semantics, and context-size or
  repetition cost;
- a shortlist per requirement with a clear recommendation and rationale;
- where two mechanisms overlap, which one the prior art favors and why;
- unresolved capability questions that only a spike or the user can
  answer, stated precisely.

Do not modify application code for this task.

## Likely dependent tasks

`grill-enforcement-and-context-strategy` consumes this. If the research
exposes the need for a Phase 1 prototype (user reacting to a concrete
steering-summary or gate artifact before the strategy is settled), that
becomes a new Wayfinder planning task, per the map's Fog.

## Notes

- Where the docs and prior art disagree about what works, record both and
  flag the disagreement; the strategy grilling decides with that knowledge.
- Mark the task `blocked` with an explanation if a listed requirement has
  no evidenced mechanism at all, so the strategy grilling can treat it as
  a hard constraint.
