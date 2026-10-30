---
type: out-of-scope note
title: "Research: Pi's enforcement and interaction surface for pi-reins"
status: stable
---
# Research: Pi's enforcement and interaction surface for pi-reins

Task: `research-pi-enforcement-surface`. Date: 2026-09-29. This document
is the research artifact the task requires: for each of the seven Phase 1
enforcement and interaction requirements, which concrete Pi extension
mechanisms can support it, how they are invoked, what they guarantee and
cannot do, and how established they are. The decision it unblocks is
`grill-enforcement-and-context-strategy`, under the goal stated in
plan.md's Deliberate Grilling Surface 3: reliable steering with minimal
context pollution, without solving weak enforcement by dumping
increasingly large instructions into every turn.

No application code, spec, or task state was modified for this research.

## Sources and citation conventions

Primary and binding (the bundled pi-coding-agent 0.84.4 documentation
bundle, referenced below as `PI_ROOT`):

- `PI_ROOT` =
  `/nix/store/lvys4szjr1mqpqnrbkqhl7qkcl23mswc-pi-coding-agent-0.84.4/lib/node_modules/pi-monorepo`
- Docs cited from `PI_ROOT/docs/`: `extensions.md`, `sdk.md`, `tui.md`,
  `session-format.md`, `compaction.md`, `skills.md`, `rpc.md`,
  `packages.md`. Citations name the file and its section path, for
  example (extensions.md, "Tool Events" > tool_call).
- Working examples cited from `PI_ROOT/examples/extensions/` with exact
  file paths.
- One type-declaration citation from the shipped build output,
  `PI_ROOT/dist/core/extensions/types.d.ts`, used only to adjudicate a
  doc-versus-code gap (see section 8.1).

Prior art, informative (locally installed extensions, read as source):

- `TW` = task-workflow, `/home/pplattner/.pi/agent/git/github.com/Y4shin/skills/`
  (durable state, custom commands and tools)
- `PSA` = pi-subagents, `/home/pplattner/.pi/agent/npm/node_modules/pi-subagents/`
- `PT` = pi-telemetry, `/home/pplattner/.pi/agent/git/github.com/Y4shin/pi-telemetry/`
- `BG` = browser-goblin, `/home/pplattner/.pi/agent/npm/node_modules/browser-goblin/`

Binding context: `docs/plans/plan.md` (Phase 1 sections 1.1 through 1.8,
Deliberate Grilling Surfaces 2 and 3) and `docs/plans/plan-fs-contract.md`
(durable versus ephemeral state, derived state).

Establishment levels used throughout:

1. **Documented API**: described in a `PI_ROOT/docs/` page.
2. **Documented example**: a working implementation shipped under
   `PI_ROOT/examples/extensions/` and referenced from extensions.md's
   Examples Reference.
3. **Prior-art-only**: used by a locally installed extension but not
   shown in the shipped examples.
4. **Undocumented**: exists in the shipped type declarations or in prior
   art but absent from the docs; treat as unstable.

## 0. Shared foundations

Event lifecycle (extensions.md, "Events" > "Lifecycle Overview"), the
ordering every requirement depends on:

```text
user prompt
  -> input (intercept/transform/handle; extension commands bypass earlier)
  -> before_agent_start (inject message, modify system prompt)
  -> agent_start
  -> per turn: turn_start -> context -> provider hooks ->
     tool_execution_start -> tool_call (block) -> tool_result (modify)
     -> tool_execution_end -> turn_end
  -> agent_end (run over; retries or queued follow-ups may still follow)
  -> agent_settled (nothing will continue automatically)
```

Four context-injection surfaces exist, and they differ in persistence:
`before_agent_start` messages (stored in the session, sent to the LLM),
`context` event message rewrites (per LLM call, never stored),
`pi.sendMessage`/`pi.sendUserMessage` (new session entries, with
delivery modes), and system-prompt modification in `before_agent_start`
(per run, never stored). Two blocking surfaces exist: the `tool_call`
event (pre-execution) and the `input` event (pre-expansion). These are
elaborated per requirement below.

The fs-contract's split (plan-fs-contract.md, "Durable Versus Ephemeral
State") maps directly onto Pi's state surfaces: the plan directory is
the durable state; `pi.appendEntry` custom entries (session-format.md,
"Entry Types" > CustomEntry) survive restarts without entering LLM
context; in-memory state is recomputed at `session_start`.

## 1. Injecting compact execution context (the steering summary)

Requirement (plan.md 1.5): keep the contract salient each turn without
repeatedly injecting full plan contents.

### Mechanism A: `context` event rewrite (recommended for the dynamic part)

- **Invocation**: `pi.on("context", async (event) => ({ messages: [...event.messages, summaryMsg] }))`.
  The event fires before each LLM call; `event.messages` is a deep copy
  that is safe to modify (extensions.md, "Agent Events" > context).
- **Establishment**: documented API. The shipped plan-mode example
  uses this event to *filter* stale injections out
  (`PI_ROOT/examples/extensions/plan-mode/index.ts`, the
  `pi.on("context", ...)` handler filtering `plan-mode-context`
  messages), which proves the handler owns the outgoing message list.
  No shipped example *appends* a synthetic message; that composition is
  prior-art-free and needs the spike in section 9.
- **Guarantees**: the summary is present on every LLM call, always
  computed from current durable state, never written to the session
  file, immune to compaction by construction (it is recomputed after
  any compaction because it is not persisted at all), and cannot
  accumulate.
- **Cannot**: be seen by the user (it never enters the session, so the
  transcript never shows what the model was told; the status surface of
  requirement 7 must mirror it); survive other extensions' `context`
  handlers that filter messages (handlers run in load order); be placed
  arbitrarily (inserting between an assistant `toolCall` and its
  `toolResult` would violate message protocol; appending at the tail is
  the safe position).
