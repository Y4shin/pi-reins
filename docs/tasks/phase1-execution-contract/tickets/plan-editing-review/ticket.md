---
type: ticket
subtype: feature
title: Plan-editing enforcement, review gate, abandon, and crash recovery
status: stable
workflow_state: ready
blocked_by:
- renegotiation-session
size: xl
---

## What to build

The second half of the renegotiation machine. Plan-editing: the active
tool set swaps edit and write out and writes outside the plan directory
are blocked, while the agent materializes approved intents
(materializing additions from their drafts, applying modifications,
deleting removals). Review gate: a blocking dialog presenting the
concrete revision as the difference between the pre-session snapshot
and the post-edit state; acceptance bumps the revision, writes the log
Update entry together with the verified event, and deletes applied
proposal documents; rejection returns to plan-editing. Abandon returns
to executing with the old contract intact and proposals left pending.
Crash recovery: session-start reconciliation resumes in executing,
honors a durable review acceptance (log entry plus bumped revision),
and leaves pending proposals pending.

## Acceptance criteria

- [ ] During plan-editing, writes outside the plan directory are
      blocked and edit and write tools are absent from the schema.
- [ ] Materialization creates, edits, and deletes task documents
      exactly per the approved intents.
- [ ] The review dialog presents the concrete diff; rejection returns
      to plan-editing; abandon returns to executing with the old
      contract and pending proposals intact.
- [ ] Acceptance bumps the revision, writes the log Update entry with
      the verified event, and deletes the applied proposals.
- [ ] After a restart with leftover gate records the plugin resumes in
      executing; a durable review acceptance is honored; pending
      proposals survive.

## Blocked by

- `renegotiation-session` (plan-editing and review are the continuation of an approved session).
