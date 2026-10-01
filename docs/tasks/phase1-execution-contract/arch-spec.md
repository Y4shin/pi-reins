---
type: arch spec
title: "Phase 1 architecture spec (package, seams, per-ticket interface contracts)"
status: stable
---

# Shared architecture

## Package and toolchain

- TypeScript ESM package `pi-reins`, layout modeled on task-workflow (the
  spec's named prior art).
- `package.json`: `pi` manifest `{ "extensions": ["./src/pi.ts"] }`,
  keyword `pi-package`; scripts `test` (vitest run) and `typecheck`
  (tsc --noEmit). Runtime dependency: `yaml` only. peerDependencies:
  `@earendil-works/pi-coding-agent`, `pi-subagents`, `typebox`.
- Node built-ins for filesystem work. No other runtime dependencies.

## Layout

    src/
      pi.ts          registration shell: default export factory, thin wiring only
      deps.ts        ReinsDeps, FsPort, ReinsUi, SteeringPort, VerifierRunner
      config.ts      ReinsConfig (cadence 4, pushbackMax 2) and flag wiring
      state.ts       ReinsState machine (ephemeral)
      session.ts     private session entries (appendEntry) and reconcile
      plan/          fs.ts, parse.ts, discover.ts, write.ts, validate.ts,
                     fingerprint.ts (parse/discover/write land first)
      tools/         task.ts, propose.ts, renegotiate.ts, complete.ts, edit.ts
      handlers/      context.ts, tool-call.ts, agent-settled.ts, session.ts
      steering/      summary.ts, engine.ts
      ui/            widget.ts, dialogs.ts (requireUi fail-closed guard)
    agents/          verifier agent definition (registered at runtime)
    tests/
      harness/       createHarness, UI stubs, synthetic event firing
      fixtures/      plan-valid/ and the malformed-plan family

## Dependency injection (the one structural concession)

Every event handler and tool is an importable function over injected
dependencies; `src/pi.ts` only wires real adapters and registers.
`ReinsDeps` carries: `fs` (root-scoped FsPort), `ui` (dialogs, notify,
setWidget, hasUI), `now` (ISO 8601 clock), `actor` (human actor id:
git user.email of the plan directory's repository, else OS username),
`config`, `session` (appendEntry recorder), `messenger` (sendUserMessage,
steer), `toolset` (setActiveTools, getActiveTools), `steering`
(SteeringPort, no-op default), `verifier` (VerifierRunner).

## State machine (ephemeral, reconciled at session_start)

    detached -> attached (attach: validation passes, executionStatus: proposed)
    detached -> executing (attach of a plan whose executionStatus is already active)
    attached -> executing (activate: user confirmed)
    executing -> renegotiating (trigger fires)
    renegotiating -> plan-editing (at least one approved intent)
    renegotiating -> executing (sweep with no approval, or abandon)
    plan-editing -> reviewing (finish revision)
    plan-editing -> executing (abandon: restore pre-session snapshot)
    reviewing -> executing (accept: revision bump, log Update, verified event)
    reviewing -> plan-editing (reject)
    executing -> reconciling (out-of-band detection)
    reconciling -> executing (user reconciles)
    executing -> completed (verified plan completion)

Durable truth is the plan directory (executionStatus, revision, log,
proposals). Private session entries record the attached plan path and
open gate state so a crash-resumed session rebuilds; a fresh session
re-attaches via the command (documented Phase 1 model). Derived state
is never persisted.

## Naming

Commands: `/reins-attach <path>`, `/reins-activate`,
`/reins-renegotiate`. Tools: `reins_task_start`, `reins_task_complete`,
`reins_task_block`, `reins_status`, `reins_progress`,
`reins_propose_change`, `reins_renegotiate`, `reins_complete`; the
plan-editing set `reins_materialize_add`, `reins_edit_task`,
`reins_remove_task`, `reins_finish_revision`.

## Widget

Single surface: `ctx.ui.setWidget("pi-reins", lines)` with goal, active
work, the Now line (latest progressLog entry), done/total counts,
blocked list, gate state, pending and deferred proposal counts. Updated
on turn_end, plugin tool results, and gate transitions; suspended and
restored around compaction. No footer status line.

## Steering injection

Exactly one injection point: the `context`-event tail, a synthetic
`{ role: "custom", customType: "reins-steering", display: false }`
message appended after stable history. Cadence every Nth LLM call
(default 4, `--reins-cadence` flag), forced at the first call of a run,
after compaction, at gate transitions, at completion attempts, and on
expected-declaration hits. The system prompt is never modified and the
summary never persists into the session.

# Seams (the only boundaries under test)

1. The event-handler boundary: `create*Handler(deps)` driven with
   synthetic pi events; assert outgoing message lists, block decisions
   with reasons, terminate flags, and refusal messages.
2. The tool boundary: every `reins_*` tool called as the model would,
   through a harness dispatcher; assert one-line results and durable
   file effects.
3. The plan-directory module: discover/parse/validate/write against
   real temporary directories built from fixtures.
4. The UI port: scripted dialog answers (gates run deterministically),
   captured widget, status, and notification calls.

Rules: no LLM and no network anywhere in the suite; the verifier is
stubbed; never assert internal call order, private module structure, or
exact strings beyond the summary's required content lines. One
exception outside the default gate: the inert-load check
(`pi -p --no-extensions -e ./src/pi.ts` exits 0 with no errors and no
side effects; skipped when the pi binary is absent).

# Per-ticket contracts (dependency order)

## 1. scaffold-plan-io (size: l)

- Exports: `src/plan/discover.ts` `discoverPlanDir(fs, root)` returning
  `PlanScan` (plan document, task documents, proposal documents, log,
  supporting files, per-file `ParseFinding[]`); `parse.ts` document
  parsers (frontmatter plus binding-section extraction, findings never
  crashes); `write.ts` frontmatter field writes preserving bodies and
  stamping `generated`; `deps.ts` port types; `state.ts` machine;
  `tests/harness/createHarness({ planDir, uiScript, config })` with
  scripted dialogs, captured UI calls, temp plan dirs, event firing,
  and tool dispatch; `tests/fixtures/plan-valid/` (plan.md proposed,
  index.md, log.md, three tasks with binding sections, two carrying
  expectedPathRegexes/expectedBashRegexes, one well-formed change
  proposal, one supporting doc); toolchain and docs/testing.md plus
  docs/dev-env.md filled in.
- Existing abstractions: task-workflow layout and frontmatter
  round-trip as prior art; `yaml` package; pi documented examples.
- Do NOT reimplement: a YAML parser; a general Markdown parser
  (only `# Task` H1 plus H2 section extraction); any plan caching
  (rescan per invocation); the pi runtime (the shell stays thin).
- Seams: all four seams open here; plus the inert-load check.
- Interface contract: `PlanScan` with per-file findings feeds
  attach-validation; the harness and fixture family are the shared test
  substrate for every later ticket; `ReinsDeps` is the composition root
  all handlers and tools consume.

## 2. attach-validation (size: m)

- Exports: `src/plan/validate.ts` `validatePlan(scan)` returning every
  violation `{ file, rule, message }` (not only the first); the attach
  flow behind `/reins-attach <path>` (validate, report, bind on pass,
  record the path as a session entry); rule modules per class: upstream
  hard rules, OKF profile rules, binding sections, executionStatus
  vocabularies, id uniqueness, reserved filenames, log structure.
- Existing abstractions: `PlanScan`/`ParseFinding`; the fs-contract's
  OKF 0.2 Profile section as the rule source.
- Do NOT: repair or generate plan content; reject unrecognized
  frontmatter keys (OKF permits additional keys); validate Phase 2+
  structures.
- Seams: one malformed fixture per rule class; report completeness;
  refusal of missing/insufficient plans.
- Interface contract: `attach()` transitions to attached or executing
  and its `AttachResult` shape is the command's report surface;
  validation rule modules accept the proposal rules the
  change-proposals ticket adds.

## 3. activation (size: m)

- Exports: `/reins-activate` command flow: preview dialog (goal plus
  task summary), confirm; on confirm write executionStatus
  proposed-to-active, ensure a Creation entry exists then append the
  Activation entry, append the first `verified` event with the
  `human:` actor, enter executing, record the session entry, render the
  widget. `requireUi` fail-closed guard in `ui/dialogs.ts`.
- Existing abstractions: plan write utilities; harness dialog scripts.
- Do NOT: make activation model-invocable; render widget content
  before activation; duplicate a Creation entry an external planner
  already wrote.
- Seams: command flow with scripted confirm/decline; durable effects
  (flip, log entries, verified event); no-UI stub blocks fail-closed.
- Interface contract: `executing` state with the widget surface
  `renderWidget(state, scan)`; the `requireUi` pattern reused by every
  later gate.

## 4. task-lifecycle (size: l)

- Exports: tools `reins_task_start(taskId)` (legal from pending or
  blocked, clearing blockedReason: this is resume),
  `reins_task_complete(taskId, completionSummary)` (non-empty summary
  required), `reins_task_block(taskId, reason)` (reason required),
  `reins_status()` (compact view: active work, counts, blocked, gate
  state, Now line), `reins_progress(note, taskId?)` (taskId required
  when multiple tasks are in_progress; appends `{ at, note }` to the
  active task's progressLog); the tool_call guard blocking raw edit,
  write, and shell writes into the plan directory while executing,
  with a reason naming the plugin tool; `withFileMutationQueue` on
  plugin writes; `generated` stamping on every plugin write; widget
  shows active work, Now line, counts.
- Existing abstractions: plan write utilities; protected-paths.ts
  (documented blocking example); tw_* tool result shape as prior art.
- Do NOT: allow any second write path into task state; dump plan
  content in tool results; block reads; assume exactly one active task.
- Seams: tool boundary with legality refusals; blocking decisions on
  synthetic tool_call events; durable frontmatter transitions; two
  concurrent in_progress tasks.
- Interface contract: `reins_status` internals expose the
  remaining-work listing the completion guard reuses; the tool_call
  guard is the composition point the nudge observer and the
  plan-editing inversion extend; `state.completionAttempted` is the
  flag the steering engine reads.

## 5. change-proposals (size: m)

- Exports: `reins_propose_change` tool writing proposal documents
  under `proposals/` per the fs-contract (kind add/modify/remove,
  target required and resolvable for modify and remove, rationale in
  the body, additions carrying draft id, title, and binding sections,
  optional dependsOn/enables); recording-time validation refusing
  unknown kinds and unresolvable targets; attach-time validation
  extended with proposal well-formedness; widget counts pending
  proposals.
- Existing abstractions: document creation utilities; validation rule
  modules.
- Do NOT: make proposals execution-eligible (discovery already
  separates `type: Change Proposal` from `type: Task`); execute or
  apply anything at recording time.
- Seams: tool boundary; malformed refusals; attach-time acceptance of
  well-formed proposals/; widget count.
- Interface contract: the proposal store exposes `pending()`,
  `deferred()`, and `bearingOn(taskId)` (target equals taskId, or
  taskId appears in dependsOn/enables) for the renegotiation triggers.

## 6. steering-injection (size: m)

- Exports: `src/steering/summary.ts` `composeSummary(state, scan)`
  (minimal measured variant: invariant header, goal, counts, active
  work, blocked, gate state, latest progress line, progress-recording
  instruction, target roughly 445 characters);
  `src/steering/engine.ts` cadence and forced-trigger decisions
  (first call of run, every Nth call, post-compaction flag from the
  session_compact handler, gate transitions, completion attempts via
  the state flag, expected-declaration hits via `SteeringPort`);
  the context handler appending the custom message at the tail;
  `--reins-cadence` flag wiring (default 4).
- Existing abstractions: prototype findings (variant, defaults);
  plan-mode example (context ownership); `state.completionAttempted`.
- Do NOT: modify the system prompt; persist summaries; inject in
  detached or attached states; accumulate anything in the session.
- Seams: context handler in/out assertions (untouched without an
  active contract; cadence; forced triggers override); content lines
  (header, instruction) not exact strings.
- Interface contract: `SteeringPort.forceInject(reason, note?)` is the
  single override entry point the nudge ticket calls; gate-transition
  forcing is called by the renegotiation machinery; the summary
  composer is the model for the widget's shared inputs.

## 7. completion-guard (size: m)

- Exports: `reins_complete()` refusing with the remaining-work list
  while any task is pending, in_progress, or blocked (isError result,
  run continues); the `agent_settled` backstop: with an active,
  incomplete contract, a settled run triggers a corrective run seeded
  by `sendUserMessage` listing remaining work, chain capped at
  pushbackMax (default 2), counter reset by a user-submitted prompt;
  the tool sets `state.completionAttempted` (forcing injection).
- Existing abstractions: remaining-work listing from the status
  internals; messenger port; SteeringPort.
- Do NOT: use text heuristics on assistant messages; react in
  agent_end (retries may follow); fire when state is clean or no
  contract is active.
- Seams: tool boundary refusals; synthetic agent_settled events
  (pushback fires, channel is the user-role message, clean state fires
  nothing).
- Interface contract: `reins_complete` refusal shape is the gap-list
  channel plan-completion extends; the pushback chain counter lives in
  state and resets on user prompts.

## 8. out-of-band-detection (size: l)

- Exports: `src/plan/fingerprint.ts` `fingerprintContract(scan)`
  (canonical hash over contract-significant content only, per the
  fs-contract split: never executionStatus, blockedReason,
  completionSummary, progressLog, or proposals; unparseable files are
  hashed by raw content so partial writes are detected, never crash)
  and `snapshotPlanDir(fs, root)` (in-memory file map); the
  session_start-scoped watcher (fs.watch plus polling fallback with
  unref'd timers, session_shutdown cleanup); turn-boundary comparison
  plus turn-end drift verification against observed plugin writes; the
  reaction: notify the user, steer the model, enter reconciling (the
  tool_call guard blocks mutations), reconciliation dialog resumes
  executing on accept.
- Existing abstractions: file-trigger.ts (watcher example);
  pi-subagents watch-strategy (fallback prior art); the tool_call
  guard; PlanScan.
- Do NOT: persist fingerprints or snapshots (ephemeral by contract);
  block reads; treat plugin-mediated plan-editing writes as
  out-of-band.
- Seams: hand edits between fired runs detected at the boundary;
  watcher plus fallback behavior; reconciliation gate; partial-write
  tolerance.
- Interface contract: `snapshotPlanDir` is reused by
  plan-editing-review for the pre-session snapshot, the review diff,
  and the abandon restore.

## 9. renegotiation-session (size: l)

- Exports: trigger evaluation `shouldOpenSession(state, scan, cause)`:
  current-work bearing (a non-deferred proposal bearing on an
  in_progress task), imminent-work entanglement (at task start, a
  non-deferred proposal bearing on that task), exhaustion (nothing
  startable, at least one non-deferred proposal pending), and
  initiative (the `reins_renegotiate` tool and the
  `/reins-renegotiate` command); the session: terminate the run at the
  gate (current task stays in_progress), take the pre-session snapshot,
  present every pending proposal including deferred ones with its
  rationale and, for additions, draft content, one blocking
  approve/defer/reject dialog per proposal, fail-closed without UI;
  apply dispositions when the sweep completes (deferred markers set,
  rejected proposals deleted), enter plan-editing on any approval,
  otherwise return to executing.
- Existing abstractions: proposal store and bearing predicates;
  requireUi; snapshotPlanDir; SteeringPort gate-transition trigger;
  widget renderer.
- Do NOT: open a session for deferred-only sets on their own; delete
  rejected proposals when the user abandons mid-session; let the model
  bypass the gate.
- Seams: each trigger driven synthetically; scripted dispositions;
  run-termination flag; durable disposition effects; fail-closed
  no-UI.
- Interface contract: the session result carries the approved-intent
  list (proposal ids by kind and target) plus the snapshot handle that
  plan-editing-review consumes; entering plan-editing performs the
  tool-set swap.

## 10. expected-declaration-nudges (size: s)

- Exports: the tool_call observation leg: extract write targets (path
  arguments of edit and write plus best-effort file arguments of shell
  commands) and command lines; match against the union of the active
  tasks' `expectedPathRegexes` and `expectedBashRegexes`; on no match
  call `forceInject("expected-declaration", note)` with a targeted
  note naming the deviation.
- Existing abstractions: the tool_call handler composition point;
  SteeringPort.
- Do NOT: block or rewrite the call; treat the lists as permission;
  trigger for tasks without the fields.
- Seams: synthetic tool_call events with declared and undeclared
  writes and commands; forced injection regardless of cadence; the
  write always proceeds.
- Interface contract: none forward; the note wording convention
  matches the summary's.

## 11. plan-editing-review (size: xl)

- Exports: plan-editing tools gated on approved intents:
  `reins_materialize_add(proposalId)` (creates the task document from
  the draft: id, title, binding sections, executionStatus pending,
  next numeric prefix, `generated` stamp), `reins_edit_task(taskId,
  { title?, description?, acceptanceCriteria?, constraints? })`
  (requires an approved modify intent on that task; frontmatter
  extensions beyond executionStatus stay out of Phase 1 editing),
  `reins_remove_task(taskId)` (requires an approved remove intent);
  `reins_finish_revision()` entering reviewing; the review dialog
  presenting the concrete diff between the pre-session snapshot and
  the current state (added, removed, and changed tasks with
  binding-section diffs) with accept, reject (returns to
  plan-editing), and abandon (restores the snapshot, proposals stay
  pending, return to executing); acceptance bumps the revision and
  writes the log Update entry together with the `verified` event by
  the same writer, deletes applied proposal documents, restores the
  tool set; enforcement: entering plan-editing swaps edit and write
  out of the active tool set, the tool_call guard inverts to block
  writes outside the plan directory (raw writes into the plan
  directory remain blocked in every state); crash recovery at
  session_start: leftover gate records resume in executing, a durable
  review acceptance (log Update plus bumped revision) is honored,
  pending proposals survive, and on-disk content is authoritative
  (materialized-but-unaccepted content surviving a crash is a
  documented residual; materialization refuses duplicate ids so a
  re-run session stays safe).
- Existing abstractions: snapshotPlanDir and diff; setActiveTools;
  write utilities for revision, log, and verified events; requireUi;
  proposal dispositions.
- Do NOT: persist the snapshot or diff (the fs-contract lists the
  temporary plan diff as ephemeral); leave edit and write reachable
  during plan-editing; auto-accept anything after a crash.
- Seams: the blocking matrix (outside writes blocked, edit and write
  absent from the schema), materialization file effects, diff
  presentation inputs, accept effects, reject loop, abandon restore,
  crash-recovery reconcile from leftover session entries.
- Interface contract: the acceptance write utilities (log entry plus
  status flip plus verified event) are reused for the Completion entry.

## 12. plan-completion (size: l)

- Exports: the full `reins_complete` path: structural guard, then the
  deferred walkthrough (for each deferred proposal: a blocking
  fold-or-drop dialog; fold designates a durable target location and
  the tool returns the fold instruction for the agent to write with
  its normal tools outside the plan directory; drops are immediate),
  outstanding folds verified structurally on the next attempt and the
  dispositioned proposal documents deleted; then the completion
  verifier: a fresh-context agent registered at session_start through
  pi-subagents' runtime agent registration event (`reins-completion-
  verifier`) and run through the in-process RPC spawn, receiving the
  completion contract (goal, per-task binding sections and completion
  summaries) and a change digest (accepted revisions from the log),
  returning fulfilled or a gap list, with gaps returned to the model
  as the refusal; on success the log Completion entry is written and
  the plan flips to completed; pi-subagents absence fails visibly at
  session_start (notification plus widget marker) and completion
  refuses with a named error.
- Existing abstractions: VerifierRunner port (stubbed in the harness);
  acceptance write utilities; requireUi; dialog mechanics from the
  session.
- Do NOT: mark tasks done; complete while deferred items are
  unresolved; silently skip verification when the runtime is absent.
- Seams: walkthrough dialogs scripted; verifier stubbed (fulfilled and
  gap cases); durable effects (Completion entry, completed flip,
  proposal deletions); visible failure without the runtime.

# Within-level ordering

Level 4 tickets are order-independent by construction: the
SteeringPort default is a no-op, so completion-guard can land before
steering-injection (its completion-attempt trigger is a state flag the
engine reads) and out-of-band-detection can land independently.
Recommended order if available: change-proposals, steering-injection,
completion-guard, out-of-band-detection.

# As-built amendments (recorded after each landed ticket)

## After scaffold-plan-io (level 0)

The landed surface for later tickets to consume (deviation report:
no planned API surface broke a dependent):

- Parsing is one generic `parseDoc` plus `extractBindingSections`,
  composed at the discover site; there are no per-kind parser
  functions. Consume `PlanScan` (it also carries the scan `root`).
- Finding rules shipped: `unparseable-frontmatter`,
  `frontmatter-not-mapping`, `missing-frontmatter`, `missing-type`,
  `missing-task-heading`, `missing-plan-root`, `unreadable-file`,
  `missing-plan-document`. The malformed fixture family grows by one
  directory per validation rule class (no inline fixture strings).
- `writeFields` throws on unparseable frontmatter (callers surface it
  as a tool error) and re-serializes frontmatter: YAML comments and
  non-semantic formatting are lost, bodies preserved verbatim.
- `deps.actor` is a scaffold placeholder: resolved eagerly from the
  session cwd repository, a plain string without the `human:` prefix.
  attach-validation revisits resolution when the plan directory lives
  outside the cwd repository; activation owns applying the `human:`
  prefix at the verified-event write, per the fs-contract.
- The real FsPort is rooted at `ctx.cwd` until attach owns the plan
  path (the harness roots it at the temp plan dir). The real
  VerifierRunner refuses visibly until plan-completion lands; the port
  shape is fixed: `VerifierRequest { contract, changeDigest }` to
  `VerifierResult { fulfilled, gaps }`.
- The harness is a superset of the planned surface: `createHarness`
  also takes `now` and `verifier`, and exposes `fire`, `dispatchTool`
  (thrown refusals become isError outcomes exactly as pi reports
  them), `runCommand`, and recorder ports; it wires the real
  `registerReins` over a fake ExtensionAPI, so tests exercise the
  same registration path pi uses.
- `src/handlers/session.ts` and `src/plan/fs.ts` exist in the shared
  layout beyond the scaffold ticket's export list.

# Decisions taken in this spec (flagged for review)

1. Attach and activate are two user commands; the plan path is
   remembered via private session entries, so a fresh session
   re-attaches (the plan directory remains the authority on state).
2. The settled backstop fires whenever an active, incomplete contract
   settles (chain capped at 2, reset by a user prompt), not only after
   an explicit completion attempt; this follows the spec decision text
   ("when the run settles and durable state disagrees with
   completion").
3. Plan-editing materialization goes through plugin tools
   (`reins_materialize_add`, `reins_edit_task`, `reins_remove_task`);
   edit and write are absent from the schema during plan-editing, and
   raw writes into the plan directory are blocked in every state.
4. Crash mid-plan-editing leaves on-disk content authoritative with
   proposals still pending (the fs-contract's durable-state rule,
   accepted as a documented residual).
5. Deferred folds are verified structurally (the designated target
   exists); the verifier is an LLM judgment by design.
6. Sizes are recommendations; after approval they are set on ticket
   frontmatter so the pipeline budgets match the work.