- **Ordering and timing**: fires per LLM call, after `turn_start`, before
  provider request hooks. Mid-run compaction can happen between turns
  (compaction.md, "When It Triggers": the threshold is checked after
  tools finish, before the next assistant response); a `context`-injected
  summary is unaffected.
- **Context cost**: fixed per-request tokens (the summary itself), zero
  session growth. Tail position means the provider's cached prompt prefix
  is preserved when the summary is appended after stable history
  (cache behavior of this specific pattern is not documented; see
  section 9, spike 2).

### Mechanism B: `before_agent_start` message injection

- **Invocation**: return `{ message: { customType, content, display } }`
  from a `before_agent_start` handler; the message is persistent:
  stored in the session and sent to the LLM (extensions.md, "Agent
  Events" > before_agent_start).
- **Establishment**: documented API plus documented example
  (plan-mode/index.ts injects `[PLAN MODE ACTIVE]` and
  `[EXECUTING PLAN - ...]` this way, with `display: false`).
- **Guarantees**: arrives before the agent loop; visible in the
  transcript when `display: true`; survives in history so the model
  can refer back to it.
- **Cannot**: avoid accumulation. Each agent run that returns a message
  appends one more session entry; over a session this is one summary per
  user prompt, plus one per milestone. Stale summaries must be filtered
  by a companion `context` handler (exactly the plan-mode pattern).
  Compaction will eventually summarize them away, so the content must
  be re-injected anyway.
- **Ordering and timing**: fires once per submitted prompt (per agent
  run), not per LLM call; multi-turn tool loops inside one run do not
  re-trigger it.
- **Context cost**: one message per agent run; linear growth unless
  filtered; survives only as summarized text after compaction.

### Mechanism C: system-prompt modification

- **Invocation**: return `{ systemPrompt: event.systemPrompt + rules }`
  from `before_agent_start` (extensions.md, "Agent Events" >
  before_agent_start). `event.systemPromptOptions` exposes the
  structured inputs (selected tools, context files, skills) for
  informed changes.
- **Establishment**: documented API plus documented examples
  (`PI_ROOT/examples/extensions/pirate.ts`;
  `PI_ROOT/examples/extensions/claude-rules.ts`;
  `PI_ROOT/examples/extensions/prompt-customizer.ts`).
- **Guarantees**: instructions framed as standing rules, re-sent every
  request of the run, invisible to the transcript.
- **Cannot**: carry per-turn dynamic state cheaply. The system prompt
  sits at the head of the provider's cached prefix; changing it between
  runs invalidates that cache. extensions.md warns about exactly this
  in "Custom Tools" > "Dynamic Tool Loading" > "Fallback behavior":
  activating a tool with `promptSnippet` or `promptGuidelines` rebuilds
  the system prompt and that change can invalidate the prefix even on
  models with native deferred tool loading.
- **Context cost**: standing tokens on every request. A byte-identical
  append each run is cache-friendly; a changing append is not.

### Mechanism D: `pi.sendMessage` with delivery modes (milestone events)

- **Invocation**: `pi.sendMessage(msg, { deliverAs: "steer" | "followUp"
  | "nextTurn", triggerTurn?: true })` (extensions.md, "ExtensionAPI
  Methods" > pi.sendMessage). `pi.sendUserMessage` sends a real
  user-role message and always triggers a turn.
- **Establishment**: documented API plus documented examples
  (`PI_ROOT/examples/extensions/send-user-message.ts`;
  `PI_ROOT/examples/extensions/file-trigger.ts`).
- **Guarantees**: mid-run steering (`steer` lands after the current
  tool batch, before the next LLM call), end-of-run queuing
  (`followUp`), or passive queuing (`nextTurn`).
- **Cannot**: be ephemeral; every send is a session entry and context
  growth. Reserved for events that genuinely belong in history.

### Prior art

- Plan-mode (documented example) combines B with a `context` filter and
  injects a fresh execution summary per run, letting old ones accumulate
  during execution.
- task-workflow takes the opposite repetition strategy: it appends a
  guidelines listing to the system prompt once per session, sets a flag
  to not repeat, and re-enables injection only after compaction
  (`TW/src/pi.ts`: `shouldInjectGuidelines`, the `session_compact`
  handler setting it back to true, and the `before_agent_start`
  guidelines handler). Two shipped-grade extensions thus disagree on
  repetition strategy; the docs are silent.
- pi-subagents re-injects a "compaction is over, resume" custom message
  after manual compaction with `triggerTurn: true`
  (`PSA/src/extension/index.ts`, the `session_compact` handler).
- pi-subagents appends its advertised-agents block to the system prompt
  in `before_agent_start`, but only when the `subagent` tool is active
  (`PSA/src/extension/index.ts`, `pi.on("before_agent_start", ...)`
  using `event.systemPromptOptions.selectedTools`).

### Shortlist and recommendation

Recommend a layered design:

1. Standing contract rules (the "remain within the agreed plan;
   material changes require user involvement" invariant from plan.md
   1.5) via mechanism C, appended with byte-identical content on every
   run so the prompt prefix stays stable.
2. The compact dynamic steering summary (goal, active work, remaining
   count, blocked, gate state) via mechanism A, appended at the tail on
   every LLM call, recomputed from the plan directory.
3. Milestone transitions (task completed, gate opened or closed) via
   mechanism D, as history-worthy events only.

Rationale: this is the only combination with zero accumulation and
compaction immunity for the per-turn part, and it keeps the cacheable
prefix stable. Where mechanisms overlap (A and B both put text in front
of the model every turn), prior art favors B for one-shot instructions
(plan-mode, pirate) but B's accumulation is precisely the pollution
plan.md warns against; A with a B fallback (if spike 1 in section 9
fails) is the better default for the recurring summary.

## 2. Reacting when the agent tries to conclude prematurely

Requirement (plan.md 1.5): steer against premature completion; Phase 3
3.3 hardens this, but Phase 1 must already demonstrate the behavior.

### Mechanism A: completion must pass through a plugin tool (recommended)

- **Invocation**: register a completion tool (for example
  `reins_complete`) whose `execute` validates the durable plan
  directory (no pending, in-progress, or blocked tasks) and throws
  when work remains; return `terminate: true` only when the check
  passes (extensions.md, "Custom Tools" > "Tool Definition": a thrown
  error is caught, reported to the LLM with `isError: true`, and
  execution continues; `terminate: true` skips the follow-up LLM call
  when every finalized result in the batch terminates).
- **Establishment**: documented API plus documented example
  (`PI_ROOT/examples/extensions/structured-output.ts`, the canonical
  terminating-tool pattern).
- **Guarantees**: structural. The model's declaration of completion
  becomes a tool call the plugin controls; refusing it returns the
  remaining-work list to the model in the same run, so the pushback
  costs one tool round-trip and no new turn.
- **Cannot**: force the model to call the tool at all; a model that
  simply stops talking never reaches the gate. That residual is covered
  by mechanism B.

### Mechanism B: post-run verification and pushback

- **Invocation**: in `agent_settled` (or `agent_end`, as prior art does),
  compare durable state against the run's claims; if work remains,
  `pi.sendMessage({ ... }, { triggerTurn: true })` to start a new run
  with the pushback, or `pi.sendUserMessage(...)`. extensions.md,
  "Agent Events" > agent_start / agent_end / agent_settled: `agent_end`
  fires when the run ends but retries, auto-compaction, or queued
  follow-ups may still follow; `agent_settled` means Pi will not
  continue automatically, and `ctx.isIdle()` is true there.
- **Establishment**: documented API; the trigger-turn reaction is a
  documented example pattern (plan-mode/index.ts reacts in `agent_end`,
  detects completion, and sends follow-up messages).
- **Guarantees**: catches the model that stops without gating.
- **Cannot**: react *before* the model stops. There is no pre-stop hook
  in the documented event set; the earliest observable signal that a
  turn ended without tool calls is the finalized assistant message
  (`message_end`, `stopReason: "stop"`), and rewriting it via the
  documented `{ message }` return does not continue the run. A
  `message_end` handler that triggers a turn on `stopReason: "stop"`
  would need a loop guard. This is a genuine impossibility in the
  documented surface: premature-conclusion reaction is post-hoc or
  tool-mediated, never pre-emptive.

### Mechanism C: signal-level detection heuristics

- Prior art only: pi-subagents' completion guard
  (`PSA/src/runs/shared/completion-guard.ts`) computes
  expected-versus-attempted mutation: it classifies the task text
  (does this task expect implementation work?) and scans the messages
  for mutating tool calls; `triggered: expected && !attempted`. Plan-mode
  scans assistant text for `[DONE:n]` markers in `turn_end`
  (plan-mode/index.ts). Both are text heuristics; pi-reins has
  something strictly better, the durable task status in the plan
  directory, so the structural comparison should replace the heuristic.

### Ordering, timing, and cost

`agent_settled` fires once per settled run; reacting there with
`triggerTurn` starts a fresh run whose first LLM call sees the pushback
message and (via requirement 1) a current steering summary. Cost: one
message per pushback, no repetition when state is clean. Prior art
(pi-subagents goal continuation, plan-mode completion check) reacts in
`agent_end` and works; `agent_settled` is the documented-correct place
to avoid firing during auto-retry loops.

### Shortlist and recommendation

Primary: mechanism A (validated completion tool with `terminate`).
Secondary: mechanism B on `agent_settled` (pushback with
`triggerTurn`). Do not build mechanism C heuristics; the plan directory
is the structural truth. Where A and B overlap (both produce a
remaining-work message), A wins because it stays inside the same run
and costs no new turn.

## 3. Keeping task state synchronized

Requirement (plan.md 1.3): the agent inspects, starts, completes,
blocks, and resumes tasks; progress stays synchronized with the durable
plan directory, without flooding context.

### Mechanism A: custom tools as the only write path

- **Invocation**: `pi.registerTool` per operation (for example
  `reins_task_start`, `reins_task_complete`, `reins_task_block`,
  `reins_status`), reading and writing the plan directory's frontmatter
  exactly like task-workflow's `tw_*` tools
  (`TW/src/pi.ts`: `tw_set` writes frontmatter fields, `tw_state_set`
  writes the state pointers, `tw_frontier`/`tw_list` read the graph).
  `promptSnippet` adds a one-line entry to the system prompt's
  Available tools; `promptGuidelines` adds named bullets to Guidelines
  (extensions.md, "Custom Tools" and "ExtensionAPI Methods" >
  pi.registerTool). Tools that mutate files should use
  `withFileMutationQueue` (extensions.md, "Custom Tools", the
  withFileMutationQueue passage) to interoperate with built-in edit
  and write under parallel tool execution.
- **Establishment**: documented API; the tool-as-write-path pattern is
  established at scale by task-workflow's 17 `tw_*` tools.
- **Guarantees**: every transition the model performs is a tool call
  whose result text is the compact, on-demand read surface. The session
  never contains a dump of the plan; it contains short confirmations.
- **Cannot**: stop the model from editing task files with built-in
  tools; that needs the enforcement below.

### Mechanism B: block raw writes into the plan directory

- **Invocation**: a `tool_call` handler that blocks `edit` and `write`
  (and best-effort `bash`) calls targeting task-status files while
  execution is active, returning a reason that names the plugin tool to
  use instead. Documented example:
  `PI_ROOT/examples/extensions/protected-paths.ts` blocks write and
  edit on protected paths; `PI_ROOT/examples/extensions/permission-gate.ts`
  blocks dangerous bash after a confirm; plan-mode blocks non-allowlisted
  bash while plan mode is on. extensions.md, "Tool Events" > tool_call:
  can block, `event.input` is mutable, the reason reaches the model.
- **Guarantees**: pre-execution blocking with no partial side effects
  from the blocked call.
- **Cannot**: be airtight against indirect writes (a bash heredoc or a
  script the model writes elsewhere); plan.md's own principle applies:
  strong enforcement where structure permits, steering elsewhere.

### Mechanism C: drift verification and reconciliation

- **Invocation**: at `turn_end` or `agent_settled`, re-scan the plan
  directory and compare against the transitions observed this run; on
  drift (status changed without a plugin tool call), push back via the
  requirement 2 channel. `turn_end` provides the assistant message and
  tool results (extensions.md, "Agent Events" > turn_start / turn_end).
- **Establishment**: documented API; the rescan-and-restore pattern is
  prior art (plan-mode re-derives `[DONE:n]` completion state from
  session entries after resume; task-workflow recomputes the graph from
  disk on every tool invocation rather than caching).

### Mechanism D: plugin-private session state

- **Invocation**: `pi.appendEntry(customType, data)` for plugin state
  that must survive restarts without entering LLM context
  (extensions.md, "ExtensionAPI Methods" > pi.appendEntry;
  session-format.md, "Entry Types" > CustomEntry: does not participate
  in LLM context). Reconstruct in `session_start` by walking entries;
  tool-result `details` give branch-correct state for free
  (extensions.md, "State Management";
  `PI_ROOT/examples/extensions/todo.ts`).
- Prior art: plan-mode persists mode, todos, and execution flag and
  restores them (plan-mode/index.ts `persistState` and the
  `session_start` restore); browser-goblin persists session and
  preference overrides the same way (`BG/extensions/pi-browser/index.ts`,
  `browser-session`/`browser-headed` entries restored from
  `ctx.sessionManager.getBranch()`).

### Cost analysis

The model-visible footprint is: the tool advertisement (one
`promptSnippet` line and a couple of `promptGuidelines` bullets per
tool, static and cache-stable), one short result per state operation,
and whatever the steering summary carries. task-workflow demonstrates
the full pattern in production: no plan dump ever enters context unless
a tool is asked for it. pi-telemetry demonstrates the opposite extreme,
full event capture with zero context cost, because its SQLite writes
are entirely outside the LLM's view (`PT/index.ts` and
`PT/src/capture/`), confirming that out-of-band observation in an
extension is free of context pollution.

### Shortlist and recommendation

Adopt A (write-path tools) plus B (block raw writes to the plan
directory) plus C (turn-end drift verification). Keep plugin-internal
ephemeral state in D (appendEntry), never in the plan directory,
matching the fs-contract's ephemeral-state list (proposal approval
state, gate state, current-turn steering state). Prior-art overlap
resolution: where "teach the model the rules" (system prompt) and
"give the model tools" overlap, task-workflow favors tools for
anything mutable and reserves prompt text for the schema reference
(`tw_context` returns the frontmatter schema on demand); follow that.

