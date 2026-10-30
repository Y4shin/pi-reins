---
type: task
title: Settle the OKF 0.2 compliance decisions and reconcile the fs-contract
status: deprecated
blocked_by:
- research-okf-compliance
subtype: grilling
workflow_state: done
---

## Decision to settle

How the execution-plan filesystem format in
[docs/plans/plan-fs-contract.md](../../../../plans/plan-fs-contract.md)
reconciles with upstream OKF 0.2: for every gap or extension-candidate the
research audit surfaced, decide whether to keep it as a documented OKF
extension or close it, and apply the settled decisions to the fs-contract
itself.

The known decision list from the fs-contract's Pending Phase 1 Work
section, to be confirmed or extended by the research findings:

1. **Status-key collision.** Plan and task `status` reuse the OKF lifecycle
   `status` family key for execution vocabulary. Keep as extension, or
   rename the execution field (and which name), or split lifecycle and
   execution state?
2. **Further OKF families.** Should plan, task, and phase documents adopt
   `generated`, `verified`, `stale_after`, or other families? Which, on
   which document types, with what conventions?
3. **Required index and log strictness.** The format requires root
   `index.md` and `log.md` and pins `okf_version: "0.2"`, stricter than
   upstream's optional files. Keep, relax, or condition?
4. **Log conventions.** What entry types and conventions does `log.md`
   carry beyond the contract-change history it already specifies?
5. **Extension vs gap classification.** For each audit finding, the final
   verdict and, for extensions, the documentation the fs-contract needs so
   the claim "self-contained OKF 0.2 bundle" stays honest.

## Parent decisions it depends on

- `research-okf-compliance`: the item-by-item audit with upstream
  citations. Every question in this task is answerable only from that
  evidence.

## Choices already known

- The root `index.md` keeps strict OKF index semantics and the
  `okf_version` declaration; the plan concept is `plan.md` with its
  structured metadata in frontmatter (settled upstream of this map, see
  the fs-contract's `plan.md` section).
- pi-reins treats `sources` provenance as provenance only; concrete
  provenance conventions belong to higher-level planning
  skills/workflows (fs-contract, Provenance section).

## Recommended starting answer

Follow the research audit's recommendations verbatim where they are
unambiguous: they were derived from the binding upstream spec, and the
audit is the evidence. Grill only where the audit marks a genuine user
decision (for example: whether to adopt `verified` conventions that assert
human review, or how much log strictness the format should demand). Where
the audit recommends keeping a deviation, keep it as a documented
extension; prefer minimal edits to the fs-contract over restructurings.

## What downstream work the answer may create

The settled decisions land in the fs-contract as reconciliation edits
(this task applies them; see the map's Notes override), closing its
Pending Phase 1 Work section. Downstream, `to-spec` then builds the Phase 1
spec on a format whose OKF 0.2 claim is verified rather than aspirational.
If grilling opens a genuinely new format decision not covered by the
audit, route it back to Wayfinder rather than improvising it here.

## Notes

- **This task is a deliberate plan-don't-do override (map Notes):** in
  addition to settling the decisions, this task applies the resulting
  edits to the binding spec `docs/plans/plan-fs-contract.md`, replacing the
  Pending Phase 1 Work section with the settled state, and updates
  `docs/plans/plan.md`, `CONTEXT.md`, and `docs/plans/INDEX.md` if any
  settled decision touches what they say. The fs-contract pins this
  reconciliation as its own required work.
- **Pinned from grill-material-deviation-boundary (2026-09-29):** as the
  designated fs-contract editor, this task also applies that task's D6
  task-body-structure amendment: exactly three binding H2 sections under
  a literal `# Task` H1 (Description, Acceptance Criteria, Constraints),
  all required at activation, Constraints may be empty, unknown H2s
  under `# Task` are validation errors, all other prose and headings
  advisory; this converges the Phase 3 acceptance-criteria convention
  into Phase 1 structure. When deciding the status-key question, note
  that a proposed-style task status is a likely durable home for
  change proposals, to be coordinated with
  grill-replanning-state-machine.

## Decisions so far

- **O1 (2026-09-29): Execution-status key renamed.** The plan and task
  execution-status frontmatter key becomes `executionStatus`, values
  unchanged (`proposed`/`active`/`completed` on plans;
  `pending`/`in_progress`/`blocked`/`done` on tasks). The OKF `status`
  key reverts to its lifecycle meaning (`draft`/`stable`/`deprecated`;
  absent means `stable`) and is free for genuine lifecycle use, for
  example `status: deprecated` on a retired plan. Rationale: every
  execution-plan field becomes a genuine extension key (upstream
  §4.1), generic consumers get defined lifecycle semantics (§5.4), the
  fs-contract's extension-key claim becomes exactly true, and the
  change-proposal durable representation gains a clean home (a
  proposed-style `executionStatus` value, for
  grill-replanning-state-machine to design). Rejected: keeping
  `status` as a profile-level override (permanent collision, undefined
  consumer lifecycle, qualified OKF claim).
- **Settled per the audit's unambiguous recommendations (standing task
  instruction)**: keep the required root `index.md`/`log.md` and pinned
  `okf_version: "0.2"` (K3); scope the Markdown Conformance
  extension-key claim to genuinely producer-defined keys and
  acknowledge `title`/`description`/`sources` as standard keys followed
  (R4); replace the Pending Phase 1 Work section with an OKF 0.2
  profile note including the dual-identity caveat (R5); do not adopt
  `stale_after` on plan, task, or phase documents (R2); carry the §11
  hard rules and profile rules into the attach-time validation surface
  for to-spec (R6).
- **O2 (2026-09-29): The `verified` trust family is adopted.** The
  plugin appends a `verified` event (`{ by, at }`, upstream §5.2) to
  `plan.md` at activation and at each review-gate acceptance, written
  together with the corresponding `log.md` entry by the same writer so
  they cannot diverge; nothing at task completion (agent-claimed, not
  human-verified) and nothing at rejection. The actor is `human:<id>`
  with the id taken from the git `user.email` of the plan directory's
  repository when one exists, else the OS username; a plugin
  configuration override remains available later. Rationale: the
  review gate is genuine file-level human review, so pi-reins has a
  legitimate claim to the trust family, and the plan then reads as
  human-reviewed to any trust-tier-aware consumer (§5.3). Rejected:
  deferring adoption (defensible on minimalism, but the zero-migration
  argument cuts both ways and the product's own gates supply exactly
  the review the family records).
- **O3 (2026-09-29): Writer-maintained `generated` is adopted, with the
  boundary drawn explicitly.** The plugin maintains `generated`
  (`{ by, at }`, upstream §5.2) on the plan and task documents it
  writes, updating `by` and `at` on each write, with
  `by: pi-reins/<version>` for all plugin-mediated writes including
  plan-editing-mode edits; external planners MAY set it when authoring
  a plan (optional family, absence never rejected). Boundary statement:
  `generated` records content freshness only (when the document last
  meaningfully changed, including execution-status transitions) and is
  explicitly not an execution-timing fact; Phase 7's timing design
  (active intervals, pauses, elapsed reconstruction) is a different
  axis and remains open and unaffected. Rationale: the honest staleness
  signal for Phase 1's steer-against-stale-progress requirement (mtimes
  lie after git checkouts; VCS may be absent), an enforceable writer
  obligation (the plugin is the only sanctioned writer), trivial cost.
