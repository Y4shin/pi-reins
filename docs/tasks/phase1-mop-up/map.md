---
title: "Phase 1 mop-up: spec-owed widget boundary behavior and review cleanups"
status: stable
type: map
---

## Destination

Close the remaining-gaps list recorded on the archived
`phase1-execution-contract` map (see
`docs/tasks/archive/phase1-execution-contract/map.md`, Notes) plus the
advisory whole-effort review's P2 findings. Done looks like: every gap
either implemented and landed, or consciously deferred into the
`final-cleanup` map's stragglers list with a rationale.

This effort is small and behavior-conservative: one ticket adds
spec-owed behavior, the rest are cleanups and small surface correctives.

## Constraints

- plan.md and plan-fs-contract.md are binding; the widget ticket
  implements behavior the archived arch spec already promises, not new
  scope.
- Refactor tickets change no behavior: the suite stays green with the
  same assertions, imports and moves aside.
- No em-dashes in any doc written in this repo.
- Derived state is never persisted.

## Decisions so far

- **pluginContractWrites (owner, 2026-10-30):** wire the
  plan-editing tools' contract-significant writes into the drift
  channel if a real writer makes sense against the landed state
  machine (detection reacts only while executing, and no executing-phase
  plugin tool writes contract-significant content today); if it does
  not, leave the channel inert and record it as a straggler in the
  `final-cleanup` map with the rationale. No removal without a later
  dedicated decision.
- **Review dialog (owner, 2026-10-30):** surface approved intents the
  model never materialized as "approved, not applied" in the review
  diff before acceptance; acceptance still consumes the approved set
  as today (the plan-editing-review judgment call, now made visible).
- **Source of the gap list:** the end-of-effort advisory review
  (two-axis) and the deviation reports of the archived effort; the
  reviewing-state guard inversion and the fs-contract verified-event
  ruling are settled there, not relitigated here.

## Fog

- Whether a real writer exists for `pluginContractWrites` today: the
  assessment is the `plugin-contract-writes-wiring` ticket's first
  step, answered in the effort, not before.

## Out of scope

- Phase 2+ features (dependencies, phases, completion semantics beyond
  the landed Phase 1 behavior).
- The post-v1 draft maps (`agent-dashboard`, `karen-mode`,
  `subagent-plan-integration`).
- Any removal of `pluginContractWrites` (deferred to `final-cleanup`).

## Notes

- The effort starts with four ready feature tickets, no dependency
  edges: none of them shares a file with another in a way conflicts
  would turn on; sequential frontier order is fine in any order.
