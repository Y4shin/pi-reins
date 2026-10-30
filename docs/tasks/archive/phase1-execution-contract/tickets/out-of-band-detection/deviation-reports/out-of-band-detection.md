---
type: deviation report
title: Deviation report for out-of-band-detection
status: stable
---

## Deviation report: out-of-band-detection

### API surface changes
- **Planned:** `fingerprintContract(scan)` added to `src/plan/fingerprint.ts`
  beside `snapshotPlanDir(fs, root)` / `PlanSnapshot`; a session-start-scoped
  watcher (fs.watch plus polling fallback, unref'd timers, session_shutdown
  cleanup); turn-boundary comparison plus turn-end drift verification against
  observed plugin writes; the reaction (notify user, steer model, enter
  reconciling with the tool_call guard blocking mutations, reconciliation
  dialog resumes executing on accept). Interface contract for dependents:
  `snapshotPlanDir` and `PlanSnapshot` are the landed shared surface that
  plan-editing-review (ticket 11) consumes via `RenegotiationOutcome.snapshot`;
  nothing here changes that.
- **Actual:** As planned, plus:
  - `fingerprintContract(fs, scan)` takes the fs port: unparseable files are
    hashed by raw content, and the scan carries only paths for supporting
    files, so read access is required. Matches the module's
    `snapshotPlanDir(fs, root)` signature precedent; the spec's
    `fingerprintContract(scan)` was shorthand.
  - Additive export `contractContentMap(fs, scan)`: the canonical-content
    half of the fingerprint, exposed so the monitor can attribute per-file
    changes for the observed-writes verification.
  - New modules `src/handlers/drift.ts` (`createDriftMonitor`,
    `DriftMonitorIo`, `DriftMonitor`) and `src/handlers/watch.ts`
    (`createPlanWatcher`, `PlanWatcherOptions`, `PlanWatcher`), beyond the
    handlers/ list the spec's layout names; continues the attach/activate/
    renegotiate handler precedent.
  - `ReinsState.pluginContractWrites?: string[]`: the state surface tools
    record contract-significant writes into; the spec required "drift
    verification against observed plugin writes" without naming the channel.
    Additive, ephemeral per contract.
  - Session-start-scoped watcher realized as session-lifetime scope: created
    when a contract first binds (attach or activate), because session_start
    deliberately rebuilds detached state (command-based re-attach); always
    torn down at session_shutdown. Narrower in reach, same cleanup point.
  - Detection reacts only while executing. During plan-editing/reviewing the
    watcher and boundary legs stand down; plugin-mediated writes there are
    absorbed by re-arming on re-entry to executing, and a hand edit during
    those phases surfaces through plan-editing-review's diff (ticket 11)
    instead. This is the deliberate reading of the "do not treat
    plugin-mediated plan-editing writes as out-of-band" rule against the
    landed state machine (executing is the only phase with an
    executing -> reconciling transition).
  - Decline behavior in the reconciliation dialog (keeps mutations held,
    every following boundary re-offers) and fail-closed without UI: the spec
    specified accept-resumes-executing; these are the refusal-side
    counterparts of the same hold-until-reconciled rule.
- **Impact:** On plan-editing-review (ticket 11): the shared-surface contract
  is unchanged (`snapshotPlanDir` / `PlanSnapshot` / `RenegotiationOutcome`
  untouched), but ticket 11 gains two named surfaces to consume, both
  additive: `state.pluginContractWrites` is the documented channel for its
  tools to record contract-significant writes so the drift verification
  absorbs them (no production writer yet; landed and tested directly), and
  detection standing down outside executing means hand edits during
  plan-editing/reviewing arrive at ticket 11's review diff, not the drift
  monitor. On expected-declaration-nudges (ticket 10) and plan-completion
  (ticket 12): no impact; nothing they consume changed shape.

### Abstraction usage
- Used/was specified: yes. Reuses `snapshotPlanDir` / `PlanScan` /
  `FsPort`, the `tool_call` guard for the reconciling hold, and the
  steering engine for the forced message; `file-trigger.ts` consulted as
  the watcher example. No reimplemented utilities.

### Out-of-scope changes
- None in product scope beyond the additive exports above (all named
  surfaces this ticket's own requirements imply). The pre-existing
  `inert-load.test.ts` environmental failure was re-confirmed as unrelated
  (reproduces on `main`; fails only when the session exports
  `PI_PACKAGE_DIR`, documented in `docs/testing.md`).

### Ticket doc update needed?
- No. The divergences are signature-shape and channel-naming details the
  arch spec's amendment section should carry for the spec reconcile; the
  ticket's acceptance criteria are all satisfied as written. (The land
  worker's standard implementation-note append still applies.)

### User attention needed?
- No. API surface changes are additive and internal to the plugin; no
  scope changed. The executing-only reaction window is a semantic
  interpretation of a spec rule, recorded here for the spec reconcile and
  the end-of-effort review, but it follows from the landed state machine
  rather than changing it.
