---
type: spec
title: "Phase 1: the pi-reins execution contract plugin (core contract and two-gate replanning)"
status: stable
---

## Problem Statement

When an AI agent executes a multi-step plan inside pi, the user loses
sight of whether execution still matches what was agreed. The agent
drifts in predictable ways: it declares the goal complete while tasks
remain, it works from stale progress state, it silently skips tasks it
deems unnecessary, it expands scope without asking, and it redefines
agreed work while claiming to execute it. Todo lists and checklists are
advisory and degrade exactly when they matter most, because nothing
distinguishes the plan the user approved from the plan the agent is
actually following. When the plan does need to change, there is no
ritual: the agent improvises, and the user finds out after the fact.
The result is that the user either micromanages every step or accepts
silent divergence.

## Solution

pi-reins, a pi plugin that binds an externally produced plan (a plan
directory in the execution-plan format) into an enforceable execution
contract. The user attaches and validates the plan, then activates it
deliberately; from that moment the plugin keeps a compact, always-current
steering summary in front of the model, mediates every task-state
transition through validating tools, refuses premature completion
against durable state, records material deviations as visible change
proposals instead of allowing silent execution, and runs renegotiation
as batched user sessions with two distinct approvals (direction, then
concrete edits). Execution state lives only in the plan directory, the
user sees goal, progress, active work, and gate state in an always-on
widget, and enforcement is strong wherever structure permits it
(validated tools, blocked raw writes, gate boundaries) while remaining
conservative steering elsewhere. After a crash or restart, the durable
plan directory alone defines reality and execution resumes against it.

## User Stories

1. As the user, I want to attach a plan produced elsewhere and have the
   plugin validate it, so that I never bind execution to a malformed or
   insufficient plan.
2. As the user, I want a precise validation report when a plan is
   rejected, so that I can fix it without guessing what was wrong.
3. As the user, I want to activate a plan deliberately through a
   command with a plan preview and a confirmation, so that nothing
   executes merely because files exist.
4. As the user, I want goal, progress, active work, blocked work, and
   gate state always visible in one place, so that I never have to ask
   where things stand.
5. As the user, I want the agent's progress updates surfaced as they
   happen, so that I can follow the work without reading the
   transcript.
6. As the user, I want task transitions to be durable in the plan
   directory, so that crashes and restarts never lose progress.
7. As the user, I want the agent refused when it declares the plan
   complete while work remains, so that completion means what it says.
8. As the user, I want the refused agent to receive the remaining-work
   list, so that it self-corrects without me intervening.
9. As the user, I want material deviations recorded as visible
   proposals instead of performed silently, so that my understanding of
   the agreement is never quietly outdated.
10. As the user, I want recording a proposal to not interrupt the
    agent, so that visibility does not cost me momentum.
11. As the user, I want renegotiation deferred until it matters, so
    that I am not interrupted for every small observation the agent
    makes.
12. As the user, I want a renegotiation session to present all pending
    proposals at once, so that plan changes are handled in one
    efficient discussion.
13. As the user, I want to approve, defer, or reject each proposal, so
    that I control the plan's direction precisely.
14. As the user, I want execution to pause while the plan is being
    edited, so that contract editing and contract execution never
    mix.
15. As the user, I want to review the concrete revised plan before it
    binds, so that approving a direction can never bypass my review of
    the actual edits.
16. As the user, I want to reject a revision and have the agent revise
    again, so that the review gate has real force.
17. As the user, I want to abandon a renegotiation entirely, so that I
    can back out with the old contract intact and nothing half-applied.
18. As the user, I want a crash or restart to leave the durable plan
    directory authoritative, so that nothing half-approved ever applies
    and pending proposals survive.
19. As the user, I want out-of-band edits to the plan directory
    detected, so that nothing changes behind the plugin's back without
    a reaction.
20. As the user, I want deferred proposals to persist and resurface at
    later sessions and at the finish line, so that parking an idea
    never means losing it.
21. As the user, I want a completion walkthrough of remaining deferred
    items, so that a finished plan never graveyards good ideas without
    a persistent home.
22. As the user, I want the agent steered back when it drifts
    (premature completion, stale state, skipped tasks, silent scope
    expansion), so that alignment holds without me watching everything.
