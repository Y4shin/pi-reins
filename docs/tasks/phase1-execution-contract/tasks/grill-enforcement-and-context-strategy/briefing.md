---
type: out-of-scope note
title: "Enforcement and Context Strategy: Surface Briefing"
status: stable
---
# Enforcement and Context Strategy: Surface Briefing

Decision briefing for `grill-enforcement-and-context-strategy` (plan.md
grilling surface 3). Each surface follows a fixed schema: what the
surface is, why we pursue it and toward which goal, which options the
evidence offers, and what we chose with the reasons against the
alternatives. Annotate freely; the annotations come back into the
grilling.

## The substrate: what Pi gives an extension

A pi-reins extension runs inside the agent loop and can hook a fixed
sequence of events:

```text
user prompt
  -> before_agent_start   (once per run: inject messages, modify the system prompt)
  -> per LLM call:        context (rewrite the outgoing message list, just for this call)
  -> per tool call:       tool_call (inspect, block, or rewrite BEFORE the tool runs)
  -> per tool result:     tool_result (modify the result the model sees)
  -> turn_end             (one turn done; you get the messages)
  -> agent_end            (run over, but retries/follow-ups may still come)
  -> agent_settled        (Pi will truly not continue by itself)
```

Beyond events, an extension can register custom tools (the `tw_*`
pattern), register user-typed commands, open UI dialogs that block until
the user answers, write a status line and a multi-line widget to the
screen, and append private session entries that survive restarts but
never enter the model's context.

The whole architecture is: which knob for which surface, and why.

## Surface 1: Steering summary injection

### What is this surface?

The per-turn salience of the execution contract to the model. plan.md
1.5: while execution is active, the plugin keeps the contract salient
with a compact summary (goal, active work, remaining, blocked), and it
must not repeatedly inject full plan contents.

### Why are we using it and what goal do we follow?

The contract only steers if the model actually holds it on the turn
where a decision happens. But the plugin's defining goal (plan.md,
grilling surface 3) is reliable steering with minimal context pollution:
a plugin that re-reads the plan into every turn slows every call and
trains the model to ignore boilerplate. The target is: always present,
minimal, never growing.

### What options do we have?

- Full plan re-injection per turn: kilotokens per call; explicitly what
  plan.md forbids.
- Persistent message per run (`before_agent_start` message; the shipped
  plan-mode pattern): documented and proven, but the message lands in
  the session and stays. Ten runs, ten summaries; a companion filter is
  needed, and compaction mangles them so they must be re-injected
  anyway.
- `context`-event tail injection: a documented event that fires before
  every LLM call and hands the extension the outgoing message list. The
  plugin appends a small synthetic message computed fresh from the plan
  directory. Because it is never written to the session, it cannot
  accumulate, is always current, and compaction cannot destroy it.
  Caveat: no shipped example appends here (plan-mode only filters), so
  the composition is unproven; cache behavior is unmeasured.
- System-prompt append: standing rules only; a byte-identical append
  keeps the provider's cached prompt prefix valid; cannot carry dynamic
  state without cache churn.
- `sendMessage`: persistent by design; only appropriate for events that
  belong in history.

### What did we choose and why?

A layered split: system-prompt append for the invariant rules
(byte-identical every run, so the cached prefix stays valid);
`context`-event tail injection for the dynamic summary (the only option
with zero accumulation and compaction immunity); `sendMessage` for
milestones (genuinely history-worthy).

Over the persistent-message option because accumulation is precisely
the pollution the goal forbids, and over full re-injection because
plan.md forbids it. The risk we carry: the tail injection is the one
unproven composition, with a documented fallback (persistent message
plus filter) at higher pollution cost. That risk is the spike decision
below.

## Surface 2: Premature completion

### What is this surface?

The reaction when the agent declares its work or the goal complete
while execution state says otherwise (plan.md 1.5; Phase 3 hardens it,
Phase 1 must already demonstrate it).

