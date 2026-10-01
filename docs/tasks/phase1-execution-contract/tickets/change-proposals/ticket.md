---
type: ticket
subtype: feature
title: Change proposal recording and visibility
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
size: m
---

## What to build

The proposal-recording tool writing uniform change-proposal documents
under proposals/ per the contract: kind add, modify, or remove; target
required for modify and remove; rationale in the body; draft task
content (binding sections, proposed id and title) for additions;
optional dependency hints in both directions. Proposal validation is
part of attach-time validation, the widget counts pending proposals,
and proposals are never execution-eligible.

## Acceptance criteria

- [ ] Recording an addition writes a proposal document with draft
      binding sections; modify and remove require a resolvable target
      task id.
- [ ] Malformed proposals (unknown kind, unresolvable target) are
      refused at recording time.
- [ ] Attach-time validation accepts well-formed proposals/ content.
- [ ] The widget counts pending proposals; proposals never become
      execution-eligible.

## Blocked by

- `task-lifecycle` (proposals are recorded during execution against active tasks, and the write-path surface exists).
