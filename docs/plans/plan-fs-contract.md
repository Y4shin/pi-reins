# Execution Plan Directory Contract

## Overview

An execution plan is represented as a directory on the local filesystem.

The directory is the complete durable representation of:

- the agreed execution contract;
- tasks and phases;
- durable execution progress;
- optional execution budgets and timing facts.

Any state that must survive an agent or process restart MUST be represented inside the plan directory. Ephemeral interaction, UI, cache, or control-flow state SHOULD remain in memory.

This format is designed to be:

- human-readable;
- agent-friendly;
- compatible with external planning tools;
- easy to inspect and modify with ordinary filesystem tooling;
- progressively extensible as execution features are introduced.

## Feature Phases

This specification distinguishes between fields and structures available at different implementation phases.

| Phase | Filesystem capabilities |
|---|---|
| **Phase 1 — Core Execution Contract** | `plan.json`, OKF Markdown, tasks, numeric ordering, durable task status |
| **Phase 2 — Dependencies & Phases** | task dependencies, `phase.md`, phase directories |
| **Phase 3 — Completion Semantics** | acceptance criteria conventions, completion summaries |
| **Phase 4–6** | No required new durable structure currently defined |
| **Phase 7 — Budgets** | plan/phase/task time budgets, task scope estimates, durable timing facts |

Later-phase fields MUST NOT be required when reading an earlier-phase plan.

---

# Plan Directory

A Phase 1 plan MAY look like:

```text
plan/
├── plan.json
├── 010-context.md
├── 100-inspect-current-system.md
├── 200-implement-change.md
└── 300-verify-result.md
```

From Phase 2 onward:

```text
plan/
├── plan.json
├── 010-context.md
│
├── 100-discovery/
│   ├── phase.md
│   ├── 110-inspect-current-system.md
│   └── 120-identify-boundaries.md
│
├── 200-implementation/
│   ├── phase.md
│   ├── 210-implement-loader.md
│   └── 220-migrate-callers.md
│
└── 300-verification/
    ├── phase.md
    └── 310-run-tests.md
```

Supporting files and directories MAY coexist with structurally meaningful plan artifacts.

---

# `plan.json`

**Introduced: Phase 1**

Every plan root MUST contain:

```text
plan.json
```

It contains plan-level metadata and durable plan-level execution state.

Example:

```json
{
  "schemaVersion": 1,
  "id": "config-migration",
  "goal": "Migrate configuration loading to the new provider model",
  "status": "active",
  "revision": 1
}
```

## Phase 1 fields

### `schemaVersion`

Required.

Version of the execution-plan directory format.

### `id`

Required.

Stable semantic identifier for the plan.

### `goal`

Required.

Concise statement of the execution goal.

The goal describes what this execution contract is intended to accomplish. Higher-level planning and requirements discovery are outside this format's responsibility.

### `status`

Required.

Initial supported values:

```text
proposed
active
completed
```

### `revision`

Optional.

Monotonically increasing revision number representing accepted changes to the execution contract.

It MAY be introduced immediately even if richer revision tooling is implemented later.

## Phase 7 fields

### `timeBudget`

Optional.

An explicit wall-clock budget for execution of the entire plan.

Example:

```json
{
  "timeBudget": "PT4H"
}
```

Durations SHOULD use an unambiguous representation such as ISO 8601 durations.

Plan-level `timeBudget` is an input to budget allocation and live schedule assessment.

Derived values such as time remaining, percentage of budget consumed, expected completion time, or on-track status MUST NOT be persisted in `plan.json`.

## Task and phase discovery

`plan.json` MUST NOT enumerate tasks or phases.

Tasks and phases are discovered from Markdown documents and filesystem structure.

---

# Markdown Conformance

**Introduced: Phase 1**

All Markdown files within the plan directory MUST conform to the current OKF standard.

Semantic meaning SHOULD be expressed through OKF frontmatter wherever applicable.

Producer-specific frontmatter fields MAY be added for execution-plan semantics.

