---
type: ticket
subtype: feature
title: User-controlled plan activation
status: stable
workflow_state: done
blocked_by:
- attach-validation
size: m
---

## What to build

The activation command: a plan preview and a confirmation dialog, and
on confirmation the proposed-to-active flip, the log Creation and
Activation entries, the first verified event (human actor from git
email, else the OS username), the plugin entering executing state, and
the minimal widget (goal and counts) appearing. Fail-closed when no UI
exists.

## Acceptance criteria

- [ ] The command shows a preview and requires confirmation;
      declining changes nothing durable.
- [ ] On confirm the plan is active, the log carries the Creation and
      Activation entries, and the plan carries a verified event with a
      human actor.
- [ ] The widget renders goal and counts after activation and nothing
      before.
- [ ] Without UI, activation blocks fail-closed rather than
      auto-approving.

## Blocked by

- `attach-validation` (validation must exist before a plan can be bound).

## Implementation notes

Landed from `ticket/activation` as a `--no-ff` merge (6 checkpoint
commits, deviation report committed alongside this note). Gate at
landing: typecheck clean and the full suite green (9 files, 53 tests,
including the live inert-load check against the real pi CLI). No
linter is configured in the repo yet, so the static gate is
`tsc --noEmit` only. Full deviation analysis lives in
`deviation-reports/activation.md`. Notes for downstream tickets:

- `renderWidget(deps, state, scan)` in `src/ui/widget.ts` takes the
  deps port first (the `setWidget` call goes through the UI port, and
  deps injection is the package's one structural concession); the arch
  spec's contract text names `renderWidget(state, scan)`, so the
  as-built amendments should record the signature before
  task-lifecycle, renegotiation-session, and plan-editing-review
  dispatch.
- `requireUi(deps, action): string | null` in `src/ui/dialogs.ts` is
  the fail-closed guard every later gate inherits: null when an
  interactive UI exists, otherwise one error notification whose
  refusal report is returned verbatim so the calling gate surfaces a
  single refusal instead of notifying twice.
- `src/plan/write.ts` now exports the acceptance write utilities
  plan-editing-review (ticket 11) reuses for Update and Completion
  records: `prependLogEntry` (newest-first under ISO date headings, new
  date group above existing ones), `logHasEntry`, `appendVerifiedEvent`
  (appends `human:<actor>` events, normalizing a bare single-event
  mapping per OKF 0.2 5.2, prefix applied at the write), and `LOG_FILE`.
- Activation deliberately does not re-run `validatePlan` between
  attach and activate; the only plan-level refusal is an unreadable
  plan document. Contract-drift detection between the two commands
  belongs to out-of-band-detection (ticket 8).
- `createRealDeps` resolves the verified-event actor via
  `resolveActor(options?.fsRoot ?? ctx.cwd)` (git email, else the OS
  username, else `unknown`) from the plan directory's repository with
  the cwd fallback; this settles the actor pass-down recorded in
  attach-validation's notes.
- Harness substrate: `createHarness`/`createUiStub` accept `hasUI`
  (default true) so gates exercise their no-UI degradation at the
  UI-port seam.
- Residual risks: a log whose first content lines are not the
  `# Plan Update Log` title still inserts relative to the first date
  heading, but entries under a leading non-date H2 would land below
  the new group (validation does not reject such logs yet); the
  verified event and the Activation log entry are adjacent writes in
  one call sequence, so a crash between them stays divergent until
  out-of-band detection (ticket 8) exists; `deps.now()` is sampled
  separately for the log date, the event `at`, and the `generated`
  stamp, so a midnight straddle during activation can split the dates
  (cosmetic).
