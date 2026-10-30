---
type: deviation report
title: Deviation report for activation
status: stable
---

## Deviation report: activation

Verified against `git diff task/activation..ticket/activation` (6
checkpoint commits, 8 files), the arch spec's per-ticket contract
(ticket 3) plus the As-built amendments from scaffold-plan-io and
attach-validation, and a direct read of every changed source and test
file. The independent lint/test re-run is the parallel slice-verifier's
duty in this chain; this report is the spec comparison.

### API surface changes

- **Planned:** the interface contract names the widget surface
  `renderWidget(state, scan)`.
  **Actual:** `renderWidget(deps, state, scan)` in `src/ui/widget.ts`;
  the deps port comes first because `setWidget` is reached through the
  UI port and deps injection is the package's one structural concession.
  **Impact:** no dependent exists yet, so nothing breaks, but
  task-lifecycle (widget content), renegotiation-session, and
  plan-editing-review will call it deps-first; the arch spec's
  As-built amendments should record the signature before the level-2
  chain dispatches.
- **Planned:** `requireUi` fail-closed guard in `ui/dialogs.ts`, no
  signature specified.
  **Actual:** `requireUi(deps, action): string | null`: null when an
  interactive UI exists, otherwise one error notification and the
  refusal report returned verbatim so the calling gate surfaces a
  single refusal instead of notifying twice.
  **Impact:** the shape every later gate (renegotiation sweep, review
  dialog, completion walkthrough) inherits; record it in the
  amendments.
- **Planned:** the activation flow behind `/reins-activate`; the
  layout's handlers/ list does not name a file for it.
  **Actual:** `activate(deps, state)` in the new
  `src/handlers/activate.ts`, returning
  `{ state, result: ActivateResult { ok, phase?, report } }`, mirroring
  the attach handler's shape (the handlers/attach.ts precedent already
  recorded).
  **Impact:** additive; the command report surface stays consistent
  with `AttachResult`.
- **Planned:** the acceptance write utilities existed only implicitly
  (ticket 11's contract expects "log entry plus status flip plus
  verified event" reuse).
  **Actual:** `src/plan/write.ts` now exports `LOG_FILE`,
  `prependLogEntry` (newest-first under ISO date headings, new date
  group above existing ones), `logHasEntry`, and `appendVerifiedEvent`
  (list append with bare-mapping normalization per OKF 0.2 5.2; the
  `human:` prefix applied at the write, exactly the pass-down the
  scaffold note assigned to this ticket).
  **Impact:** precisely the reuse surface ticket 11's contract names;
  no dependent breaks. Residual: the verified event and the Activation
  entry are adjacent writes in one call sequence, so a crash between
  them stays divergent until out-of-band-detection (ticket 8) exists.
- **Planned:** `deps.actor` was a scaffold placeholder (cwd repository,
  plain string, no prefix) with resolution passed down to activation.
  **Actual:** `resolveActor(options?.fsRoot ?? ctx.cwd)` resolves from
  the plan directory's repository with the cwd fallback (git email,
  else OS username, else "unknown"), and the prefix lands at the
  verified-event write.
  **Impact:** settles the recorded pass-down as planned; the harness
  actor stands in for the real resolution in tests.

### Abstraction usage

- Used/was specified: yes. `writeFields` (with `generated` stamping),
  `discoverPlanDir`/`PlanScan` (fresh rescan per invocation, no plan
  caching), the state machine's `attached -> executing` transition,
  harness dialog scripting (`uiScript.confirm`), and the attach
  handler's result shape were all used as specified. No YAML parser, no
  general Markdown parser, no widget render before activation, and no
  model-invocable activation path were introduced.

### Out-of-scope changes

- Harness substrate only: `createHarness`/`createUiStub` accept `hasUI`
  (default true) so gates exercise their no-UI degradation at the
  UI-port seam; the same superset pattern the attach-validation
  amendments recorded. No foreign test was edited and no planned
  surface broke.
- Otherwise none: the diff stays inside the planned surface
  (registration shell, plan write utilities, ui module, the activation
  handler, tests, harness).

### Ticket doc update needed?

Yes. The land-worker's implementation note should record: the
`renderWidget(deps, state, scan)` signature; the report-returning
`requireUi` shape; the `write.ts` acceptance-utility names ticket 11
reuses (`prependLogEntry`, `logHasEntry`, `appendVerifiedEvent`,
`LOG_FILE`); and that activation deliberately does not re-run
`validatePlan` between attach and activate (the only plan-level
refusal is an unreadable plan document; contract drift belongs to
out-of-band-detection, ticket 8).

### User attention needed?

No. No scope change and no dependent-breaking surface. The signature
deltas above are as-built amendments the level loop records in the arch
spec after this ticket lands; nothing needs a redesign decision from
the user.
