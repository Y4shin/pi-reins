---
title: Tighter pi-subagents integration for plan execution (post-v1 feature idea)
status: draft
type: map
---

## What this map is

A captured post-v1 feature idea, recorded from the owner's braindump.
This map is NOT charted: the initial grilling is outstanding, no tasks
exist, and the frontier is empty by design. When its time comes, run
the entry grilling (wayfinder) on this capture to sharpen it into a
real map with decision tasks.

Not part of the Phase 1 map or the v1 spec. plan.md (binding) does not
contain this feature; adopting it later is a material plan.md change
to be made during this map's grilling.

## The idea (owner's braindump, 2026-09-29)

Tighter integration with the pi-subagents plugin (already a hard
dependency of pi-reins):

- (a) Subagents should be able to communicate regarding task and plan
  state with their parents.
- (b) If a plan has multiple tasks that could be run in parallel, that
  should be supported: run them via subagents, with some way to
  escalate tool-permission requests back up to the parent. This
  presupposes the Karen mode feature (permission gates).
- (c) Karen mode should cascade through the entire subagent tree.

## Relations to settled decisions (context, not decisions)

- Enforcement E4 made pi-subagents a hard dependency and shipped the
  completion-verifier package agent, establishing the precedent of
  pi-reins shipping agents that pi-subagents picks up.
- The fs-contract already permits multiple concurrently in_progress
  tasks, and plan.md's orthogonality principle requires that parallel
  execution through such systems stays representable by the execution
  contract.
- Enforcement E10's known limitation: concurrent pi SESSIONS on one
  plan directory are uncoordinated (no locking mechanism anywhere).
  Parallel tasks via subagents inside ONE session sidestep that
  limitation rather than solving it; the grilling should decide
  whether that sidestep is the intended scope.
- pi-subagents' fleet view is prior art for agent-tree state
  visibility, and the natural building block for the agent-dashboard
  idea.

## Fog for the entry grilling

- What does communicate task and plan state mean concretely: subagents
  calling the plugin tools directly (same plan directory, same
  session), or message-passing to the parent?
- How does a subagent's tool-permission request escalate to the
  parent, and from there to the human?
- Does Karen-mode cascade mean the child's allowlist is bounded by the
  parent's, or that each child receives a subset profile?
- How do renegotiation triggers behave under parallel execution:
  current-task coupling is ambiguous when two tasks are in_progress.
- Does the completion verifier run per subagent leaf, per branch, or
  once per plan?