### Why are we using it and what goal do we follow?

plan.md: completion should emerge from the execution contract, not from
conversational momentum. If the model can just say done, durable state
stops being the authority and the plugin's premise collapses. Goal:
every completion claim is checked against durable state, and a wrong
one is refuted as cheaply as possible.

### What options do we have?

- Validated completion tool: declaring done becomes a tool call the
  plugin controls. Its execute reads the plan directory; if anything is
  pending, in_progress, or blocked it throws with the remaining-work
  list, which Pi reports back to the model in the same run. Only a
  clean check returns `terminate: true`, ending the run. Documented
  API, canonical shipped example.
- `agent_settled` backstop: when the run truly settles, compare durable
  state against what happened; if work remains, start a new run seeded
  with the pushback. Covers the model that just stops talking.
- Text heuristics (prior art only): scan assistant text for completion
  markers or count mutating tool calls.
- Named impossibility: Pi has no pre-stop hook; nothing fires at the
  moment the model decides to stop.

### What did we choose and why?

Completion tool primary, `agent_settled` backstop second. The tool gate
is the cheapest possible refutation (one tool round-trip inside the
same run, no new turn); the backstop closes the never-called-the-tool
hole. Not heuristics: we hold durable state, which is strictly better
evidence than guessing from text, and heuristics add false positives.
The residual (a model that stops without the tool is caught only
post-hoc) is a real limitation; the policy round asks you to accept or
escalate it.

## Surface 3: State synchronization

### What is this surface?

How task state transitions (start, complete, block, resume) become
durable and stay authoritative, per plan.md 1.3, without flooding
context.

### Why are we using it and what goal do we follow?

The plan directory is the single durable truth; if transitions happen
outside it, the plugin's steering is blind and progress is a guess. The
goal: plugin tools are the only write path, every transition is one
short confirmation in context, and reading state is on-demand.

### What options do we have?

- Write-path tools (`reins_task_start/complete/block/status`, the
  `tw_*` pattern): established at scale by task-workflow's 17
  production tools. Each transition is a tool call; each result is one
  line; reads are on demand.
- Let the model edit task files directly: no validation, no control,
  diffs in context, races with the plugin's view. Unacceptable.
- `tool_call` blocking of raw writes into the plan directory:
  documented examples (protected paths, permission gate); makes the
  tools genuinely the only path.
- Turn-end drift verification: re-scan and compare against observed
  transitions; catches indirect writes (bash heredocs, scripts).
- Plugin-private state via `appendEntry`: documented; survives
  restarts, never enters model context.

### What did we choose and why?

All four: tools + blocking + drift verification, with `appendEntry` for
gate and session state. None suffices alone: tools cannot stop bypass
attempts (blocking does), blocking cannot catch indirect writes (drift
verification does), and the layering means each mechanism covers the
next one's hole. Tools over prompt text for anything mutable is
task-workflow's production lesson and matches the minimal-footprint
goal.

## Surface 4: Gate blocking (plan-editing mode)

### What is this surface?

Enforcing plan.md 1.7's state distinction: after proposal approval,
execution pauses, the agent may edit the plan, and no implementation
work happens until the review gate passes.

### Why are we using it and what goal do we follow?

The two-gate protocol's integrity rests on this: the agent must not
keep implementing while the contract is being edited, and must not edit
the contract while implementing. plan.md's principle strong enforcement
where structure permits it applies here more than anywhere; this
surface should be enforced, not steered.

### What options do we have?

First, the constraint: Pi has no pause/resume primitive. Paused can
only be a plugin-internal state plus enforcement.

- Directional `tool_call` blocking: while executing, block writes into
  the plan directory; while plan-editing, block writes outside it.
  Always-on, works in every mode, and the block reason is itself
  steering.
