---
type: deviation report
title: Deviation report for completion-guard
status: stable
---

## Deviation report: completion-guard

### API surface changes
- **Planned:** `reins_complete()` refusing with the remaining-work list
  while any task is pending, in_progress, or blocked (isError, run
  continues); the `agent_settled` backstop with a corrective run seeded
  by `sendUserMessage`, chain capped at `pushbackMax`, counter reset by a
  user-submitted prompt; `state.completionAttempted` set by the tool and
  one-shot-cleared by the steering engine; remaining-work listing from
  `contractStatus`'s `remaining`. Interface contract: the refusal shape
  is the gap-list channel plan-completion (ticket 12) extends; the
  pushback chain counter lives in state.
- **Actual:** As planned, plus:
  - `src/tools/complete.ts` exports `remainingWork(remaining)` (the
    shared one-line renderer used by both the refusal and the pushback
    message) and `planComplete(deps, state, setState)` / `CompleteToolIo`
    with the required `setState` accessor (the renegotiation-session
    precedent for tool IOs).
  - `src/handlers/agent-settled.ts` exports `createSettledBackstop(io)`
    with two legs, `onRunStart` (the before_agent_start reset) and
    `onSettled` (agent_settled); the spec named the handler file but not
    the two-leg shape, which the reset-on-user-prompt rule requires.
  - `ReinsState.pushbackCount?: number` (the spec places the chain
    counter in state; this is its field name, additive).
  - `requireActiveContract` exported from `src/tools/task.ts` (was
    private) so the guard refuses on the same grounds with the right
    tool name; additive.
- **Impact:** On plan-completion (ticket 12): the IO already carries the
  required `setState`; the full completion path replaces the
  clean-state refusal branch (`planComplete`'s final `throw`), and the
  refusal's remaining-work text is the gap-list channel it extends.
  On steering-injection: consumed as built (engine already reads and
  one-shot-clears `completionAttempted`; no change needed). No planned
  API surface broke a dependent.

### Abstraction usage
- Used/was specified: yes. `contractStatus().remaining` from
  `src/tools/task.ts` is the exact pass-down the arch spec names;
  `requireActiveContract` reused after being exported; messenger port
  (`sendUserMessage`) and the steering engine's `completionAttempted`
  flag consumed as specified. No reimplemented alternatives.

### Out-of-scope changes
- The clean-state branch of `reins_complete` refuses with
  "plan-level completion is not yet implemented in this version" rather
  than faking a completion: the full path (deferred walkthrough,
  verifier, completed flip) is plan-completion's, and the ticket covers
  only the guard. Noted as the deliberate pre-passing-guard behavior;
  ticket 12 replaces the branch.
- Pushback-run identification uses an in-memory armed marker consumed at
  the next run boundary instead of prompt-text comparison, honoring the
  no-text-heuristics rule. Documented race: a user prompt submitted
  between the pushback send and the pushback run's `before_agent_start`
  is treated as the pushback run and does not reset the chain counter
  (structural limitation, documented in the module doc).
- Pushback scope follows the spec's decision 2: every settled run under
  an active, incomplete contract is pushed back, including runs that
  settled without attempting completion. Recorded decision, not drift.
- `agent_settled` discovery errors propagate out of the handler (no
  special recovery on an unreadable plan directory).

### Ticket doc update needed?
Yes: append to ## Implementation notes that (1) the clean-state branch of
`reins_complete` refuses until plan-completion lands, (2) the backstop's
pushback-run identification is the armed-marker mechanism (and its
documented race), and (3) the landed exports are `remainingWork` and the
two-leg `createSettledBackstop`.

### User attention needed?
No. Scope and API surfaces match the spec; every delta is additive and
consumed by already-landed or already-specced dependents. Residual risks
are documented limitations (armed-marker race, broad pushback scope per
spec decision 2), not scope changes.
