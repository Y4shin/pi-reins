---
type: ticket
subtype: feature
title: Renegotiation triggers and the batched proposal session
status: stable
workflow_state: ready
blocked_by:
- steering-injection
- change-proposals
size: l
---

## What to build

The renegotiation trigger set and the gate-1 session. Triggers: a
proposal bearing on the task currently being worked on or on the goal;
work about to start entangled with a pending proposal; exhaustion of
eligible agreed work with the set non-empty; deliberate opening by the
agent (tool) or the user (slash command). The session terminates the
current run at the gate (the current task stays in_progress) and
presents every pending proposal, including deferred ones and draft task
content for additions, with approve, defer, or reject per proposal
through blocking dialogs that fail closed without UI. Dispositions are
maintained durably at the state transitions: deferred markers set,
rejected proposals deleted. Gate state appears on the widget.

## Acceptance criteria

- [ ] Each trigger opens a session over the entire pending set;
      deferred items appear in the sweep but never trigger a session on
      their own.
- [ ] The dialogs present each proposal with rationale and, for
      additions, draft content; answers record approve, defer, or
      reject.
- [ ] Approved intents transition toward plan-editing; deferred
      proposals carry the deferred marker; rejected proposals are
      deleted when the renegotiating state ends.
- [ ] The current run terminates at the gate and the current task stays
      in_progress.
- [ ] Gate state appears on the widget; without UI the session blocks
      fail-closed.
- [ ] Both the agent tool and the user slash command open sessions.

## Blocked by

- `change-proposals` (the session presents the recorded pending set).
- `steering-injection` (gate transitions are forced-injection triggers and the widget gate state rides the status surface).
