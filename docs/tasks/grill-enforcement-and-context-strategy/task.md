---
kind: task
type: grilling
slug: grill-enforcement-and-context-strategy
title: Choose the Phase 1 enforcement and context strategy in Pi
map: phase1-execution-contract
status: in_progress
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
- **Plan-don't-do override (2026-09-29):** this task applies three
  optional task fields to the binding fs-contract as part of settling the
  enforcement strategy: `expectedPathRegexes`, `expectedBashRegexes`, and
  `progressLog`. Same pattern as the grill-okf-compliance override; the
  fields are fully specified by this task's decisions and splitting them
  into a separate task would spread a small change across two tasks.

## Decisions so far

- **E1 (2026-09-29): The seven-surface mechanism set, as amended.**
  Adopted per the briefing (briefing.md in this directory) with the
  user's amendments in E2 through E8: write-path tools with `tool_call`
  blocking and drift verification; directional gate blocking plus
  tool-set swapping plus terminate; fingerprint floor plus best-effort
  watcher; activation by user command plus confirm dialog, proposal and
  review as model-invoked gate tools with blocking dialogs; completion
  via validated tools plus `agent_settled` pushback. The standing-rules
  system-prompt layer is dropped (user: there are no static rules worth
  injecting); the invariant lines are the fixed header of the steering
  summary, which keeps the system prompt untouched.
- **E2 (2026-09-29): Conditional, periodic injection.** The context
  handler does literally nothing when no execution contract is active.
  During active execution the summary injects on every Nth LLM call
  (default 4, configurable), plus forced injection at the first call of
  each run, after compaction, at gate transitions, at completion
  attempts, and on the expected-declaration triggers (E7). Rationale:
  token frugality, and avoiding constant off-distribution nudging that
  can throw the model off and reduce performance.
- **E3 (2026-09-29): Two-level premature-completion guard.** Task level:
  `reins_task_complete` refuses illegal transitions and requires a
  non-empty `completionSummary`. Plan level: `reins_complete` refuses
  while any task is pending, in_progress, or blocked, kept simple
  because the status surface already gives the user visibility.
- **E4 (2026-09-29): Semantic completion verification via a
  pi-subagents agent; pi-subagents is a hard dependency.** pi-reins
  ships a fresh-context verifier agent (no inherited parent context)
  that receives the completion contract plus a change digest and returns
  fulfilled or a gap list; gaps return to the model as the tool error in
  the same run. It runs at plan-level completion; task-level stays
  structural in Phase 1. pi-subagents is a hard dependency of pi-reins
  (the user's call: the plugin cannot really work without it), installed
  automatically if the package manifest supports it, else by the user,
  with a visible session-start failure if absent. The plan.md
  orthogonality tension is acknowledged: pi-reins consumes but does not
  own subagent machinery.
- **E5 (2026-09-29): `reins_progress` records durable progress updates
  in the active task's frontmatter.** New optional task field
  `progressLog`, an append-only list of `{ at, note }` entries; the
  widget shows the most recent entry as the Now line and the full
  history is retained for audit; the steering summary nudges the agent
  to record progress at meaningful steps. Progress entries are ordinary
  execution-state changes: never user involvement, never in log.md.
  Named `progressLog` rather than `progress` to avoid colliding with the
  glossary's derived Execution progress concept.
- **E6 (2026-09-29): The widget is the single status surface.**
  `setStatus` is dropped; the always-visible belowEditor widget carries
  goal, active work, the Now line, counts, blocked, and gate state.
- **E7 (2026-09-29): Expected-declaration triggers.** New optional task
  fields `expectedPathRegexes` and `expectedBashRegexes` (regexes over
  write targets and shell command lines). Advisory, never permission:
  the reaction to an out-of-declaration write or an unmatched command is
  an immediate steering nudge with a targeted note, overriding the
  cadence, never a block (binding boundaries remain the Constraints
  sections). Command-level allowlisting beyond the regex match is
  deferred; tuning under-declared lists is normal plan maintenance.
- **E8 (2026-09-29): fs-contract amendment applied.** The three optional
  task fields are written into plan-fs-contract.md (field sections,
  extension-key lists, contract-significant and execution-state
  classifications, durable-state list) under this task's override note.
