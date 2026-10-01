---
title: TUI dashboard for cross-agent plan execution state (post-v1 feature idea)
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

Some way to open a TUI-based dashboard that shows the states of all
agents that are currently in plan or task execution mode, so the owner
can see progress of multiple agents across the system and know where
their attention may be needed.

## Relations to settled decisions (context, not decisions)

- Enforcement E6's belowEditor widget is the single-session status
  surface; a dashboard is the multi-session and multi-agent superset.
- Enforcement E10 skipped `ctx.ui.onTerminalInput` (an undocumented
  API) for v1; an interactive dashboard is exactly the use case that
  might justify revisiting that policy, or the grilling should seek an
  alternative mechanism.
- Waiting states (`ui_prompt_start` / `ui_prompt_end`), open gates,
  and unanswered permission asks (Karen mode) are the natural
  attention-needed signals.
- The hard kernel: enforcement E10's known limitation that concurrent
  pi sessions on one plan directory are uncoordinated. A cross-session
  dashboard needs a discovery and state-sharing mechanism that the
  current surface does not provide; designing that mechanism is the
  core grilling question.
- pi-subagents' fleet view (setWidget plus onTerminalInput) is
  in-ecosystem prior art for a single-session agent dashboard.

## Fog for the entry grilling

- Scope: multiple agents within one pi session (the subagent tree),
  multiple pi sessions on one machine, or across machines?
- What mechanism carries state across sessions: files, a status
  directory, something else? `appendEntry` covers one session only.
- Interactive (onTerminalInput) versus read-only render, and whether
  the undocumented-API policy from E10 gets revisited here.
- What does attention needed mean formally: open gates, unanswered
  permission asks, blocked tasks, stalled progress?
- Relationship to pi-subagents' fleet view: extend it, compose with
  it, or build in parallel?