23. As the user, I want the steering to be compact and bounded, so
    that long sessions stay cheap and the agent is not nagged into
    degradation.
24. As the user, I want the plan directory to remain a self-contained
    OKF 0.2 bundle I can read and edit with ordinary tools, so that I
    am never locked in.
25. As the user, I want the contract's change history readable in the
    plan, so that I can audit how the agreement evolved and why.
26. As the user, I want human review recorded on the plan at activation
    and each accepted revision, so that trust signals are native to the
    artifact.
27. As the executing agent, I want to query contract and execution
    state through compact tools, so that I stay aligned without reading
    the whole plan.
28. As the executing agent, I want to record progress updates durably
    on the task, so that my narrative is visible and my completion
    claims carry a why-done trail.
29. As the executing agent, I want to record a change proposal when I
    notice necessary work, so that I never have to choose between
    silently exceeding my mandate and stalling.
30. As the executing agent, I want to trigger renegotiation when I
    judge it necessary, so that I am not forced to keep building on a
    premise I doubt.
31. As the executing agent, I want to mark a task blocked with a
    reason, so that the plan reflects reality instead of my optimism.
32. As the executing agent, I want to know exactly which writes are
    permitted in the current state, so that boundaries are mechanical
    refusals with reasons rather than guesses.
33. As an external planner, I want to produce plans in the documented
    execution-plan format, so that they execute without any
    pi-reins-specific authoring.
34. As an external planner, I want each task's binding sections
    (Description, Acceptance Criteria, Constraints) to be the agreed
    definition, so that completion is checkable against what I wrote.
35. As a generic OKF consumer, I want every plan directory to conform
    to OKF 0.2, so that the format stays interoperable with the
    knowledge-tooling ecosystem.
36. As a generic OKF consumer, I want execution-specific extensions to
    be additional keys and unregistered types, so that I can consume
    plan directories without understanding pi-reins.

## Implementation Decisions

- **Greenfield pi package.** The plugin is a new pi package: one
  extension registering the event handlers, tools, and commands
  described here, installed via the pi package mechanism.
- **Plan-directory module.** A single module owns reading, parsing,
  validating, and writing the plan directory exactly per the
  execution-plan directory contract as currently reconciled:
  `executionStatus` execution vocabulary on plan and task documents
  (OKF lifecycle `status` reserved for genuine lifecycle use), the
  three binding sections (Description, Acceptance Criteria,
  Constraints) under a literal `# Task` H1, change proposals as
  `type: Change Proposal` documents in `proposals/`, the
  `generated` and `verified` families, and the `log.md` conventions
  (closed bold-word vocabulary, Activation and Update entries, one
  Update per review-gate acceptance written together with its
  `verified` event). Validation implements the upstream hard rules,
  the documented OKF profile rules, and the binding-section rules, and
  runs at attach time; a failing plan is reported, never repaired or
  generated.
- **Derived state is never persisted.** Progress counts, phase-free
  summaries, staleness views, and gate state are recomputed from the
  plan directory and runtime; only the durable facts the contract
  defines are written.
- **State machine.** The renegotiation machine has five states:
  executing (zero or more pending proposals; the normal state),
  renegotiating (gate 1 over the entire pending set), plan-editing
  (only plan-directory writes), reviewing (gate 2 over the concrete
  revision), plus the abandon path back to executing with proposals
  left pending. Renegotiation triggers: a proposal bearing on the task
  currently being worked on or on the goal; work about to start
  entangled with a pending proposal; exhaustion of eligible agreed
  work with the set non-empty; deliberate opening by the agent (tool)
  or the user (slash command). Crash recovery: after restart the
  plugin resumes in executing; in-session state is gone; durable
  proposals survive; if durable facts show a review acceptance (log
  entry plus bumped revision), the accepted state is authoritative.
