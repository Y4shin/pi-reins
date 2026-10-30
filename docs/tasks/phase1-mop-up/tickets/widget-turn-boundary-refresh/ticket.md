---
type: ticket
subtype: feature
title: Widget refresh on turn_end and suspend/restore around compaction
status: stable
workflow_state: ready
size: m
---

## Context

The archived effort's arch spec Widget section promises: "Updated on
turn_end, plugin tool results, and gate transitions; suspended and
restored around compaction." The landed code renders the widget on
tool executions and gate transitions only: the `turn_end` handler
(`src/pi.ts`) calls `drift.sync` without a widget refresh, and the
`session_compact` handler only forwards to the steering engine. The
advisory whole-effort review flagged this as its worst spec finding
and noted it was never recorded in any deviation report.

## Acceptance criteria

1. With a contract bound, `turn_end` re-renders the widget from a
   fresh scan (derived lines recomputed; no state persisted), so
   out-of-band reconciles and time-ordered lines do not go stale
   between tool calls and gate transitions.
2. `session_compact` clears the widget before compaction and restores
   it from a fresh render after, so the compacted window never shows
   a stale or doubled belowEditor surface.
3. A detached session renders nothing at either boundary (the landed
   inertness rule holds).
4. Tests sit at the event-handler seam (`h.fire("turn_end", ...)` and
   `h.fire("session_compact", ...)` over the real registration shell
   with the shared harness), asserting the UI port's set/clear calls.

## Implementation notes

