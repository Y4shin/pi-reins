---
kind: task
type: research
slug: research-okf-compliance
title: Verify the execution-plan format against upstream OKF 0.2
map: phase1-execution-contract
status: ready
blocked_by: []
---

## The precise question

Does the execution-plan directory format defined in
[docs/plans/plan-fs-contract.md](../../../docs/plans/plan-fs-contract.md)
conform to the upstream Open Knowledge Format v0.2 specification, and where
it does not, which deviations are conformant extensions and which are
genuine compliance gaps?

The audit must be concrete: check every structural claim of the fs-contract
against the normative rules of the upstream spec, item by item. The
fs-contract's own Pending Phase 1 Work section lists the known points:

- the plan and task `status` fields reuse the standardized OKF lifecycle
  `status` family key (`draft`/`stable`/`deprecated`) for execution
  vocabulary (`proposed`/`active`/`completed`,
  `pending`/`in_progress`/`blocked`/`done`): extension or collision?
- whether plan, task, and phase documents should adopt further OKF
  families, such as `generated`, `verified`, and `stale_after`;
- this format requires the root `index.md` and `log.md` and pins
  `okf_version: "0.2"`, while OKF itself leaves both files optional for
  producers: is that strictness level safe under the upstream conformance
  rules?
- what else belongs in `log.md` and with what entry conventions;
- which of the above are documented OKF extensions, which are conformance
  gaps, and where the line runs.

Also audit the structural basics the contract asserts: numeric prefixes vs
OKF path identity, `phase.md` as a phase marker, `plan.md` as the plan-level
concept, the reserved-filename rules, and the extension-key claim in the
Markdown Conformance section.

## The decision it unblocks

`grill-okf-compliance` (and through it the Phase 1 spec that `to-spec`
produces): whether the durable format needs reconciliation edits, and if
so which ones. Without this audit, the format's OKF 0.2 claim stays
unverified and the known `status`-key collision unresolved.

## Trusted source boundaries

- **Primary and binding:** the upstream OKF v0.2 specification,
  `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`
  (raw: fetch the repo's `okf/SPEC.md`).
- **Binding local documents:** `docs/plans/plan-fs-contract.md` (the format
  under audit), `docs/plans/plan.md`, `CONTEXT.md`, `AGENTS.md`.
- **Reference prior art, informative only:** the OKF 0.2 bundles and
  profiles on this machine, notably `~/tmp/kb-llm-system/` (a mature OKF
  0.2 bundle with a documented conformance profile in
  `concepts/okf-conformance.md` and ADR `decisions/D-042`) and the
  pi-knowledgebase's settled OKF adaptation
  (`docs/tasks/okf-format-adaptation/task.md`). These show how other
  bundles reconcile the same questions; they do not bind this format.

## Evidence required for completion

A research artifact under `docs/tasks/research-okf-compliance/` that
contains, item by item:

- the upstream OKF 0.2 conformance rules restated briefly, with citations
  (URL or exact section) for every material claim;
- for each known point above and each structural basic: a verdict of
  *conformant*, *conformant extension* (allowed by the upstream extension
  rules, cite the rule), or *compliance gap* (would fail upstream
  conformance), with the specific upstream rule cited;
- a concrete recommendation for each gap: the minimal reconciliation edit
  to the fs-contract, or the decision to keep the deviation and document
  it as an extension (with rationale);
- confidence level per verdict, and any question that must go to the user
  rather than being decided from sources;
- impact on dependents: what each recommendation changes for the Phase 1
  spec and for the grilling task's decision list.

## Likely dependent tasks

`grill-okf-compliance` consumes this audit and settles the decisions,
including the reconciliation edits to the fs-contract. If the audit
uncovers format questions beyond the known points (for example around
numeric prefixes or `phase.md` markers), they surface there rather than as
new tasks, unless they open a genuinely separate decision.

## Notes

- Do not modify the fs-contract in this task; that edit belongs to the
  grilling task (map Notes override).
- Mark the task `blocked` if the upstream spec cannot be retrieved or a
  verdict cannot be reached from the trusted sources, and explain what is
  missing.
