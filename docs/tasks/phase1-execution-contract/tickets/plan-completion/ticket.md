---
type: ticket
subtype: feature
title: Plan completion with deferred walkthrough and verifier agent
status: stable
workflow_state: ready
blocked_by:
- renegotiation-session
size: l
---

## What to build

Plan-level completion end to end. The completion walkthrough: when
agreed work is done but deferred proposals remain, each is walked
through with the user and must end in a persistent disposition, folded
into a user-designated durable location (written by the agent) or
consciously dropped; the plan cannot complete while any are unresolved.
The completion-verifier agent: a shipped fresh-context agent run
through pi-subagents (a hard dependency added here, failing visibly
when absent) receiving the completion contract and a change digest and
returning fulfilled or a gap list, with gaps returned to the model as
the refusal. On success: the log Completion entry and the plan flipped
to completed.

## Acceptance criteria

- [ ] Completing with unresolved deferred proposals runs the
      walkthrough; each item ends folded or dropped, and the plan
      cannot complete otherwise.
- [ ] The verifier agent runs on completion attempts; a gap list is
      returned to the model as a refusal with the gaps named.
- [ ] A clean, verified completion writes the Completion entry and
      flips the plan to completed.
- [ ] With pi-subagents absent the plugin fails visibly at session
      start rather than silently skipping verification.

## Blocked by

- `renegotiation-session` (deferred proposals and the disposition machinery must exist, and the walkthrough reuses the session's dialog mechanics).