- **Write-path tools.** All task-state transitions go through plugin
  tools: start, complete (requires a non-empty completion summary),
  block (requires a reason), status query, progress recording
  (appends `{ at, note }` entries to the active task's `progressLog`),
  proposal recording (writes a change proposal document), plan-level
  completion, and deliberate renegotiation opening. Tool results are
  the compact on-demand read surface; no plan dump ever enters context
  through them.
- **Completion guard, two levels.** Task-level: completing a task
  requires a legal transition and a non-empty completion summary.
  Plan-level: completing the plan refuses while any task is pending,
  in_progress, or blocked, and while deferred proposals are unresolved
  (the completion walkthrough must run first). Refusals throw the
  remaining-work list back to the model in the same run.
- **Completion verification agent.** At plan-level completion, after
  the structural checks pass, the plugin invokes a shipped
  fresh-context verifier agent (no inherited parent context) with the
  completion contract and a change digest; the agent returns fulfilled
  or a gap list, and gaps are returned to the model as the tool error.
  pi-subagents is a hard dependency providing the agent runtime;
  pi-reins consumes but does not own subagent machinery.
- **Injection.** Exactly one injection point: the `context`-event tail.
  Nothing is injected when no contract is active. During active
  execution the summary is injected on every fourth LLM call
  (configurable) plus forced at the first call of a run, after
  compaction, at gate transitions, at completion attempts, and on
  expected-declaration hits. The summary is the minimal variant
  (prototype-measured at roughly 445 characters): the invariant header
  (remain within the agreed plan; material changes require user
  involvement), goal, counts, active work, blocked, gate state, the
  latest progress line, and the progress-recording instruction. The
  system prompt is never modified. (Defaults derived from the
  prototype: changing-tail injection measured safe for prefix caching
  and costing roughly 100-270 un-cached tokens per injected call.)
- **Premature-completion pushback.** When the run settles and durable
  state disagrees with completion, the plugin starts a new run seeded
  with the pushback via a real user-role message (`sendUserMessage`),
  which prototype testing showed reliably re-fires the agent loop;
  plain `sendMessage` proved fire-and-forget and is not used for
  pushback.
- **Expected-declaration nudges.** `expectedPathRegexes` and
  `expectedBashRegexes` on task documents are advisory: a write
  outside the declared path regexes, or a shell command matching none
  of the declared command regexes, triggers an immediate steering
  summary with a targeted note, overriding the cadence. They never
  block; the binding Constraints sections remain the only hard
  boundaries in Phase 1.
- **Enforcement hooks.** A `tool_call` hook blocks raw writes into the
  plan directory while executing (naming the plugin tool to use
  instead) and blocks writes outside the plan directory during
  plan-editing; the active tool set swaps edit and write out for the
  duration of plan-editing; runs terminate at gate boundaries. All
  gates degrade fail-closed: with no UI available, gates block rather
  than auto-approve, and notifications degrade to no-ops.
- **Gates.** Activation is a user command with a plan preview and a
  confirm dialog (the model can never activate). The renegotiation
  session presents each pending proposal (including its draft task
  content for additions) with approve, defer, or reject; the run is
  terminated at the gate. Plan-editing realizes approved intents
  (materialize additions, apply modifications, delete removals,
  maintain dispositions). The review gate presents the concrete
  revision as the difference between the pre-session snapshot and the
  post-edit state; acceptance bumps the revision, writes the log entry
  and `verified` event, and deletes applied proposal documents;
  rejection returns to plan-editing. Open gate state is recorded via
  private session entries and reconciled at session start.
- **Out-of-band change reaction.** At run boundaries the plugin
  fingerprints the contract-significant content of the plan directory
  (ephemeral, in-memory) and compares; a `session_start`-scoped file
  watcher with a polling fallback provides best-effort live
  notification. On detection: notify the user, steer the model, and
  hold a reconciliation gate rather than silently continuing.
- **Status surface.** A single always-visible widget below the editor:
  goal, active work, the latest progress line, done/total counts,
  blocked list, gate state, and pending and deferred proposal counts,
  updated on turn ends, plugin tool results, and gate transitions, and
  suspended and restored around compaction. No footer status line, no
  interactive status pane in Phase 1.
- **Completion walkthrough.** Plan completion requires every deferred
  proposal to end in a persistent disposition: folded into a
  user-designated durable location (typically the higher-level
  planning artifact, written by the agent) or consciously dropped. The
  plan cannot complete while deferred items are unresolved.
- **Testability structure.** Event handlers are implemented as
  importable functions with injected dependencies (event payloads, ui,
  filesystem root); pi registration is a thin shell over them. This is
  the one structural concession to testing and it sits at the highest
  seam below the live-agent boundary.
- **Accepted policy residuals.** There is no pre-stop hook: premature
  conclusion is caught at the completion tool or after settling, never
  pre-emptively. `onTerminalInput` is not used. Concurrent pi sessions
  on one plan directory are not coordinated and are documented as a
  known limitation. Semantic steering (drift detection beyond
  structure) is best-effort and labeled agent-judged.

## Testing Decisions

- **What makes a good test here:** assert external behavior only.
  Given a plan directory in a known state, a sequence of synthetic
  events, and scripted dialog answers, assert the handler outputs
  (the outgoing message list, block decisions with reasons, terminate
  flags, thrown refusal messages) and the durable file effects
  (frontmatter transitions, log entries, verified events, revision
  bumps, proposal deletion). Never assert internal call order,
  private module structure, or prompt strings beyond the summary's
  required content lines.
- **Primary seam: the extension event boundary, driven synthetically.**
  Load the extension in-process, drive its handlers with synthetic pi
  events against temporary plan directories, and stub the UI: dialogs
  answer from a script (this runs the three gates deterministically),
  and widget and notification calls are captured for assertion. No
  LLM and no network anywhere in this suite. This seam covers
  attach-time validation (including malformed plans of every rule
  class), the full task lifecycle through the tools, completion
  refusal and the remaining-work list, the renegotiation state machine
  end to end (record, trigger, session, plan-editing enforcement,
  review, acceptance effects, abandon), crash recovery via session
  start with leftover state, fingerprint detection of out-of-band
  edits, injection composition with cadence and forced triggers,
  expected-declaration nudges, and fail-closed behavior with a
  UI-less stub.
- **Secondary seam: live smoke through the pi CLI (manual, outside the
  default gate).** A handful of scripted non-interactive runs with the
  real extension and a fake plan, re-verifying the prototype-proven
  integration assumptions: the provider accepts the tail injection,
  the user-role pushback resumes work, and gates degrade fail-closed
  without UI. Provider-dependent and costed, so it runs before
  releases and on pi version bumps, not in CI.
- **Prior art:** the task-workflow test suite for a pi extension
  (plugin-level tests plus an integration directory) is the closest
  existing model for structure and conventions; the prototype's
  harness (extension loaded by path in print mode against a fake plan)
  is the proven template for the smoke seam.

## Out of Scope

- Everything the Phase 1 map deferred to later phases: task
  dependencies, phases, completion-semantics depth (acceptance-criteria
  surfacing, completion accounting), stronger change-awareness
  presentation, out-of-band detection deepening, semantic drift
  detection, interoperability tooling, and budget and schedule
  awareness.
- The three captured post-v1 feature maps (permission gates with
  ask-for-unlisted semantics, deeper subagent integration including
  parallel task execution and permission escalation, and the
  cross-agent dashboard).
- Parallel execution of tasks through subagents; multi-session
  coordination on one plan directory (documented limitation).
- Semantic drift steering beyond structural checks (later-phase,
  best-effort by design).
- Authoring, refining, or discovering plans: pi-reins consumes plans,
  it never plans.
- Publishing, packaging distribution, CI, and release mechanics.

## Further Notes

- Every decision in this spec traces to a recorded decision in the
  Phase 1 map (boundary D1-D7, OKF compliance O1-O4, enforcement
  E1-E10, replanning R1-R4) and to the two binding documents, which
  were amended during those grillings and are consistent with this
  spec: the phased plan's change-proposal and plan-editing sections,
  and the execution-plan directory contract including its Change
  Proposals, Generated and Verified, and OKF 0.2 Profile sections.
- The injection defaults, the pushback channel, and the summary
  variant are prototype-derived and measured, not guessed: the
  prototype artifact is preserved out of main on the
  `prototype-steering-injection-rescue` branch, and its findings
  document records ten named limitations (notably: post-compaction
  trigger never observed in testing, single provider and model,
  queued follow-ups and tree navigation unexercised). These are
  carried as documented risks; a cheap follow-up spike can close any
  that become load-bearing.
- The plugin owes pi-subagents a hard dependency for the completion
  verifier. This is a deliberate, recorded tension with the
  orthogonality principle: pi-reins consumes the subagent runtime but
  does not own or provide subagent orchestration.
- Naming for later phases: permission gates (Karen mode), subagent
  plan integration, and the agent dashboard are captured as draft maps
  and are explicitly not part of this spec.
