---
type: deviation report
title: Deviation report for plan-editing-review
status: stable
---

## Deviation report: plan-editing-review

### API surface changes
- **Planned:** the arch spec's ticket-11 contract: plan-editing tools
  gated on `RenegotiationOutcome.approved` (`reins_materialize_add`,
  `reins_edit_task`, `reins_remove_task`, `reins_finish_revision` with
  a required `setState` accessor on its IO); the review dialog diffing
  the session's `RenegotiationOutcome.snapshot` against the current
  state with accept/reject/abandon; acceptance bumping the revision
  and writing the log Update entry together with the verified event by
  the same writer, deleting applied proposal documents through
  `FsPort.delete`, restoring the tool set; the tool_call guard
  inverted to block writes outside the plan directory during
  plan-editing while raw writes into it stay blocked in every state;
  session_start crash recovery from leftover `reins-gate-open` /
  `reins-gate-closed` entries, honoring a durable review acceptance,
  on-disk content authoritative. Interface contract forward: the
  acceptance write utilities (log entry plus status flip plus verified
  event) reused for plan-completion's Completion entry.
- **Actual:** As planned. The forward contract is intact and consumed
  from the landed surface: `finishRevisionReview` (src/handlers/review.ts)
  writes the acceptance records via `prependLogEntry`,
  `appendVerifiedEvent`, and a `writeFields` revision bump in one
  mutation step, and deletes applied proposals through `FsPort.delete`.
  Additions beyond the spec's named exports, all additive:
  - `SessionPort.readEntries?()` (src/deps.ts): the session-entry read
    port the attach-validation amendment deferred to this ticket.
  - `DriftMonitor.reset()` (src/handlers/drift.ts), wired at
    session_start: fixes a real cross-ticket interaction where a stale
    fingerprint baseline fired the reconciliation gate over a crash's
    legitimate leftovers. Out-of-band-detection's own tests stay green.
  - `src/handlers/review.ts` (`REVIEW_OPTIONS`, `revisionDiff`,
    `reviewPresentation`, `finishRevisionReview`), continuing the
    attach/activate/renegotiate handler precedent.
  - `src/tools/edit.ts` (`PlanEditingToolIo`, `createPlanEditingTools`,
    `requirePlanEditing`), the spec's planned module.
  - `PlanEditingContext` + `ReinsState.planEditing` (ephemeral by
    contract) and `writeFields` gained an additive `body` option plus
    the new `rewriteBindingSections` helper (src/plan/write.ts).
  - Guard inversion covers `reviewing` as well as plan-editing (a
    dismissed dialog parks the session in reviewing; mutations are
    held there, so raw outside writes must not slip through). One
    state beyond the criterion's plan-editing wording, in the spirit
    of the same enforcement.
  - Guard refusal wording now names both pauses ("paused in plan
    editing (revision and review)"); no foreign test asserted the old
    string.
- **Impact:** On plan-completion (ticket 12): the forward contract is
  unchanged and the utilities it consumes (`prependLogEntry`,
  `appendVerifiedEvent`, the writeFields-based status flip pattern)
  are landed and tested here. `DriftMonitor.reset()` is a new
  lifecycle step plan-completion must not disturb; the in-process
  verifier spawn it adds at session_start runs after the reset, so no
  interaction is expected.

### Abstraction usage
- Used/was specified: yes. Reused `RenegotiationOutcome.approved` /
  `.snapshot`, `snapshotPlanDir`'s `PlanSnapshot`, `ToolsetPort`,
  `requireUi`, `FsPort.delete`, `prependLogEntry` / `appendVerifiedEvent`
  / `writeFields`, the tool_call guard's `rawWriteTargets` surface.
  Nothing reimplemented.

### Out-of-scope changes
- Two judgment calls, both documented in the TDD output and flagged
  here for the coherence pass and user review:
  1. **Abandon restore is scoped to contract content.** The spec says
     abandon "restores the snapshot" while the same paragraph requires
     "pending proposals intact"; a literal whole-snapshot restore would
     relitigate gate-1 dispositions (resurrect rejected proposals,
     un-defer deferred ones). The restore leaves everything under
     `proposals/` untouched.
  2. **Acceptance deletes every approved intent's proposal document**,
     including intents the model never materialized (an intent skipped
     by the model is consumed by the user's acceptance of the concrete
     revision). The review dialog does not currently surface
     unapplied approved intents; worth considering there.
- None removed. The adjacent-write windows inside acceptance (revision
  bump, verified event, log entry, proposal deletions) are a residual
  risk of the planned step order, not an addition.

### Ticket doc update needed?
- Yes. Append to ## Implementation notes: the four tools live in
  `src/tools/edit.ts` and the review machinery in
  `src/handlers/review.ts`; the guard inversion also covers reviewing;
  the abandon restore is scoped to contract content (proposals/
  untouched); acceptance deletes all approved intents' proposal
  documents; `SessionPort.readEntries?` and `DriftMonitor.reset()` are
  the two new ports the crash-recovery leg rests on.

### User attention needed?
- Yes, mildly. Scope and API surface otherwise match the spec; the two
  judgment calls above (abandon restore scope, acceptance consuming
  unmaterialized approved intents) are the only points where a
  reasonable second reading of the spec differs from what was built.
  Both are contained to this ticket's behavior; neither changes the
  forward contract plan-completion consumes.
