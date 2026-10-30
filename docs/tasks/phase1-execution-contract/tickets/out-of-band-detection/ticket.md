---
type: ticket
subtype: feature
title: Out-of-band plan change detection and reconciliation
status: stable
workflow_state: ready
blocked_by:
- task-lifecycle
size: l
---

## What to build

Detection of plan-directory changes that did not come through the
plugin: turn-boundary fingerprinting of contract-significant content
(ephemeral, in-memory, tolerant of partially written files), a
session-start-scoped file watcher with a polling fallback as
best-effort live notification, turn-end drift verification against
observed transitions, and the reaction: notify the user, steer the
model, and hold mutations in a reconciliation gate rather than
silently continuing.

## Acceptance criteria

- [ ] A hand edit to contract-significant content between runs is
      detected at the next boundary.
- [ ] The watcher notices edits while idle, and the polling fallback
      engages when the watcher errors.
- [ ] On detection the user is notified, the model receives a steering
      message, and mutations are held until reconciled.
- [ ] The fingerprint tolerates partially written files.

## Blocked by

- `task-lifecycle` (detection compares against the plugin's own writes during execution).

## Implementation notes

Landed from `ticket/out-of-band-detection` (5 checkpoint commits) onto
`task/out-of-band-detection`; verified on the merge: typecheck clean,
full suite 17 files / 167 tests green (run with the session's
`PI_PACKAGE_DIR` unset; the documented `tests/inert-load.test.ts`
environment issue does not fire without it).

- `src/plan/fingerprint.ts`: `fingerprintContract(fs, scan)` is a sha256
  over the canonical contract-significant content only (plan document
  plus task documents; execution state and plugin bookkeeping stripped,
  frontmatter canonically serialized, body verbatim; unparseable files
  hashed by raw content, never crashing). Proposals, index, log, and
  supporting files are excluded per the fs-contract split.
- `src/handlers/watch.ts`: `createPlanWatcher`, the session-scoped
  watcher: recursive fs.watch with a debounced drift callback, a
  polling fallback engaged when the watcher cannot be created, throws,
  or errors, every timer unref'd, `stop()` on session_shutdown.
- `src/handlers/drift.ts`: `createDriftMonitor`, turn-boundary
  fingerprint comparison with the baseline armed on every entry into
  executing, turn-end drift verification against the plugin's observed
  writes (`state.pluginContractWrites`, drained at verification), and
  the reaction: notify the user, force a steering message, enter
  reconciling, offer the reconciliation dialog (accept resumes
  executing and rebaselines; decline keeps mutations held and every
  following boundary re-offers; no UI holds fail-closed).
- Divergences, all additive and recorded in the deviation report: the
  fs port parameter on `fingerprintContract`; the `contractContentMap`
  export; new modules beyond the spec's handlers/ list; the watcher
  realized as session-lifetime scope (created when a contract first
  binds, torn down at session_shutdown) rather than strict
  session_start; detection reacts only while executing (hand edits
  during plan-editing/reviewing surface through ticket 11's review
  diff instead).
- `state.pluginContractWrites` has no production writer yet; it is the
  documented surface the plan-editing tools (ticket 11) record their
  contract-significant writes into so drift verification absorbs them.
- RED discovery: `fs.watch` with `recursive: true` on a nonexistent
  directory neither throws nor emits an error on this Node; it silently
  watches nothing. The watcher pre-checks the root and routes a missing
  directory to the polling fallback (test-covered).