The execution plugin MAY structurally ignore Markdown documents that have no execution-specific meaning.

---

# Numeric Ordering

**Introduced: Phase 1**

Plan Markdown files and, once phases exist, phase directories SHOULD begin with a numeric prefix.

Examples:

```text
010-context.md
100-inspect-current-system.md
200-implement-change.md
```

and:

```text
100-discovery/
200-implementation/
300-verification/
```

The prefix defines **default ordering**.

It is not a stable identifier and MUST NOT be used for cross-artifact references.

For example:

```text
110-inspect-current-system.md
```

may later become:

```text
130-inspect-current-system.md
```

without changing semantic identity.

Execution MAY deviate from numeric order where execution semantics permit it.

---

# Tasks

**Introduced: Phase 1**

Any OKF Markdown document with:

```yaml
type: Task
```

represents an executable task.

The filename itself does not determine whether a file is a task.

Example:

```markdown
---
type: Task
id: implement-loader
title: Implement the provider-based loader
status: in_progress
---

# Implement the provider-based loader

Replace the current configuration-loading mechanism with the provider-based implementation.

## Constraints

- Preserve existing public behavior.
- Do not migrate callers as part of this task.
```

## Phase 1 task metadata

### `id`

Required.

Stable semantic slug used to reference the task.

Example:

```yaml
id: implement-loader
```

Task IDs MUST be unique within the plan.

### `status`

Required once the task participates in execution.

Initial values:

```text
pending
in_progress
blocked
done
```

Example:

```yaml
status: pending
```

Multiple tasks MAY be `in_progress` concurrently when execution is intentionally parallel.

A single-agent sequential workflow will commonly have one current task, but the durable model MUST NOT assume that exactly one task is active.

### `blockedReason`

Optional in Phase 1.

SHOULD be present when:

```yaml
status: blocked
```

Example:

```yaml
status: blocked
blockedReason: Waiting for a user decision on backwards compatibility.
```

## Phase 7 task metadata

A task MAY specify either an explicit time budget or a relative scope estimate.

These fields are mutually exclusive.

### `timeBudget`

Optional.

Defines an explicit wall-clock allocation for the task.

Example:

```yaml
timeBudget: PT30M
```

A task with `timeBudget` MUST NOT also specify `scope`.

### `scope`

Optional.

Defines the task's relative expected effort.

Initial values:

```text
xs
s
m
l
xl
```

Example:

```yaml
scope: m
```

A task with `scope` MUST NOT also specify `timeBudget`.

`scope` does not represent a fixed amount of time. It is a relative weight that MAY be converted into an approximate time allocation when an ancestor provides a concrete `timeBudget`.

The exact mapping from scope values to relative weights is part of the Phase 7 execution semantics rather than the durable file format.

## Durable timing facts

Phase 7 MAY introduce task-level fields containing non-derivable timing facts required to reconstruct execution time across restarts.

The exact timing representation is intentionally left open until Phase 7 implementation, because it depends on decisions around:

- active execution intervals;
- pauses;
- crashes;
- parallel work;
- subagent execution;
- lifecycle hooks available in Pi.

Derived timing information MUST NOT be persisted merely as a cache.

Examples of values that SHOULD be derived rather than stored:

```text
time remaining
budget utilization percentage
expected duration derived from scope
on-track / at-risk / behind
phase progress
plan progress
```

## Markdown body

The body defines the semantic content of the task.

It MAY contain arbitrary OKF-compatible material, including:

- description;
- implementation context;
- constraints;
- acceptance criteria;
- references;
- relevant architectural information;
- instructions from an external planning framework.

The body is considered part of the agreed task definition.

---

# Stable References

**Introduced: Phase 1**

Stable references MUST use semantic `id` values.

The conceptual distinction is:

```text
numeric prefix   = default ordering
frontmatter id   = stable semantic identity
frontmatter type = semantic role
filesystem path  = organization
```

File paths and numeric prefixes MUST NOT be treated as durable task identity.

---

# Phases