## 4. Detecting execution while a gate is active (plan-editing mode)

Requirement (plan.md 1.7): after proposal approval, normal execution
pauses; the agent may modify the plan but must not resume
implementation work until the review gate passes.

### What "pausing" can mean in Pi

There is no pause or resume primitive in the documented extension
surface. The available controls are: block individual tool calls
pre-execution, swap the active tool set, end the run early
(`terminate`), or abort the run (`ctx.abort()`, extensions.md,
"ExtensionContext" > ctx.isIdle / ctx.abort / ctx.hasPendingMessages).
"Paused" is therefore a plugin-internal state enforced by blocking, not
a harness state.

### Mechanism A: gate state plus `tool_call` blocking (recommended)

- **Invocation**: keep the current gate in memory plus an `appendEntry`
  record; in `tool_call`, when a gate is active, block every mutating
  call that is not part of the permitted activity. Two directions:
  while plan-editing, block writes outside the plan directory (mirror
  of `protected-paths.ts` inverted); while executing or a proposal is
  pending, block writes into the plan directory (section 3 mechanism B).
- **Establishment**: documented API plus documented examples
  (protected-paths.ts, permission-gate.ts, plan-mode's bash allowlist).
- **Guarantees**: pre-execution, fail-safe; extensions.md "Error
  Handling": `tool_call` errors block the tool. The block reason
  reaches the model, which is itself the steering channel.
- **Cannot**: stop the model from thinking or talking; it can still
  produce text. It cannot perform the blocked mutation.
- **Ordering**: `tool_call` fires after `tool_execution_start` and
  before execution; in parallel tool mode siblings are preflighted
  sequentially and executed concurrently, and `tool_call` is not
  guaranteed to see sibling results from the same assistant message
  (extensions.md, "Tool Events" > tool_call), so gate checks must not
  depend on sibling results.

### Mechanism B: tool-set swapping

- **Invocation**: `pi.setActiveTools([...])` to disable mutation tools
  during plan-editing and restore them after review approval;
  extensions.md, "ExtensionAPI Methods" > pi.getActiveTools /
  pi.getAllTools / pi.setActiveTools. Documented example: plan-mode
  disables `edit`/`write` and swaps in read-only tools while plan mode
  is on (plan-mode/index.ts `enablePlanModeTools` /
  `restoreNormalModeTools`). Prior art: browser-goblin's tool profiles
  (`/browser-tools core|debug|all|off` via `setActiveTools`,
  `BG/extensions/pi-browser/index.ts`).
- **Guarantees**: mutation tools disappear from the schema, so the
  model cannot even attempt them; the block reason of mechanism A is
  never needed for the removed tools.
- **Cannot**: come free of cache cost: a non-additive active-set change
  rebuilds the tool list and can invalidate the provider's cached
  prefix (extensions.md, "Custom Tools" > "Dynamic Tool Loading" >
  "Fallback behavior": removals work but do not use deferred loading).
  Frequent swapping during a session would be expensive; entering and
  leaving plan-editing mode is rare enough that this is acceptable.

### Mechanism C: run termination at gate transitions

- **Invocation**: the proposal and review tools return `terminate:
  true` so the run ends cleanly at the gate; or `ctx.abort()` for a
  hard stop. Documented (structured-output.ts for `terminate`;
  ExtensionContext for abort).

### Non-UI modes

In print and JSON modes `ctx.hasUI` is false (extensions.md, "Mode
Behavior"); the permission-gate example's convention applies: when
there is no UI to confirm with, block by default. Gates therefore
degrade to fail-closed.

### Shortlist and recommendation

A as the always-on enforcement (works in every mode, no schema churn),
B as the ergonomic layer for the rare plan-editing mode (fewer blocked
calls, clearer signal), C to end runs at gate boundaries. Prior art
favors exactly this pairing (plan-mode uses A plus B together). The
impossibility to record: true pause/resume of an in-flight agent run
does not exist; "paused" must be modeled as blocking plus status
surfacing (requirement 7), and the grilling should define which
in-flight tool batches may complete when a gate opens mid-run.

## 5. Reacting to unexpected out-of-band changes to the plan directory

Requirement (plan.md 4.2 defers full detection to Phase 4, but Phase 1's
plan-editing mode already needs to notice plan-directory changes that
did not come through the plugin, and the task lists the mechanism).

### Mechanism A: fingerprint re-scan on turn boundaries (recommended)

- **Invocation**: at `before_agent_start` (and optionally `turn_start`),
  hash the contract-significant content of the plan directory
  (frontmatter fields and bodies per the fs-contract's
  "Contract-Significant Versus Execution-State Changes" split; an
  ephemeral canonical snapshot in memory, which the fs-contract
  explicitly permits) and compare with the expected digest.
- **Establishment**: the events are documented; the fingerprint
  pattern is prior-art-only in spirit (task-workflow rescans the whole
  tree on every tool invocation with a per-invocation memo,
  `TW/src/pi.ts` `scanMemo`; plan.md 4.2 itself suggests "ephemeral
  canonical state or fingerprints").
- **Guarantees**: deterministic detection of any change that persisted
  before the next turn; no watchers, no platform dependence.
- **Cannot**: detect changes mid-turn or react instantly.

### Mechanism B: `fs.watch` from `session_start`

- **Invocation**: start a directory watcher in `session_start`, clean
  it up in `session_shutdown`; on change, `ctx.ui.notify` plus
  `pi.sendMessage(..., { deliverAs: "steer", triggerTurn: true })` to
  inform the model, and flip the plugin into a reconciliation gate
  (block further mutations per requirement 4). Documented example:
  `PI_ROOT/examples/extensions/file-trigger.ts` watches a trigger file
  and injects its content with `triggerTurn: true`. The docs' placement
  rule (extensions.md, "Writing an Extension" > "Long-lived resources
  and shutdown": do not start file watchers in the factory; defer to
  `session_start`; register idempotent `session_shutdown` cleanup)
  applies.
- **Guarantees**: live detection, including changes made by the user's
  editor while the agent is idle or mid-run.
- **Cannot**: rely on `fs.watch` uniformly: prior art treats it as
  unreliable enough to need a fallback. pi-subagents'
  `PSA/src/shared/watch-strategy.ts` avoids native `fs.watch` on
  darwin, and `PSA/src/runs/background/result-watcher.ts` falls back
  to interval polling (an unref'd timer) whenever the native watcher
  errors, with restart-with-backoff. Record both behaviors: the docs
  present `fs.watch` plainly in the example, the prior art treats it
  as best-effort.
- **Ordering and timing**: watcher events arrive asynchronously,
  possibly mid-turn; a `steer` message lands after the current tool
  batch and before the next LLM call (extensions.md, pi.sendMessage
  delivery modes). Immediate mid-batch enforcement is only available
  through the `tool_call` gate.

### Mechanism C: `user_bash` and `input` observation

- **Invocation**: `user_bash` fires when the user runs `!` or `!!`
  commands and can intercept them (extensions.md, "User Bash Events"
  > user_bash); the `input` event sees raw user text before expansion
  (extensions.md, "Input Events" > input). A plan-directory write done
  via `!` can thus be noticed in-session.
- **Cannot**: see edits made outside Pi entirely (a different editor
  process); only the watcher (B) or the next re-scan (A) sees those.

### Shortlist and recommendation

A (turn-boundary fingerprint) as the mandatory floor, B (watcher plus
polling fallback, following pi-subagents' strategy) for live
notification. On detection: notify the user, steer the model, and hold
execution in a reconciliation gate rather than silently continuing;
plan.md 4.2 lists pause, warn, require reconciliation, or route through
the proposal/review mechanism, all of which are compositions of the
requirement 4 and 6 mechanisms. The detection-vs-reaction asymmetry to
record: live detection is best-effort (watcher), deterministic
detection is turn-boundary, and nothing in Pi guarantees atomic
plan-directory snapshots; the fingerprint must tolerate partially
written files.

## 6. Presenting approval and review interactions (the three gates)

Requirement (plan.md 1.2, 1.6, 1.8): user-controlled activation, the
proposal gate, and the concrete review gate.

### Mechanism A: `ctx.ui` dialogs (recommended core)

- **Invocation**: `ctx.ui.confirm(title, message)`, `ctx.ui.select(title,
  options)`, `ctx.ui.input`, `ctx.ui.editor`; optional `timeout`
  auto-dismiss with countdown; abortable via signal (extensions.md,
  "Custom UI" > "Dialogs" and "Timed Dialogs with Countdown").
- **Establishment**: documented API plus documented examples
  (permission-gate.ts confirms inside `tool_call`;
  plan-mode/index.ts selects "Execute the plan / Stay in plan mode /
  Refine the plan" inside `agent_end` and collects refinements with
  `ctx.ui.editor`; `PI_ROOT/examples/extensions/questionnaire.ts` is a
  multi-step wizard tool).
- **Guarantees**: the call blocks until the user answers; a dialog
  opened from a tool's `execute` blocks that tool mid-flight, which is
  exactly the semantics a gate needs. RPC mode translates dialogs into
  the `extension_ui_request` / `extension_ui_response` sub-protocol,
  so gates still work there (rpc.md, "Extension UI Protocol"; dialog
  methods block, fire-and-forget methods do not).
- **Cannot**: run in print or JSON mode (`ctx.hasUI` false, extensions.md
  "Mode Behavior"); render rich custom layouts outside TUI
  (`ctx.ui.custom` returns undefined in RPC). The fail-closed pattern
  from permission-gate.ts (block when there is no UI) is the documented
  degradation.

### Mechanism B: gate tools (model-initiated proposal and review)

- **Invocation**: register `reins_propose_change` and
  `reins_submit_revision` tools whose `execute` runs the dialog,
  records the outcome (`appendEntry` plus durable effects only on
  approval), returns `terminate: true` to end the run at the gate, and
  swaps tool sets to enter or leave plan-editing mode. Advertisement
  via `promptGuidelines` (extensions.md, "Custom Tools").
- **Establishment**: composition of documented APIs; the
  question-in-tool pattern is a documented example (question.ts,
  questionnaire.ts).
- **Guarantees**: the model can reach the gate on its own initiative
  (plan.md 1.6: the agent believes the plan needs to change, it must
  explicitly propose), and the gate state machine runs inside plugin
  code, not in prompt prose.
- **Cannot**: guarantee the model calls the gate tool instead of
  editing files directly; that is requirement 4's blocking job.

### Mechanism C: user-invoked commands

- **Invocation**: `pi.registerCommand("reins-activate", { handler })`
  with `getArgumentCompletions`; handlers receive
  `ExtensionCommandContext` with `ctx.waitForIdle()` for safe session
  mutation (extensions.md, "ExtensionCommandContext"). Prior art:
  task-workflow and browser-goblin are command-rich
  (`/browser-session`, `/browser-config` with completions,
  `BG/extensions/pi-browser/index.ts`).
- **Guarantees**: a user-controlled activation path (plan.md 1.2)
  independent of model initiative; commands bypass the agent entirely
  (extensions.md, "Input Events" > input processing order: extension
  commands are checked first).
- **Cannot**: be invoked by the model (commands are user-typed; the
  model reaches gates through tools).

### Mechanism D: rich review UI

- **Invocation**: `ctx.ui.custom(component)` for a full-screen review
  surface (TUI only), overlays with positioning (experimental),
  `setEditorText` to prefill rejection feedback; extensions.md
  "Custom UI" > "Custom Components" and "Overlay Mode (Experimental)";
  tui.md documents the component API and patterns (SelectList,
  SettingsList, BorderedLoader).
- **Establishment**: documented API plus examples (summarize.ts, qna.ts,
  overlay-qa-tests.ts). Prior art at scale: pi-subagents' fleet view.

### Waiting-state visibility

`ui_prompt_start` / `ui_prompt_end` fire around every blocking
extension UI prompt so status integrations can report "waiting for
user" (extensions.md, "Agent Events" > ui_prompt_start / ui_prompt_end).
This is the hook that makes a paused gate visible in the status surface
(requirement 7) without new machinery.

### Crash and restart semantics

plan.md's replanning grilling asks what happens if Pi exits mid-gate.
Mechanically: an `appendEntry` record of the open gate survives in the
session file; on `session_start` the plugin reconciles it against the
durable facts (an accepted revision must exist in `log.md` and the
`revision` frontmatter per the fs-contract) and re-opens the gate if
the transaction never completed. This is the plan-mode restore pattern
(plan-mode/index.ts `session_start`) applied to gate state, and it
keeps gate state ephemeral as the fs-contract requires.

### Shortlist and recommendation

Activation gate: mechanism C (user command) plus A (confirm dialog)
over a preview of the plan summary. Proposal gate and review gate:
mechanism B (tools) running mechanism A dialogs, with `terminate` and
tool-set swaps per requirement 4; `ui.editor` for rejection guidance.
Mechanism D only if the review proves unreadable as plain text;
plan.md's grilling surface 2 owns that call. Prior-art overlap: where
plan-mode used a post-run `agent_end` dialog to gate execution, and
browser-goblin used command-side confirms, both favor blocking dialogs
at the point of action; pi-reins should anchor gates in tools because
its gates are model-initiated by design.

## 7. Surfacing execution state to the user

Requirement (plan.md 1.4): current goal, progress, active work,
remaining, blocked, paused, waiting, at low friction, always visible.

### Mechanism A: footer status (recommended)

- **Invocation**: `ctx.ui.setStatus("pi-reins", text)`; persistent until
  cleared; shows in the footer/status bar (extensions.md, "Custom UI"
  > "Widgets, Status, and Footer"; tui.md Pattern 4). Works in RPC mode
  as fire-and-forget (rpc.md, "Extension UI Protocol").
- **Establishment**: documented API plus examples
  (`PI_ROOT/examples/extensions/status-line.ts`, plan-mode/index.ts
  `updateStatus`, `PI_ROOT/examples/extensions/model-status.ts`).
- **Guarantees**: one always-visible line; cheap; multiple extensions
  coexist by key.
- **Cannot**: carry more than a line of information.

### Mechanism B: widget above or below the editor (recommended)

- **Invocation**: `ctx.ui.setWidget("pi-reins", lines)` or a component
  factory, with `placement: "belowEditor"` (extensions.md, "Custom UI"
  > "Widgets, Status, and Footer"; tui.md Pattern 5; setWidget accepts
  string arrays or a `(tui, theme) => Component` factory per
  `PI_ROOT/dist/core/extensions/types.d.ts` lines 96-100).
- **Establishment**: documented API plus examples
  (plan-mode/index.ts renders its todo widget with completion ticks;
  `PI_ROOT/examples/extensions/widget-placement.ts`;
  `PI_ROOT/examples/extensions/todo.ts`).
- **Guarantees**: multi-line always-visible surface (goal, active task,
  counts, gate state) that lives directly next to the input.
- **Cannot**: receive keyboard input through any documented path; the
  documented interactive surface is `ctx.ui.custom`, which replaces the
  editor. Prior art works around this (see 8.1).

### Mechanism C: interactive status surface (prior-art-only)

- pi-subagents' fleet view is a `setWidget` component that also
  consumes raw terminal input via `ctx.ui.onTerminalInput`
  (`PSA/src/tui/fleet-status.ts`, the `ui.onTerminalInput((data) =>
  this.handleKey(data))` subscription around line 578, and
  `PSA/src/slash/slash-commands.ts` lines 645-667), giving an
  always-visible, keyboard-driven status pane. The API exists in the
  shipped declarations (`PI_ROOT/dist/core/extensions/types.d.ts`
  line 78: "Listen to raw terminal input (interactive mode only)")
  but is absent from extensions.md. Treat as undocumented prior-art
  mechanism; depending on it needs the user's call (section 9).

### Mechanism D: notifications, session name, working indicator

- `ctx.ui.notify(message, "info"|"warning"|"error")` for transient
  events (documented; notify.ts). `pi.setSessionName` labels the
  session in the selector (documented; session-name.ts). The working
  indicator and working message can be customized or hidden
  (extensions.md, "Custom UI"; working-indicator.ts). Prior art:
  pi-subagents suspends its widget during compaction and restores it
  after (`PSA/src/extension/index.ts`, `suspendWidgetsForCompaction` /
  `resumeWidgetsAfterCompaction` wired to `session_before_compact`,
  `agent_start`, and `agent_settled`), which pi-reins will need too,
  since compaction replaces the screen.

### Mechanism E: custom footer (escape hatch)

- `ctx.ui.setFooter(factory)` replaces the built-in footer with a
  component reading git branch and extension statuses
  (extensions.md, "Custom UI" > "Widgets, Status, and Footer";
  tui.md Pattern 6; custom-footer.ts). Heavier and exclusive; only if
  the default footer plus status keys prove insufficient.

### Shortlist and recommendation

A (status line: state machine snapshot, for example
`2/7 done | active: implement-loader | gate: review`) plus B (widget:
goal, active task, blocked list, updated on `turn_end`, `tool_result`
of plugin tools, and gate transitions). D for events. C only with the
user's explicit acceptance of an undocumented API; E not in Phase 1.
Prior-art overlap: plan-mode and pi-subagents both pair status plus
widget and update from session and tool events; follow that. The
map's Fog question about representing parallel-active tasks in the
status surface lands here: both A and B can list multiple active
tasks; the open sub-question is layout, not mechanism.

## 8. Cross-cutting findings

### 8.1 Doc-versus-prior-art disagreements

1. **`ctx.ui.onTerminalInput`**: present in the shipped type
   declarations (`PI_ROOT/dist/core/extensions/types.d.ts` line 78)
   and load-bearing for pi-subagents (fleet-status.ts,
   slash-commands.ts), but not documented in extensions.md. Prior art
   treats it as usable; the docs do not commit to it.
2. **System-prompt markup surgery**: task-workflow strips gated skills
   from the `<available_skills>` block by string surgery on the
   system prompt and warns when the block is missing
   (`TW/src/pi.ts`, `stripSkills`). skills.md documents that the
   system prompt lists skills in XML per the Agent Skills
   specification, but the wrapper markup is an implementation
   detail; depending on it is fragile, as task-workflow's own
   fallback warning admits. pi-reins should not parse system-prompt
   internals.
3. **Repetition strategy for injections**: plan-mode re-injects per
   agent run (accumulating during execution), task-workflow injects
   once per session and only re-injects after compaction. The docs
   describe both primitives without prescribing a strategy. See
   section 1's recommendation for how to resolve it.
4. **`fs.watch` reliability**: the file-trigger example presents
   `fs.watch` plainly; pi-subagents ships a platform strategy plus
   polling fallback plus watcher restart (watch-strategy.ts,
   result-watcher.ts). The docs' picture is optimistic; the prior
   art's is what holds up.
5. **Blocking dialogs in non-UI modes**: permission-gate.ts (docs
   example) blocks by default when `ctx.hasUI` is false; nothing in
   the prose states a policy. Prior art is consistently fail-closed;
   adopt that.

### 8.2 Context-pollution budget of the recommended design

Per-request fixed cost: standing rules (mechanism 1C, stable prefix),
tool advertisement lines (static while the active tool set is stable),
and the steering summary (1A, tail). Per-event cost: one short tool
result per state transition, one message per milestone or pushback.
Zero-growth guarantees: no plan dumps, no per-turn persistent summary,
recomputation instead of persisted derived state (matching
plan-fs-contract.md "Derived State"). `ctx.getContextUsage()`
(extensions.md, "ExtensionContext" > ctx.getContextUsage) lets the
plugin shrink the steering summary under context pressure, and
`session_before_compact` custom instructions (compaction.md, "Custom
Summarization via Extensions") can teach compaction to preserve the
contract facts.

### 8.3 Mode behavior

TUI: everything above. RPC: dialogs via sub-protocol, `custom` is
undefined, status and widgets fire-and-forget (rpc.md, "Extension UI
Protocol"; extensions.md, "Mode Behavior"). Print and JSON: no UI;
enforcement still works (tool_call blocking, tool gates), steering
still works (context injection), and the plugin should degrade
notifications to no-ops. A gate that cannot ask the user blocks
fail-closed.

### 8.4 Distribution and loading

pi-reins will be a pi package: a `pi` manifest in package.json
declaring `extensions` and `skills`, installed via `pi install`
(packages.md, "Creating a Pi Package" and "Install and Manage"). Auto-
discovered extension locations and `/reload` hot reloading are
documented (extensions.md, "Extension Locations"). Skills give the
human-typed entry points (skills.md: `/skill:name` commands,
`disable-model-invocation` for user-invoked-only skills), which is
where the activation flow's prose belongs if the command surface needs
more than dialogs.

## 9. Unresolved capability questions

Only a spike or the user can answer these; each is stated with its
decision impact.

1. **Spike: context-event injection safety.** Appending a synthetic
   custom message from the `context` handler on every LLM call is a
   documented-API composition no shipped example performs. Verify on
   Anthropic, OpenAI, and Google that a trailing custom message after
   a tool-result message is accepted and that nothing (retry,
   compaction recovery, tree navigation) chokes on it. Impact: if it
   fails, requirement 1 falls back to plan-mode's persistent-message
   pattern with context filtering, at higher pollution cost.
2. **Spike: cache behavior of tail injection.** Measure `cacheRead`
   tokens across turns for the context-event tail summary versus a
   persistent message. extensions.md's cache warning covers
   system-prompt and tool-list changes, not context-event rewrites.
   Impact: decides whether the dynamic summary can change every turn
   without paying full input cost.
3. **User/doc decision: `onTerminalInput`.** Is depending on an API
   that exists in the shipped types but not the docs acceptable for
   the Phase 1 status surface, or is the status-plus-widget pair
   enough? Impact: requirement 7's interactivity ceiling.
4. **User decision: pre-stop reaction is impossible.** There is no
   documented hook before the model's final stop; premature
   conclusion is handled tool-mediated plus post-hoc. Accept this as
   the Phase 1 enforcement model, or escalate to a feature request
   upstream. Impact: requirement 2's residual hole (a model that
   stops without calling the completion tool).
5. **Spike: pushback channel strength.** `pi.sendMessage` (custom
   message) versus `pi.sendUserMessage` (user-role message) for the
   agent_settled pushback: measure which one actually resumes work
   reliably across models. Prior art uses `sendMessage`
   (plan-mode, pi-subagents); plan.md's steering wording ("the plugin
   should steer against") does not settle it.
6. **Spike: watcher coverage.** Does an external editor edit to a
   plan-directory file reliably fire the watcher on this machine
   (Linux), and does the pi-subagents polling fallback behave under
   it? Impact: requirement 5's live-detection latency claim.
7. **User decision: concurrent sessions.** Pi has no locking primitive
   and the fs-contract permits multiple in-progress tasks; two pi
   sessions on one plan directory are uncoordinated. Decide whether
   Phase 1 ignores this, or the plugin detects a second session
   (how is unsolved; no mechanism in the docs).
8. **User decision: RPC/print gate policy.** Confirm fail-closed
   blocking (permission-gate pattern) is the intended behavior when
   no UI is available, rather than auto-approval or session-level
   bypass.
9. **Prototype question (already in the map's Fog): steering summary
   content and size.** Which fields (goal, active work, remaining,
   blocked, gate) at what size actually steer reliably is a
   behavioral question; the map already holds it as a candidate
   prototype decision for `grill-enforcement-and-context-strategy`.
10. **Spike: `before_agent_start` frequency for queued messages.**
    Confirm whether `before_agent_start` fires once per submitted
    prompt only (the lifecycle diagram implies it) or also for
    queued follow-ups, by logging the event during a followUp-driven
    run. Minor, but it decides whether 1C's standing rules are ever
    absent from a run.

## 10. Verdict against the evidence bar

The task's completion bar is a research artifact with, per
requirement, mechanisms with citations, guarantees and limits,
ordering and timing, context cost, a shortlist with recommendation,
overlap resolution, and unresolved questions. All seven requirements
have at least one documented-API mechanism with a working example or
established prior art:

1. Steering summary: `context` event injection plus stable
   system-prompt rules (documented API; composition needs spike 1).
2. Premature conclusion: validated completion tool with `terminate`
   plus `agent_settled` pushback (documented API, documented example).
3. State synchronization: `tw_*`-style tools plus `tool_call`
   blocking plus turn-end verification (documented API, strong prior
   art).
4. Gate-active enforcement: `tool_call` blocking plus
   `setActiveTools` swapping plus `terminate` (documented API,
   documented example); true pause does not exist and must be
   modeled.
5. Out-of-band plan changes: turn-boundary fingerprint plus
   `session_start`-scoped watcher with prior-art fallback (documented
   API, prior-art reliability lessons).
6. Approval and review interactions: `ctx.ui` dialogs from gate tools
   and commands, with RPC sub-protocol and fail-closed degradation
   (documented API, documented examples).
7. Execution-state surfacing: `setStatus` plus `setWidget` updated
   from turn and tool events (documented API, documented examples);
   interactive status needs an undocumented API (user decision).

No requirement is left without an evidenced mechanism, so the task
should not be marked blocked. The recommendation is to mark the task
done and hand this artifact to
`grill-enforcement-and-context-strategy`, with spikes 1, 2, and 5
called out as the evidence gaps the grilling should either accept as
risks or convert into the prototype task the map's Fog anticipates.