- Tool-set swapping (`setActiveTools`): during plan-editing, remove
  `edit`/`write` from the schema so the model cannot even attempt them
  (plan-mode ships this exact pattern). Cost: swaps rebuild the tool
  list and can invalidate the cached prefix; acceptable for rare mode
  changes.
- `terminate` at gate transitions: end runs cleanly when a gate opens.

### What did we choose and why?

All three composed: blocking is the always-on floor (it works even
where swapping does not), swapping is the ergonomic layer for the rare
plan-editing mode (the model never sees a blocked attempt for removed
tools), and terminate gives clean run boundaries. Prior art pairs
blocking and swapping together. One open sub-question goes to the
replanning grilling: what happens to an in-flight tool batch when a
gate opens mid-run.

## Surface 5: Out-of-band plan changes

### What is this surface?

Detecting and reacting to plan-directory changes that did not come
through the plugin: the user's editor, another process, a stray
command.

### Why are we using it and what goal do we follow?

Silent out-of-band edits are the silent deviation the contract exists
to prevent. Phase 1 does not need full Phase 4 detection, but it needs
the floor: the plugin must know what it wrote versus what changed
behind it, and it must never silently continue over an unreconciled
change.

### What options do we have?

- Turn-boundary fingerprint: hash the contract-significant content at
  `before_agent_start` and compare. Deterministic, no watchers,
  platform-independent; reacts at the next boundary, not instantly.
- `fs.watch` from `session_start`: live detection, including while the
  agent is idle. The docs present it plainly; pi-subagents ships
  platform workarounds and a polling fallback because real watchers
  are unreliable.
- `user_bash`/`input` observation: sees only in-session `!` writes;
  blind to external editors.

### What did we choose and why?

Fingerprint as the mandatory floor, watcher as best-effort live
notification with the inherited polling fallback. Not the observation
hooks as a mechanism: they cover one narrow path the fingerprint
already covers. Reaction on detection: notify the user, steer the
model, hold a reconciliation gate; never silently continue.

## Surface 6: Approval and review interaction (the gates)

### What is this surface?

The three user gates: activation (plan.md 1.2), the proposal gate
(1.6), the review gate (1.8). Who can trigger what, and how the user
is asked.

### Why are we using it and what goal do we follow?

The two-gate protocol is the MVP's defining feature, and activation is
user-controlled by design. The goal: gates the model cannot bypass,
that block until the user answers, that keep the distinction between
approving an intent and approving concrete edits, and that degrade
safely when no UI exists.

### What options do we have?

- `ctx.ui` dialogs (confirm, select, input, editor): documented with
  shipped examples; block until answered; work over RPC via a
  documented sub-protocol; unavailable in print/JSON modes, where the
  documented pattern is fail-closed.
- Model-invoked gate tools: `reins_propose_change` and
  `reins_submit_revision`, whose execute opens the dialog, records the
  outcome, and terminates the run at the gate. Composition of
  documented APIs; the question-inside-a-tool pattern is shipped.
- User commands: `/reins-activate` and friends; bypass the agent
  entirely; the model cannot invoke them.
- Rich custom review UI (`ctx.ui.custom`): TUI-only, heavier; Phase 4's
  better-presentation territory.
- Crash semantics: the open gate is recorded via `appendEntry`; on
  restart the plugin reconciles against durable facts (accepted
  revision in `log.md` plus the `revision` frontmatter) and re-opens
  the gate if the transaction never completed.

### What did we choose and why?

Activation: user command plus confirm dialog over a plan preview
(user-controlled by design; the model must never be able to activate).
Proposal and review: gate tools running blocking dialogs, with
`terminate` and the surface 4 swaps, and `ui.editor` for rejection
guidance. Gates sit in tools because ours are model-initiated by
design; the dialog-in-tool gives the blocking semantics at the point of
action, which is where both prior-art paths converge. The rich review
UI is deliberately deferred to the replanning grilling's call.

## Surface 7: User-visible status

### What is this surface?

