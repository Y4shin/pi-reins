---
type: ticket
subtype: feature
title: Change proposal recording and visibility
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
size: m
---

## What to build

The proposal-recording tool writing uniform change-proposal documents
under proposals/ per the contract: kind add, modify, or remove; target
required for modify and remove; rationale in the body; draft task
content (binding sections, proposed id and title) for additions;
optional dependency hints in both directions. Proposal validation is
part of attach-time validation, the widget counts pending proposals,
and proposals are never execution-eligible.

## Acceptance criteria

- [ ] Recording an addition writes a proposal document with draft
      binding sections; modify and remove require a resolvable target
      task id.
- [ ] Malformed proposals (unknown kind, unresolvable target) are
      refused at recording time.
- [ ] Attach-time validation accepts well-formed proposals/ content.
- [ ] The widget counts pending proposals; proposals never become
      execution-eligible.

## Blocked by

- `task-lifecycle` (proposals are recorded during execution against active tasks, and the write-path surface exists).

## Implementation notes

Landed on `task/change-proposals` by merging the `ticket/change-proposals`
working branch (9 TDD checkpoints) with `--no-ff` and deleting the ticket
branch. Gate at landing: typecheck clean and the full suite green
(12 files, 90 tests, including the real-pi inert-load check); no linter is
configured in the repo, so the static gate is `tsc --noEmit` only. Full
deviation analysis lives in `deviation-reports/change-proposals.md`. Notes
for downstream tickets:

- The proposal store lives in `src/plan/proposals.ts` (a new module; the
  interface contract named the store without a home file):
  `proposalStore(scan)` exposing `pending()`, `deferred()`, and
  `bearingOn(taskId)`. Ticket 9's renegotiation triggers consume it
  directly; the widget counts from it too.
- `ProposalDocument` gained a required `draft: ProposalDraft` populated at
  the discover site via `extractProposalDraft` in `src/plan/parse.ts` (H2
  extraction mirroring `extractBindingSections`; it also accepts
  `## Proposed task` as a lenient fallback for the canonical
  `## Proposed task (draft)` heading). Ticket 9 presents rationale and
  draft content from `scan.proposals[].draft`; ticket 11's materialize-add
  can reuse the extraction and the tool's body composer.
- Recording-time refusals exceed the ticket's named two (unknown kind,
  unresolvable target) with the fs-contract's remaining well-formedness
  rules: non-empty rationale, complete draft content for add,
  caller-provided ids refused on collision (generated ids deduplicate with
  numeric suffixes), reserved filenames (index/log at any level),
  list-shaped dependency hints, and a flat-filename check refusing ids that
  would escape `proposals/` (path traversal, closed after review). All
  are refuse-at-recording, never repair.
- Deferred counting reads `deferred: true` strictly: a bare `deferred:`
  marker or a YAML 1.1-style `yes` does not count until ticket 9 owns the
  disposition marker's shape; the widget counts whatever is on disk.
- `dependsOn`/`enables` hints are shape-checked, not resolved, by design
  (a hint may name a proposal recorded later); `bearingOn` string-matches
  ids.
- Recording refuses outside the executing phase, consistent with the
  fs-contract's recorded-during-execution rule; ticket 9 may need to widen
  that check for gate phases, like the task tools.
- `reins_status` deliberately carries no proposal counts: the criteria
  name the widget only, and the renegotiation triggers consume the store
  directly. The widget line renders after Gate per the arch-spec order and
  is omitted while the pending set is empty.
- `tests/harness/fixtures.ts` gained an additive `writeFixtureFile` helper
  for adding documents to copied fixtures; the malformed proposal fixtures
  live in `tests/fixtures/malformed-proposals/` (one rule class, seven
  defect files).
- The orchestrator's `task: change-proposals` pointer in
  `docs/tasks/state.yaml` was swept into the first checkpoint commit
  (workflow state, not product code).
- The known `discover.ts` line-12 import-merge blemish was left for the
  effort's coherence pass, per the arch-spec amendment.