**Introduced: Phase 2**

A directory represents an execution phase if and only if it contains:

```text
phase.md
```

Example:

```text
200-implementation/
├── phase.md
├── 210-implement-loader.md
└── 220-migrate-callers.md
```

A directory that merely happens to contain tasks is not necessarily a phase.

## `phase.md`

`phase.md` MUST conform to OKF.

Example:

```markdown
---
type: Phase
id: implementation
title: Implementation
---

# Implementation

Implement the approved design while preserving existing behavior.
```

### `id`

Required once phase support is enabled.

Provides the stable semantic identity of the phase.

### Phase status

Phase execution status SHOULD be derived from its contained tasks.

Separate mutable phase status SHOULD NOT be introduced unless later requirements justify it.

## Phase 7 `timeBudget`

A phase MAY define an explicit time budget:

```yaml
timeBudget: PT1H30M
```

A phase MUST NOT have a `scope` field.

A phase's relative expected weight is derived from its descendant tasks rather than specified independently.

Derived phase values such as progress, time spent, remaining budget, and on-track status MUST NOT be persisted unless they represent non-derivable raw timing facts.

## Nested phases

Nested phase directories MAY be supported by later implementations.

They are not required for initial Phase 2 support.

---

# Dependencies

**Introduced: Phase 2**

Tasks MAY declare dependencies using semantic task IDs.

Example:

```yaml
dependsOn:
  - inspect-current-system
  - establish-interface
```

References MUST resolve against task `id` fields.

Numeric ordering and dependencies have distinct meanings:

```text
numeric prefix = default execution preference
dependsOn      = execution eligibility constraint
```

Renaming or reordering a task file MUST NOT break dependency references.

---

# Completion Semantics

**Introduced: Phase 3**

Phase 3 adds durable information explaining when and why tasks are considered complete.

## Acceptance criteria

Tasks MAY define explicit acceptance criteria.

These MAY live in the Markdown body, for example:

```markdown
## Acceptance Criteria

- JSON output is valid.
- Existing text output remains unchanged.
- Relevant tests pass.
```

A later schema MAY standardize machine-readable acceptance criteria if required.

## `completionSummary`

A completed task MAY contain:

```yaml
status: done
completionSummary: >
  Implemented the provider loader and verified the focused
  configuration tests.
```

The completion summary records why the agent believes the task satisfies the execution contract.

It is durable because it contributes to the shared understanding of execution progress.

---

# Budget Semantics

**Introduced: Phase 7**

Budgeting adds absolute time expectations and relative task effort estimates without duplicating derived progress state.

## Absolute budgets

`timeBudget` MAY be defined on:

- the entire plan;
- phases;
- tasks.

Example:

```text
Plan:               PT4H
Implementation:     PT2H
Specific task:      PT30M
```

An explicitly budgeted descendant forms a more specific budget domain beneath its parent.

## Relative task scopes

Only tasks MAY define `scope`.

Example:

```yaml
scope: l
```

Initial scope classes:

```text
xs
s
m
l
xl
```

Scopes express relative expected effort rather than absolute duration.

A task's approximate time allocation MAY be derived when a containing ancestor has an explicit `timeBudget`.

## Allocation

When a budgeted parent contains both:

- children with explicit `timeBudget`; and
- descendants with relative `scope`;

explicit child budgets are reserved first.

The remaining parent budget is then distributed approximately among scoped descendant tasks according to their relative weights.

Example:

```text
Phase budget: 120m

Task A: timeBudget 30m
Task B: scope S
Task C: scope M
```

The explicit 30 minutes are reserved first.

The remaining 90 minutes are distributed between Tasks B and C according to the configured relative weights of `S` and `M`.

The derived allocations MUST NOT be written back as durable `timeBudget` values.

## Nearest explicit budget

A scoped task derives its approximate allocation from the nearest applicable ancestor budget domain.

A more specific explicit phase or task budget takes precedence over a broader plan-level budget.

## Phase weight

Phases do not have independent relative scopes.