plan.md 1.4's visibility requirement: current goal, progress, active
work, remaining, blocked, paused, waiting, at low friction and always
visible.

### Why are we using it and what goal do we follow?

The user should never have to ask where things stand. And there is a
structural reason it matters here: the steering summary from surface 1
is invisible to the user by design (it never enters the transcript),
so this surface is its user-facing mirror. Goal: always visible, low
friction, zero model-context cost.

### What options do we have?

- `setStatus` footer line: one persistent line, e.g.
  `2/7 done | active: implement-loader | gate: review`. Documented with
  examples.
- `setWidget` multi-line block: goal, active, blocked, gate state,
  rendered next to the editor. Documented with examples.
- Interactive status pane: pi-subagents' fleet view also consumes raw
  terminal input via `ctx.ui.onTerminalInput`; that API exists in the
  shipped type declarations but is absent from the docs
  (establishment: undocumented).
- Notifications, session name, working indicator: documented,
  transient.
- Custom footer replacement: heavier and exclusive; not Phase 1.

### What did we choose and why?

Status line plus widget, updated from turn ends, plugin tool results,
and gate transitions, with notifications for events. Not the
interactive pane: depending on an undocumented API without needing it
is risk without payoff, and commands already cover interactivity. The
parallel-active-tasks question (map Fog) lands here as layout, not
mechanism.

## The cost budget

Per LLM call: roughly 300 fixed tokens (standing rules, tool
advertisements, summary tail). Per state transition: one short tool
result. Per milestone or pushback: one message. Zero plan dumps, zero
accumulating summaries, no derived state persisted. Under context
pressure the plugin can shrink the summary (`getContextUsage`), and
compaction gets custom instructions to preserve contract facts.

## Open items after this briefing

1. The injection spike: the `context`-event tail injection is the one
   composition without shipped-example proof. Accept as a risk with the
   documented fallback, or convert into a prototype task (the map's Fog
   anticipates one) covering injection safety, cache cost, pushback
   channel strength, and the summary content question.
2. Policy residuals: the pre-stop impossibility (accept as the Phase 1
   model or escalate upstream), the undocumented `onTerminalInput` (skip
   in Phase 1 or adopt), concurrent sessions on one plan directory
   (ignore and document, or attempt detection with no evidenced
   mechanism), and fail-closed gate behavior in non-UI modes (confirm).

## Q1

Adopt the mechanism set as written across the seven surfaces, then take
the open items one by one? Or push on any surface first.

## Amendments (2026-09-29, after the first annotation round)

- Injection: the standing-rules system-prompt layer is dropped; the
  invariant lines are the fixed header of the steering summary. The
  summary injects only during active execution, on every Nth LLM call
  (default 4, configurable), plus forced triggers (first call of a run,
  post-compaction, gate transitions, completion attempts,
  expected-declaration hits). Nothing is injected when no contract is
  active.
- Premature completion: two levels. Task level: `reins_task_complete`
  refuses illegal transitions and requires a non-empty
  `completionSummary`. Plan level: `reins_complete` is the simple
  remaining-work check. Plus semantic verification: pi-reins ships a
  fresh-context verifier agent run through pi-subagents at plan-level
  completion (completion contract plus change digest in, fulfilled or
  gap list out). pi-subagents is a hard dependency of pi-reins.
- New tool `reins_progress`: appends `{ at, note }` entries to the
  active task's `progressLog` frontmatter field; the widget shows the
  latest entry as the Now line; the full list is retained for audit; the
  summary nudges the agent to use it at meaningful steps.
- New optional task fields `expectedPathRegexes` and
  `expectedBashRegexes` (regexes over write targets and shell command
  lines; advisory, never permission): an out-of-declaration write or an
  unmatched command triggers an immediate steering nudge with a targeted
  note, overriding the cadence. Binding boundaries remain the Constraints
  sections.
- Status surface: the widget is the single surface; the status line is
  dropped.
