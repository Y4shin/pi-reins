---
type: ticket
subtype: feature
title: Review dialog surfaces approved but unmaterialized intents
status: stable
workflow_state: ready
size: s
---

## Context

Judgment call 2 from plan-editing-review: review acceptance deletes
every approved intent's proposal document, including intents the model
never materialized, and the review dialog did not surface those. The
owner decided (2026-10-30, recorded in the map): make them visible;
acceptance still consumes the approved set as today.

## Acceptance criteria

1. The review dialog's diff lists approved intents that no
   materialize/edit/remove action applied, marked as approved but not
   applied (distinguishable from the applied changes), before the
   accept/reject/abandon choice.
2. Acceptance behavior is unchanged: unmaterialized approved intents
   are consumed (their proposal documents deleted) exactly as today,
   now with the user's informed eyes.
3. A session where every approved intent was materialized shows no
   extra section.
4. Tests sit at the UI port seam (scripted dialogs over the shared
   harness), covering the listed, unlisted, and all-applied cases.

## Implementation notes

