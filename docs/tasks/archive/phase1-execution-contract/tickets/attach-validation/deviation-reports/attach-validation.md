---
type: deviation report
title: Deviation report for attach-validation
status: stable
---

## Deviation report: attach-validation

Verified against `git diff task/attach-validation..ticket/attach-validation`
(12 commits, 69 files), the arch spec's per-ticket contract, the
fs-contract rule sources, and an independent re-run of the full suite
(44 tests in 8 files, all passing; `tsc --noEmit` clean). Rule
constants were cross-checked against `docs/plans/plan-fs-contract.md`:
plan vocabulary (proposed/active/completed), task vocabulary
(pending/in_progress/blocked/done), log entry vocabulary
(Creation/Activation/Update/Completion/Deprecation), ISO date
headings, mandatory root index/log with `okf_version: "0.2"` pinned,
index frontmatter restricted to `okf_version`, plan required fields
(type/id/schemaVersion/goal), task id required and unique, all three
binding sections required with unknown direct subheadings a validation
error, reserved filenames at every level. All match.

### API surface changes

- **Planned:** the spec named the attach flow behind
  `/reins-attach <path>` but not the fs port re-rooting mechanics (the
  scaffold as-built note only said the FsPort stays cwd-rooted "until
  attach owns the plan path").
  **Actual:** `ReinsWiring.createDeps` in `src/pi.ts` now takes an
  optional `ReinsDepsOptions { fsRoot }` (exported), and the attach
  command roots the port at the user-supplied plan directory; the
  harness honors the option so refusals behave live.
  **Impact:** additive and optional, no dependent breaks; activation
  and later tickets consume `createDeps(ctx)` unchanged.
- **Planned:** rule modules per class in `src/plan/validate.ts`,
  including reserved filenames.
  **Actual:** reserved-filename detection (`reserved-filename-role`)
  and the nested-Execution-Plan rule live in `discover.ts` (which owns
  reserved-file categorization and the parsed docs) and flow into the
  report through the parse-findings aggregation; `PlanScan` is
  unchanged. The rule classes are per-class functions in one
  `validate.ts` composed via a private `RULE_CHECKS` array, not one
  file per class.
  **Impact:** none for dependents; `RULE_CHECKS` is the prepared
  extension point the change-proposals ticket extends.
- **Planned:** the scaffold's `parse.ts` comment deferred unknown H2s
  under `# Task` to attach-time validation.
  **Actual:** `extractBindingSections` emits `unknown-task-subheading`
  findings itself (typed `Omit<ParseFinding, "file">`, the file
  attached at the discover site), which validate aggregates. The
  fs-contract's "an unknown direct subheading is a validation error"
  holds either way.
  **Impact:** none; same report stream.
- **Planned:** the spec's `attach()` records "the path" as a private
  session entry.
  **Actual:** the entry is `reins-attached` with `{ planDir, phase }`;
  the phase makes the attached/executing split observable.
  **Impact:** additive; ticket 11's reconcile and later consumers see
  the same shape.
- `attach()` itself lives in `src/handlers/attach.ts` (the shared
  layout's handlers/ list did not name it) and `AttachResult`
  { ok, planDir, phase, violations, report } matches the interface
  contract as planned; no dependent-facing deviation.

### Abstraction usage

- Used/was specified: yes. `validatePlan` consumes `PlanScan` exactly
  as specified; parse findings are aggregated as the upstream-hard-rules
  class; `parseDoc`/`extractBindingSections` are reused with no parser
  reimplemented and no per-kind parsers introduced; the harness
  substrate (`copyFixture`, `createHarness`, `runCommand`, the fake
  ExtensionAPI registration path) is reused; `writeFields` is never
  touched (attach never writes; a test asserts the plan directory is
  byte-identical after a passing attach). The Do-NOT list holds: no
  repair or generation, no rejection of unrecognized frontmatter keys
  (the index extra-keys rule is the fs-contract's strict OKF index
  semantics, not a general unrecognized-keys rejection), no Phase 2+
  structure validation.

### Out-of-scope changes

- `src/plan/fs.ts`: one-line non-directory guard in `list()` so an
  attach path pointing at a file refuses with a report instead of
  crashing on ENOTDIR.
- `src/handlers/session.ts`: comment-only correction of the scaffold's
  stale scope promise (crash-resume reconcile moves to ticket 11).
- `tests/harness/index.ts`: the `createDeps` override honors `fsRoot`
  so the command boundary is tested through the real registration
  path.
- Fixtures beyond the one-per-class minimum: `malformed-multi/`
  (report completeness), `malformed-index-frontmatter/` (the strict
  OKF index rule), and `plan-active/`, `plan-completed/` for the
  state-machine behaviors. All directory fixtures; no inline strings.
- Additional attach refusals not enumerated in the ticket doc:
  completed plan, second attach while a contract is bound, missing
  argument. Grounded in the state machine (no detached-to-completed
  transition) and fail-safe behavior; each refuses with a report and
  binds nothing.
- Deferrals from spec text (recorded, all self-reported by the
  implementer):
  - `deps.actor` resolution for plan directories outside the cwd
    repository was expected here by the scaffold as-built note but is
    deferred to activation; nothing in this ticket consumes `actor`.
  - Session-start crash-resume rebuild: the shared state-machine
    paragraph says "a crash-resumed session rebuilds" from private
    session entries; the landed model is command-based re-attach only
    (fresh state at every session_start). `ReinsDeps` still has no
    session-entry read port; the leftover-entry reconcile machinery
    belongs to plan-editing-review (ticket 11). Most consequential
    judgment call in the ticket; flagged for the coherence review and
    the as-built amendment.
  - Log newest-first ordering is not validated (reversed-date logs
    attach); `schemaVersion` is presence-checked but its value is not
    pinned; log bullets before the first date heading are not
    placement-checked.

### Cosmetic defect found (one-line fix)

- `src/plan/discover.ts` line 12 merges two import statements onto one
  line (`import type { FsPort } from "../deps.js";import {`). Valid
  TypeScript (typecheck and suite pass) but it breaks the file's
  one-import-per-line formatting, likely an accidental edit. Should be
  split in the coherence pass or a follow-up commit.

### Ticket doc update needed?

Yes. Append to ## Implementation notes:

- `createDeps` now takes optional `ReinsDepsOptions { fsRoot }`; the
  attach command roots the fs port at the plan directory and the
  harness honors it.
- `reserved-filename-role` (reserved files with execution types, and
  nested `type: Execution Plan` documents) surfaces as a discovery
  finding; `unknown-task-subheading` as a parse finding; both
  aggregate into the attach report via `validatePlan`.
- The private session entry is `reins-attached` with
  `{ planDir, phase }`.
- `RULE_CHECKS` in `validate.ts` is the extension point the
  change-proposals ticket adds proposal rules to.
- Deferrals: actor resolution to activation; session-start
  crash-resume rebuild to plan-editing-review; log ordering,
  `schemaVersion` pinning, and entry placement remain residuals.
- The `discover.ts` import-line blemish awaits the coherence pass.

### User attention needed?

No blocking attention: no planned API surface broke a dependent and
the ticket's scope held (the one-line fs guard, the comment fix, and
the docs sync are the only touches outside the export list). The
session-start crash-resume split is the one behavioral divergence
from shared spec text (spec: a crash-resumed session rebuilds;
landed: every session starts detached and re-attaches by command
until ticket 11 lands the entry reconcile); the coherence review and
the arch spec's as-built amendment should confirm that split
deliberately rather than by omission.
