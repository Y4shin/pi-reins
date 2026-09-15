# pi-reins

The domain glossary for pi-reins, a Pi plugin that binds an externally
produced plan into an enforceable execution contract and keeps the user
and agent aligned while it is executed. Definitions state what a term IS,
not what it does.

## Language

### The agreement

**Execution contract**:
The agreed plan in its binding form: goal, tasks, phases, dependencies,
and budgets, together with the rule that the agent executes and reports
while material changes require user involvement.
_Avoid_: plan (when binding is meant), todo list, backlog

**Plan**:
The externally produced input that becomes an execution contract once the
user activates it. pi-reins never produces or refines plans.
_Avoid_: project, roadmap, spec

**Material change**:
A change that would alter the user's reasonable understanding of what
the agent agreed to do. The boundary for when user involvement is
required.
_Avoid_: deviation (ordinary implementation freedom is not one)

**Execution freedom**:
The agent's autonomy in how it performs agreed work, as distinct from
any authority over what that work is.

### The artifact

**Plan directory**:
The complete durable representation of an execution contract: a
self-contained OKF 0.2 bundle holding the `plan.md` plan document, task
documents, phase directories, the bundle `index.md`, and `log.md`.
Interchange format with external planning systems.
_Avoid_: state store, database

**Task**:
An executable unit of the contract, declared by OKF Markdown with
`type: Task`. Identity is the semantic `id`, never the file path or
numeric prefix.
_Avoid_: ticket, issue, story

**Phase**:
An aggregation node over its tasks, declared by a `phase.md` in its
directory. Provides execution context and visibility; never an
independently estimated work item.
_Avoid_: milestone, stage, epic

**Dependency**:
An execution eligibility constraint between tasks, expressed as semantic
task IDs via `dependsOn`. Distinct from default ordering.
_Avoid_: ordering, sequence

**Default ordering**:
The execution preference defined by numeric file prefixes. A guide, not
a constraint.
_Avoid_: priority, dependency

**Scope**:
The relative expected effort of a task (`xs` through `xl`), convertible
to an approximate time allocation only when an ancestor supplies a
concrete budget. Never an alias for a fixed duration.
_Avoid_: size, estimate (when relative weight is meant)

**Time budget**:
A concrete wall-clock allocation at plan, phase, or task level. A
steering constraint, never a completion criterion.
_Avoid_: deadline, schedule

### The state

**Execution state**:
The durable facts of where execution stands: per-task status
(pending, in_progress, blocked, done), blocked reasons, completion
summaries, and raw timing facts.
_Avoid_: progress (the derived view), UI state

**Execution progress**:
The computed, always-derivable view over execution state: what is
done, remaining, blocked, and active. Derived values are recomputed,
never persisted.
_Avoid_: cache, checkpoint

**Active work**:
The task or tasks currently `in_progress`. Sequential execution commonly
has one; the model must not assume exactly one.

**Derived state**:
Any value recomputed from durable artifacts, such as percent complete,
phase status, on-track assessment, or scoped-task allocations. Must not
be written back to disk as if authoritative.
_Avoid_: cached state

**Durable state**:
State that must survive a restart: accepted facts and non-derivable
execution history. Lives only in the plan directory.
_Avoid_: session state

### The gates

**Proposal gate**:
The first replanning gate: the agent proposes a change direction, the
user approves or rejects the intent. Approval of intent is not approval
of concrete edits.
_Avoid_: review gate (that is the second gate)

**Plan-editing mode**:
The state after proposal approval: execution paused, the agent modifies
the plan, no implementation work happens.

**Review gate**:
The second replanning gate: the user reviews the concrete plan changes
resulting from an approved proposal. Acceptance makes the revised plan
authoritative and resumes execution.
_Avoid_: proposal gate, approval (ambiguous between the two)

**Replanning**:
The two-gate workflow (propose, edit, review) by which the execution
contract changes during execution.
_Avoid_: refactoring (of plans), pivot

### Steering

**Steering**:
The plugin's ongoing, compact pushback keeping the agent inside the
contract: against premature completion, stale state, skipped tasks, and
silent scope expansion. Semantic steering is best-effort.
_Avoid_: enforcement (structural rules are enforced; semantics are
steered), nagging

**Nudge**:
A compact, rate-limited prompt to reassess, triggered by budget
trajectory or per-task allocation. Encourages reassessment, never
authorizes dropping agreed work.
_Avoid_: warning, alarm

## Unresolved

- The **material deviation boundary** (what counts as material) is a
  live design question; the specs require practical examples, not just
  the abstract principle. See docs/plans/plan.md, Deliberate Grilling
  Surfaces.
- The **scope-to-weight curve** (how `xs`..`xl` map to relative weights)
  is deferred to Phase 7 execution semantics.
