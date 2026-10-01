---
title: Permission gates, Karen mode (post-v1 feature idea)
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

When executing a plan or a task, the tools the agent has access to
should be restricted per mode:

- Plan execution mode: the agent gets only the tools necessary for
  reading files and managing plan execution state (starting a task,
  querying change requests, triggering a renegotiation session, and so
  on).
- Task execution mode: it drops the tools not needed during editing
  tasks and gains those for managing task execution state, plus
  whatever tools are allowed according to some (to be added or edited)
  task frontmatter: a per-task tool allowlist, to be designed.

Nickname: Karen mode, where we are really restricting the agent to
only doing what we expected it to do.

Softness rule: the agent should still be able to call tools that are
not explicitly allowed; it just asks the user first, similar to how
most agents do permission prompting. (The exact tier semantics:
allowlisted means auto-allow, unlisted means ask, and whether an
explicitly forbidden tier exists at all, are grilling material.)

## Relations to settled decisions (context, not decisions)

- Enforcement E1 already swaps tool sets for plan-editing mode
  (`setActiveTools`); Karen mode generalizes that swap into per-mode
  and per-task tool profiles.
- Enforcement E7's `expectedPathRegexes` / `expectedBashRegexes` are
  advisory nudges; Karen mode is the hard-permission counterpart, and
  the grilling must reconcile advisory (nudge) against enforced
  (allow/ask/deny).
- Enforcement E10's fail-closed policy (no UI means block) is the
  natural degradation for permission prompts in print and JSON modes.
- plan.md 1.7's executing-versus-editing distinction is the mode
  skeleton this generalizes.
- Tension to resolve in grilling: plan.md's non-goal of becoming a
  system that approves every implementation-level action, against
  Karen mode's ask-the-user default for unlisted tools.

## Fog for the entry grilling

- What exactly is allow, ask, or deny per mode, and who authors a
  task's tool allowlist: the external planner at plan-authoring time,
  the plugin as defaults, or both?
- How do ask-prompts interact with renegotiation sessions and with the
  fail-closed policy when no UI exists?
- Does Karen mode replace or subsume the E1 tool swaps and the E7
  advisory nudges?
- Context cost: tool-set swapping can invalidate the provider's cached
  prefix (research finding); how often would modes change in practice,
  and what does that cost?
