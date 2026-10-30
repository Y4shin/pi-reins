---
type: ticket
subtype: feature
title: Wire pluginContractWrites or defer it to final-cleanup
status: stable
workflow_state: ready
size: s
---

## Context

`ReinsState.pluginContractWrites` (landed with out-of-band-detection)
is the drift-verification channel for the plugin's own
contract-significant writes. It is tested but has no production
writer: detection reacts only while executing, and no executing-phase
plugin tool writes contract-significant content. Owner decision
(2026-10-30, map): wire it if a real writer makes sense; otherwise
assume it exists for a later effort and record it as a straggler.

## Acceptance criteria

1. Assessment first: enumerate today's plugin writers against the
   fingerprint's contract-significant set. If any path exists where a
   plugin tool's write could surface as drift during executing, wire
   the channel: the writer records into
   `state.pluginContractWrites` and the drift verification absorbs it
   (test-covered at the turn boundary seam), and the ticket's
   Implementation notes name the wired writers.
2. If no such path exists, leave the channel inert (no removal) and
   append it to `docs/tasks/final-cleanup/map.md`'s stragglers list
   with the rationale (executing-only reaction window plus
   re-arm-on-re-entry make it vacuous today) and the re-check trigger
   (any future plugin writer of contract-significant content during
   executing).
3. Either way the suite stays green and the ticket records which arm
   was taken.

## Implementation notes

