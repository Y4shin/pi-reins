---
type: ticket
subtype: feature
title: Out-of-band plan change detection and reconciliation
status: stable
workflow_state: ready
blocked_by: [task-lifecycle]
---

## What to build

Detection of plan-directory changes that did not come through the
plugin: turn-boundary fingerprinting of contract-significant content
(ephemeral, in-memory, tolerant of partially written files), a
session-start-scoped file watcher with a polling fallback as
best-effort live notification, turn-end drift verification against
observed transitions, and the reaction: notify the user, steer the
model, and hold mutations in a reconciliation gate rather than
silently continuing.

## Acceptance criteria

- [ ] A hand edit to contract-significant content between runs is
      detected at the next boundary.
- [ ] The watcher notices edits while idle, and the polling fallback
      engages when the watcher errors.
- [ ] On detection the user is notified, the model receives a steering
      message, and mutations are held until reconciled.
- [ ] The fingerprint tolerates partially written files.

## Blocked by

- `task-lifecycle` (detection compares against the plugin's own writes during execution).
