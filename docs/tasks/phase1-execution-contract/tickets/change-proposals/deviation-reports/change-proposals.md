---
type: deviation report
title: Deviation report for change-proposals
status: stable
---

## Deviation report: change-proposals

Verified against the diff `main...ticket/change-proposals` (9 checkpoint
commits, 22 files, +1309/-6), the arch spec's per-ticket contract
(ticket 5) plus the shared sections (layout, widget, seams), the
as-built amendments from the four landed tickets, the fs-contract's
Change Proposals section (document shape, fields, lifecycle), and a
direct read of every changed source and test file. All four acceptance
criteria are satisfied at the declared seams (tool boundary, malformed
refusals, attach-time acceptance of the well-formed proposal via the
malformed fixture family, widget count); the deltas below are additive
surface extensions, none dependent-breaking.

### API surface changes

- **Planned:** the `reins_propose_change` tool writing proposal
  documents under `proposals/` per the fs-contract (kind
  add/modify/remove, target required and resolvable for modify and
  remove, rationale in the body, additions carrying draft id, title,
  and binding sections, optional dependsOn/enables).
  **Actual:** delivered exactly as specified in `src/tools/propose.ts`
  (registered in `src/pi.ts`): the kind vocabulary is closed and named
  in refusals, modify/remove targets resolve against the task scan
  (refusals name the known ids), add requires the full draft content
  (proposedId, proposedTitle, description, acceptanceCriteria,
  constraints), hints are optional in both directions, every write is
  stamped `generated` and serialized through the runtime
  `withFileMutationQueue`, and the result is one line.
  **Impact:** none; the surface matches what tickets 9 and 11 call.
- **Planned:** the interface contract "the proposal store exposes
  `pending()`, `deferred()`, and `bearingOn(taskId)`" with no home
  file named. **Actual:** `proposalStore(scan)` in a new
  `src/plan/proposals.ts`, with exactly those three methods and the
  specified bearing semantics (target equals taskId, or taskId appears
  in dependsOn/enables). **Impact:** additive; renegotiation-session
  (ticket 9) consumes it as planned, the widget already does.
- **Planned:** `ProposalDocument` as the scaffold landed it (an empty
  extension of `FrontmatterDoc`; discovery separated Change Proposal
  from Task by type only). **Actual:** the type gained a required
  `draft: ProposalDraft` (rationale plus, for additions, the draft
  task: id, title, the three binding sections), populated at the
  discover site through the new `parse.ts` export
  `extractProposalDraft`, mirroring `extractBindingSections` and the
  scaffold amendment's composed-at-discover pattern.
  **Impact:** additive; ticket 9 presents rationale and draft content
  from `scan.proposals[].draft`, and ticket 11's materialize-add can
  reuse the extraction. No consumer of `scan.proposals` predates the
  change, so nothing broke.
- **Planned:** recording-time validation refusing "unknown kinds and
  unresolvable targets" (the ticket's named minimal set).
  **Actual:** the refusal set is wider: a non-empty rationale, complete
  draft content for add, a caller-provided id colliding with an
  existing proposal (refused, not renamed; generated ids deduplicate
  with numeric suffixes), a reserved-filename collision (index/log at
  any level), dependency hints that must be lists of ids, and a
  flat-filename check refusing ids that would escape `proposals/`
  (path traversal, found in review and closed with a test).
  **Impact:** every extra rule is refuse-at-recording, never repair,
  and each mirrors an fs-contract well-formedness requirement or a
  write-safety need; no dependent named the narrower set.
- **Planned (shared widget section):** "pending and deferred proposal
  counts". **Actual:** delivered: a `Proposals: N pending` line after
  Gate, extended with `, M deferred` when any proposal is deferred,
  omitted while the pending set is empty (the established
  empty-sections convention). **Impact:** none; the deferred count was
  already specified.

### Abstraction usage

- Used/was specified: yes. Document creation utilities (`dumpDocument`,
  `generatedBy`, the write path through the fs port),
  `discoverPlanDir` fresh rescans per invocation (no caching; the
  widget re-renders from a fresh scan, the pending count is never
  persisted), the validation rule-module extension point `RULE_CHECKS`
  via the new `checkProposals` exactly as the attach-validation
  amendment named, the runtime `withFileMutationQueue` symbol per the
  task-lifecycle amendment, `renderWidget(deps, state, scan)`
  deps-first per the activation amendment, and the harness's
  `dispatchTool`/fixture family (one malformed directory per rule
  class: `malformed-proposals/` with seven defect files, plus the
  well-formed sample proposal in `plan-valid/` raising no proposal
  violations). No YAML or general Markdown parsing was reimplemented
  (`extractProposalDraft` is H2-section extraction only, like the task
  binding extraction). Proposals stay execution-eligible never: they
  never enter `scan.tasks`, and both the draft task id and the
  proposal id are refused by `reins_task_start` (tested; counts never
  move). Nothing is executed or applied at recording time.

### Out-of-scope changes

- `src/plan/proposals.ts`: a new module beyond the arch-spec layout's
  plan/ list (fs, parse, discover, write, validate, fingerprint). The
  interface contract named the store without a home; the module follows
  the plan/ pattern. Additive.
- `src/plan/parse.ts`: `extractProposalDraft` plus the
  `ProposalDraft`/`ProposalDraftTask` types (the parse-layer extension
  behind the `draft` field above). Additive; the extraction also
  accepts a `## Proposed task` heading as a lenient fallback for the
  canonical `## Proposed task (draft)`.
- `tests/harness/fixtures.ts`: an additive `writeFixtureFile` helper so
  plan-directory seam tests can add documents to copied fixtures
  (follows the harness-superset pattern).
- `docs/tasks/state.yaml`: the orchestrator's uncommitted
  `task: change-proposals` pointer was swept into the first checkpoint.
  Workflow state, not product code; harmless, but the ticket diff
  carries it.
- `reins_status` deliberately carries no proposal counts (the criteria
  name the widget only; ticket 9's triggers consume the store
  directly). Recording refuses outside the executing phase, consistent
  with the fs-contract's "recorded during execution"; like the task
  tools, ticket 9 may need to widen that check for gate phases.

### Ticket doc update needed?

Yes. The land-worker's implementation note should record: the store's
home (`src/plan/proposals.ts`); `ProposalDocument.draft` populated at
the discover site via `extractProposalDraft`; the wider
recording-time refusal set (rationale, draft completeness, id
collisions with caller-provided ids refused and generated ids
deduplicated, reserved filenames, hint shape, flat-filename safety);
and the residual that deferred counting reads `deferred: true`
strictly, so a bare `deferred:` marker or a YAML 1.1-style `yes` does
not count until ticket 9 owns the marker's shape.

### User attention needed?

No. No planned API surface differs: the tool name, parameter surface,
refusal obligations, attach-time rule class, widget counts, and the
store's three methods all match the spec. Every delta is additive,
spec-consistent, and traceable to an fs-contract requirement; the
interface contract for tickets 9 and 11 is intact and richer (draft
content available at the discover site).