- **O4 (2026-09-29): log.md conventions confirmed per the audit.**
  Activation is a logged event (one entry for the user-controlled
  proposed to active transition, written together with the activation
  verified event per O2). Closed bold-word vocabulary: **Creation**,
  **Activation**, **Update** (accepted revisions, one entry per
  review-gate approval, referencing the revision number), **Completion**,
  **Deprecation**. Structural rules unchanged (newest first; same-day
  entries share one ISO YYYY-MM-DD heading; one-line prose entries).
  Exclusions reaffirmed: task-status transitions, derived progress, and
  budget assessments never belong in log.md. Deferred to Phase 4:
  whether a detected and reconciled out-of-band contract-significant
  modification earns a log entry; decided when detection exists.

## Final decision

Settled 2026-09-29 with the user's explicit confirmation of shared
understanding. All decisions are recorded above as O1 through O4 plus
the settled-per-audit list. Applied by this task (the plan-don't-do
override):

- `docs/plans/plan-fs-contract.md`: the `executionStatus` rename across
  the plan and task sections, examples, and the execution-state change
  lists; the new Generated and Verified section; the log.md conventions
  (Activation entry, closed bold-word vocabulary, verified pairing,
  Phase 4 deferral); the Markdown Conformance two-class key taxonomy;
  the OKF 0.2 profile replacing the Pending Phase 1 Work section; the
  binding task-body structure (the D6 amendment pinned from
  grill-material-deviation-boundary); and heading em-dash cleanup per
  the repo's no-em-dash rule.
- `CONTEXT.md`: the Execution state entry names `executionStatus`.
- `docs/plans/plan.md`: no settled decision changes what it says; only
  phase-heading em-dashes were cleaned per the repo rule. The 1.6 timing
  amendment belongs to grill-replanning-state-machine.
- `docs/plans/INDEX.md`: unchanged; it describes the fs-contract
  without field names.

Dependent-task implications: grill-replanning-state-machine designs
the change-proposal durable representation on the renamed
`executionStatus` (a proposed-style value is now collision-free) and
inherits the verified pairing at its gates; to-spec receives the
attach-time validation surface (the §11 hard rules plus profile rules
plus binding-sections checks) and the writer obligations (index
regeneration, log entries including Activation, executionStatus,
generated, verified).

Remaining fog: none from this task. The Phase 4 out-of-band log entry
question is deferred with detection; the plan-validation surface
sharpens in to-spec.
- Execution follows `implement-task/resources/grilling.md`: one focused
  question at a time, concrete recommended answer with each, decisions
  recorded in the user's terms.
