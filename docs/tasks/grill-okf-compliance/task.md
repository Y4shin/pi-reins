---
kind: task
type: grilling
slug: grill-okf-compliance
title: Settle the OKF 0.2 compliance decisions and reconcile the fs-contract
map: phase1-execution-contract
status: ready
blocked_by:
  - research-okf-compliance
---

## Decision to settle

How the execution-plan filesystem format in
[docs/plans/plan-fs-contract.md](../../../docs/plans/plan-fs-contract.md)
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
- Execution follows `implement-task/resources/grilling.md`: one focused
  question at a time, concrete recommended answer with each, decisions
  recorded in the user's terms.
