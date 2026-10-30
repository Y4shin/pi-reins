---
type: ticket
subtype: feature
title: Consolidate duplicated helpers and divergent predicates
status: stable
workflow_state: ready
size: m
---

## Context

P2 findings from the archived effort's advisory review; pure cleanup,
no behavior change.

## Acceptance criteria

1. One shared home exports the whitespace-collapse `oneLine` helper
   and the id/title extraction helpers, consumed by
   `src/tools/complete.ts`, `src/ui/widget.ts`,
   `src/handlers/review.ts` (`idOf`/`titleOf`), and
   `src/handlers/tool-call.ts` (`taskIdOf`); the local copies are
   gone.
2. One shared plan-directory containment predicate serves both the
   tool_call guard (`tool-call.ts` `resolvesInside`) and the
   completion walkthrough (`complete.ts` `isInsidePlanDir`); the two
   divergent algorithms are gone. Pick the semantics that satisfies
   both call sites (guard blocks plan-dir writes; walkthrough refuses
   fold targets inside the plan dir) and document the choice; both
   call sites stay test-pinned.
3. `src/plan/write.ts` parses frontmatter and checks the mapping once,
   in a helper both `writeFields` and `appendVerifiedEvent` use; the
   verbatim duplicate block is gone.
4. `ReviewEntry.phase` in `src/handlers/review.ts` (a field named
   `phase` holding a whole `ReinsState`, never read) is deleted or
   renamed to `state`.
5. Refactor only: no test assertions change (test files move or
   re-import with their helpers at most), typecheck clean, full suite
   green at the end state.

## Implementation notes

