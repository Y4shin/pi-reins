---
type: ticket
subtype: feature
title: Expected-declaration steering nudges
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
- steering-injection
size: s
---

## What to build

The advisory expected-declaration triggers: observing write targets
against the task's declared path regexes and shell commands against its
declared command regexes, and on an out-of-declaration write or an
unmatched command, triggering an immediate steering summary injection
with a targeted note naming the deviation, overriding the cadence.
Advisory only: the write proceeds; the declared lists never block, and
tasks without the fields get no triggering.

## Acceptance criteria

- [ ] A write outside every declared path regex triggers immediate
      injection with a targeted note, regardless of cadence.
- [ ] A command matching none of the declared command regexes triggers
      likewise.
- [ ] Declared matches, and tasks without the fields, trigger nothing.
- [ ] The nudge never blocks the write.

## Blocked by

- `task-lifecycle` (the observation hook rides the tool enforcement surface).
- `steering-injection` (the nudge is an immediate override of the injection cadence).
