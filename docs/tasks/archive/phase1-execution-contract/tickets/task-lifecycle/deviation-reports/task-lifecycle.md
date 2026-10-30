---
type: deviation report
title: Deviation report for task-lifecycle
status: stable
---

## Deviation report: task-lifecycle

Verified against the diff `main...task/task-lifecycle` (13 checkpoint
commits, 7 files), the arch spec's per-ticket contract (ticket 4),
the shared sections (widget, naming, state machine), the as-built
amendments from the three landed tickets, and a direct read of every
changed source and test file. All five acceptance criteria are
satisfied at the agreed seams (tool boundary, synthetic tool_call
events, durable frontmatter, UI port); the deviations below are
recorded surface deltas, none dependent-breaking.

### API surface changes

- **Planned:** the tool_call guard blocks raw edit, write, and shell
  writes into the plan directory "while executing", with a reason
  naming the plugin tool. **Actual:** `guardPlanDirWrites` in
  `src/handlers/tool-call.ts` blocks whenever a contract is bound
  (planDir set), in every phase; the refusal names `reins_task_start`,
  `reins_task_complete`, `reins_task_block`, and `reins_progress`.
  **Impact:** follows arch-spec decision 3 ("raw writes into the plan
  directory are blocked in every state") over the contract text's
  "while executing", resolving the spec-internal conflict toward the
  stricter recorded decision; renegotiation-session, reconciling, and
  plan-editing inherit plan-directory blocking in gate phases with no
  extra work. No dependent named an executing-only guard.
- **Planned:** "`withFileMutationQueue` on plugin writes" as an export
  of this ticket. **Actual:** no plugin-local queue exists; every
  tool read-modify-write wraps in the pi runtime's own
  `withFileMutationQueue(filePath, fn)` from
  `@earendil-works/pi-coding-agent`, keyed by the task file's absolute
  path. **Impact:** stronger than specified (plugin writes serialize
  against the built-in edit and write tools too); later tickets
  writing into the plan directory should import the runtime symbol the
  same way. No dependent named a plugin-owned shape.
- **Planned:** `writeFields` as the scaffold landed it. **Actual:**
  `writeFields(deps, file, fields, opts?)` gained an optional
  `{ remove?: string[] }` parameter, because resume must delete
  `blockedReason` from the frontmatter rather than null it.
  **Impact:** additive; existing callers pass no opts and are
  unaffected.
- **Planned:** the interface contract names "`reins_status` internals
  expose the remaining-work listing the completion guard reuses".
  **Actual:** the structured surface is exported directly:
  `contractStatus(deps, state)` returns `ContractStatus { phase, goal,
  total, done, active, blocked, remaining, now }` and
  `formatStatus(status)` renders the one-line result.
  **Impact:** exactly the reuse surface completion-guard (ticket 7)
  needs; richer than the minimum, additive.
- **Planned:** the guard as "the composition point the nudge observer
  and the plan-editing inversion extend". **Actual:** the concrete
  extension surface is exported: `rawWriteTargets(event)` (edit/write
  path arguments plus best-effort shell file arguments) and
  `shellWriteTargets(command)` (redirections, write-command positional
  arguments, `dd of=`). **Impact:** expected-declaration-nudges
  (ticket 10) consumes `rawWriteTargets`; plan-editing-review
  (ticket 11) inverts the guard decision; both get a pure, testable
  surface.
- **Planned:** widget shows active work, Now line, counts.
  **Actual:** plus `latestProgress(scan)` and the `WidgetNow` type
  exported from `src/ui/widget.ts` as the shared Now-line derivation
  (also consumed by `contractStatus`). **Impact:** additive; the
  widget line order follows the arch spec's widget section (goal,
  Active, Now, counts, Blocked, Gate; empty sections omitted;
  proposal counts land with ticket 5 as planned).

### Abstraction usage

- Used/was specified: yes. Plan write utilities (`writeFields` with
  `generated` stamping on every plugin write), `discoverPlanDir` fresh
  rescan per invocation (no plan caching), `renderWidget(deps, state,
  scan)` deps-first per the activation amendment, the harness's
  `dispatchTool` and synthetic `tool_call` firing, and the tw_*
  one-line result shape as prior art. No second write path into task
  state exists (the tools plus the guard are the pair), no plan
  content is dumped in tool results (one-line results asserted), reads
  are never blocked, and no single-active-task assumption was made
  (active work is a list; two concurrent in_progress tasks tested).

### Out-of-scope changes

- `state.completionAttempted` was added to `ReinsState` with no
  behavior in this ticket; it is the interface contract's forward
  declaration (completion-guard sets it, steering-injection reads it),
  so contract-sanctioned rather than scope creep.
- Nothing else: the diff stays inside the planned surface (tools,
  guard handler, widget, state field, wiring, write-utility option,
  one test file). No foreign test was edited; no harness change was
  needed (the harness dispatches raw arguments, so the tools validate
  params at runtime, which matches how pi hands the model's arguments
  over).

### Ticket doc update needed?

Yes. The land-worker's implementation note should record: the
bound-state (not executing-only) guard scope and its decision-3
justification; the runtime `withFileMutationQueue` interpretation; the
`writeFields` remove option; the export surface tickets 7, 10, and 11
build on (`contractStatus.remaining`, `rawWriteTargets`,
`shellWriteTargets`, `latestProgress`); and the residual that the task
tools refuse during gate phases with the phase named
(renegotiation-session may need to widen that check).

### User attention needed?

No. No scope change and no dependent-breaking surface. The
guard-scope delta resolves a spec-internal conflict (contract text
"while executing" versus decision 3 "every state") in favor of the
recorded decision; recording it in the arch spec's as-built amendments
is mechanical and needs no redesign decision.