Their effective relative weight is derived from descendant tasks.

This avoids duplicate estimation and ensures that phases remain aggregation nodes rather than separately estimated work items.

## No absolute ancestor budget

If no ancestor provides a concrete `timeBudget`, scopes remain useful as relative effort estimates but cannot be honestly converted into wall-clock durations.

The plugin MAY still use them for relative progress reasoning but MUST NOT present precise time-based schedule claims without an absolute budget anchor.

## Parallel execution

Task-level elapsed execution time and parent wall-clock budget consumption have different aggregation semantics.

If two tasks execute in parallel for ten minutes:

```text
Task A elapsed execution: 10m
Task B elapsed execution: 10m

Parent wall-clock consumption: 10m
```

Parent wall-clock time is based on the **union of active descendant execution intervals**, not the sum of overlapping child durations.

This prevents parallel work from double-consuming phase or plan wall-clock budgets.

If a future feature wishes to measure aggregate compute or agent effort, that MUST be treated as a separate metric from wall-clock budget consumption.

---

# Supporting Context Files

**Introduced: Phase 1**

The plan directory MAY contain arbitrary supporting files.

Markdown supporting files MUST still conform to OKF.

Examples:

```text
010-context.md
architecture.md
research-notes.md

references/
    api-notes.md
```

Such documents are not executable tasks unless their OKF metadata declares:

```yaml
type: Task
```

Likewise, an arbitrary directory does not become a phase unless it contains:

```text
phase.md
```

The plugin MAY ignore supporting context structurally even though the agent or an external planning system may read it.

---

# Durable Versus Ephemeral State

The plan directory contains all state that is important enough to survive restart.

Examples of durable state:

```text
plan goal
plan status
accepted plan revision
task definitions
task status
blocked reasons
phase definitions
dependencies
completion summaries
explicit time budgets
task scope estimates
non-derivable timing facts needed for recovery
```

Examples of state that SHOULD remain ephemeral:

```text
currently displayed UI
parsed-file caches
active dialog state
pending change-proposal UI
proposal approval state
filesystem review gate state
temporary plan diff
current-turn steering state
computed budget assessment
computed progress
computed approximate task allocation
computed phase weight
```

In particular, plan-change negotiation is not represented by a separate durable execution directory.

The durable filesystem represents accepted facts and non-derivable execution history, while computed assessments and transient control flow remain runtime concerns.

---

# Derived State

The format SHOULD avoid persisting information that can be reliably recomputed from authoritative fields.

Examples of derived values include:

```text
2/5 tasks complete
percentage complete
phase status
phase relative weight
approximate scoped-task allocation
budget remaining
percentage of budget consumed
on-track / at-risk / behind
expected completion time
```

The plugin SHOULD calculate these from the underlying plan artifacts and timing facts.

---

# Contract-Significant Versus Execution-State Changes

Not every edit to a task document changes the execution contract in the same way.

Examples of ordinary durable execution-state changes:

```text
status
blockedReason
completionSummary
raw timing facts
```

Examples of contract-significant changes:

```text
goal
task semantic content
task identity
task addition/removal
phase structure
dependencies
constraints
acceptance criteria
scope
timeBudget
```

During active execution, contract-significant changes are expected to occur only through the plugin's user-mediated replanning workflow.

The exact enforcement mechanics are outside the scope of this filesystem specification.

---

# Summary

The durable format follows these rules:

```text
plan.json
    plan-level metadata, state and optional absolute budget

OKF type: Task documents
    executable units
    task-level execution state
    optional explicit budget or relative scope

phase.md
    marks a directory as a phase
    may provide an explicit absolute budget
    never provides a scope

numeric path prefix
    default ordering

semantic id
    stable cross-reference identity

other OKF Markdown
    supporting context

durable timing facts
    only when required to reconstruct execution across restarts

derived values
    recomputed, not persisted

memory only
    transient interaction, enforcement and assessment state
```

The filesystem is both the durable execution artifact and the interchange format between this plugin and external planning systems.