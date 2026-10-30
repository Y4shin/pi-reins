---
type: ticket
subtype: feature
title: Plan-editing enforcement, review gate, abandon, and crash recovery
status: stable
workflow_state: ready
blocked_by:
- renegotiation-session
size: xl
---

## What to build

The second half of the renegotiation machine. Plan-editing: the active
tool set swaps edit and write out and writes outside the plan directory
are blocked, while the agent materializes approved intents
(materializing additions from their drafts, applying modifications,
deleting removals). Review gate: a blocking dialog presenting the
concrete revision as the difference between the pre-session snapshot
and the post-edit state; acceptance bumps the revision, writes the log
Update entry together with the verified event, and deletes applied
proposal documents; rejection returns to plan-editing. Abandon returns
to executing with the old contract intact and proposals left pending.
Crash recovery: session-start reconciliation resumes in executing,
honors a durable review acceptance (log entry plus bumped revision),
and leaves pending proposals pending.

## Acceptance criteria

- [ ] During plan-editing, writes outside the plan directory are
      blocked and edit and write tools are absent from the schema.
- [ ] Materialization creates, edits, and deletes task documents
      exactly per the approved intents.
- [ ] The review dialog presents the concrete diff; rejection returns
      to plan-editing; abandon returns to executing with the old
      contract and pending proposals intact.
- [ ] Acceptance bumps the revision, writes the log Update entry with
      the verified event, and deletes the applied proposals.
- [ ] After a restart with leftover gate records the plugin resumes in
      executing; a durable review acceptance is honored; pending
      proposals survive.

## Blocked by

- `renegotiation-session` (plan-editing and review are the continuation of an approved session).

## Implementation notes

Landed from `ticket/plan-editing-review` (7 checkpoint commits, one per
red-green cycle) onto `task/plan-editing-review`, branched from the tip
of `task/expected-declaration-nudges`; merged with `--no-ff`. Gate at
landing: typecheck clean, ticket suite 23/23 green, full suite 19 files
/ 202 tests green under `env -u PI_PACKAGE_DIR` (with the var set the
documented inert-load failure fires, so stripping it is the landing
rule). No linter is configured, so `tsc --noEmit` is the static gate.
Full deviation analysis lives in
`deviation-reports/plan-editing-review.md`. Notes for downstream
tickets:

- The four plan-editing tools (`reins_materialize_add`,
  `reins_edit_task`, `reins_remove_task`, `reins_finish_revision`)
  live in `src/tools/edit.ts`; the review machinery (`revisionDiff`,
  `reviewPresentation`, `finishRevisionReview`, `REVIEW_OPTIONS`)
  lives in `src/handlers/review.ts`, continuing the
  attach/activate/renegotiate handler precedent.
- The tool_call guard's inversion covers `reviewing` as well as
  plan-editing: a dismissed dialog parks the session in reviewing with
  mutations held, so raw outer writes must not slip through. Refusal
  wording names both pauses; raw writes into the plan directory stay
  blocked in every bound state.
- Judgment call 1 (flagged for the coherence pass): abandon restores
  contract content only. Everything under `proposals/` is left as the
  renegotiation session left it, so gate-1 dispositions (rejected,
  deferred) are never relitigated. The criterion's "pending proposals
  intact" is read as binding over a literal whole-snapshot restore.
- Judgment call 2 (flagged for the coherence pass): review acceptance
  deletes every approved intent's proposal document, including intents
  the model never materialized; the user's acceptance of the concrete
  revision consumes the approved set. The dialog does not yet surface
  unapplied approved intents, worth considering there.
- Crash recovery rests on two new ports: `SessionPort.readEntries?()`
  (src/deps.ts, wired to pi's session manager; the read half the
  attach-validation amendment deferred to this ticket) and
  `DriftMonitor.reset()` (src/handlers/drift.ts), wired at
  session_start so an in-process resume cannot compare against a stale
  fingerprint baseline. plan-completion (ticket 12): the verifier
  spawn it adds at session_start runs after the reset.
- Forward contract to plan-completion is intact: acceptance writes the
  records (`prependLogEntry`, `appendVerifiedEvent`, the writeFields
  revision bump) in one mutation step and deletes applied proposals
  through `FsPort.delete`, all reusable for the Completion entry.
- Additive surface: `writeFields` gained a `body` option and
  `rewriteBindingSections` (src/plan/write.ts) replaces named binding
  sections while preserving the rest verbatim; `PlanEditingContext`
  and `ReinsState.planEditing` are ephemeral by contract, never
  persisted.
- The materialize numeric-prefix convention (max existing task prefix
  + 10, zero-padded to 3) is convention, not spec; the fs-contract
  treats prefixes as non-durable ordering only.
- Adjacent-write windows inside acceptance (revision bump, verified
  event, log entry, proposal deletions) are the same documented
  residual class as activation's write pair; a crash mid-step leaves
  partial records that the reconciler treats as authoritative.
- Post-effort lesson: plan-completion consumed the acceptance write
  utilities but, per the binding fs-contract ("Nothing is appended at
  task completion"), writes its Completion entry without a
  `appendVerifiedEvent` call; the arch spec's ticket-11/12 wording
  over-included the verified event and was amended at reconcile. The
  review dialog still does not surface unapplied approved intents
  (judgment call 2 above); that remains an open product consideration
  for a later effort.
