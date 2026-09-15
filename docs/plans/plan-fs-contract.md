# Execution Plan Directory Contract

## Overview

An execution plan is represented as a directory on the local filesystem.

The directory is the complete durable representation of:

- the agreed execution contract;
- tasks and phases;
- durable execution progress;
- the plan's change history;
- optional execution budgets and timing facts.

A plan directory is a self-contained OKF 0.2 bundle: a directory tree of Markdown files with YAML frontmatter. The durable plan-level concept is `plan.md`, an ordinary OKF concept document whose frontmatter carries the plan's structured metadata and whose body carries the prose description of the plan. The root `index.md` is the bundle index: strict OKF index semantics, progressive-disclosure navigation to the plan, phases, tasks, and supporting concepts, and the `okf_version` declaration. The root `log.md` records the plan's change history.

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
| **Phase 1 — Core Execution Contract** | `plan.md`, root `index.md`, `log.md`, OKF Markdown, tasks, numeric ordering, durable task status |
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
├── index.md
├── log.md
├── plan.md
├── 010-context.md
├── 100-inspect-current-system.md
├── 200-implement-change.md
└── 300-verify-result.md
```

From Phase 2 onward:

```text
plan/
├── index.md
├── log.md
├── plan.md
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

# `plan.md`

**Introduced: Phase 1**

Every plan root MUST contain:

```text
plan.md
```

`plan.md` is the durable plan-level concept: the plan document of the execution contract. It is an ordinary OKF concept document whose frontmatter declares a plan-specific `type` and carries the plan's structured metadata and durable plan-level execution state, while its Markdown body carries the human-readable prose description of the plan.

Exactly one plan document MUST exist in a plan directory.

There is no separate machine-readable manifest such as a `plan.json`. The `plan.md` frontmatter is the plan's machine-readable metadata surface.

Example:

```markdown
---
type: Execution Plan
id: config-migration
title: Configuration loading migration
description: Execution plan for moving configuration loading onto the provider model.
schemaVersion: 1
goal: Migrate configuration loading to the new provider model
status: proposed
revision: 1
sources:
  - id: masterplan
    resource: ../grill-me/config-migration-masterplan.md
    title: Config migration masterplan
---

# Configuration loading migration

This execution plan migrates configuration loading to the provider-based
model agreed with the user. The masterplan settled the target
architecture and interface; this contract covers getting there while
preserving existing behavior. The legacy loading mechanism is the main
risk area.
```

## Phase 1 fields

### `type`

Required.

The plan-specific OKF concept type. It MUST be:

```yaml
type: Execution Plan
```

OKF type values are not centrally registered; this format defines the plan-level type alongside the `Task` and `Phase` types it uses.

### `id`

Required.

Stable semantic identifier for the plan.

Example:

```yaml
id: config-migration
```

As with tasks and phases, semantic identity is the frontmatter `id`, never the filesystem path or filename.

### `title`

Recommended.

Human-readable display name of the plan.

### `description`

Recommended.

One-line summary of the plan, per the OKF `description` family. Index entries, listings, and search snippets consume it.

### `schemaVersion`

Required.

Version of the execution-plan directory format.

### `goal`

Required.

Concise statement of the execution goal.

The goal describes what this execution contract is intended to accomplish. Higher-level planning and requirements discovery are outside this format's responsibility.

The frontmatter `goal` is the concise authoritative form; the body of `plan.md` elaborates it in prose.

### `status`

Required.

Plan-level execution status.

Initial supported values:

```text
proposed
active
completed
```

These are execution states, not OKF lifecycle states. See Pending Phase 1 Work for the reconciliation obligation this creates.

### `revision`

Optional.

Monotonically increasing revision number representing accepted changes to the execution contract.

It MAY be introduced immediately even if richer revision tooling is implemented later.

## Phase 7 fields

### `timeBudget`

Optional.

An explicit wall-clock budget for execution of the entire plan.

Example:

```yaml
timeBudget: PT4H
```

Durations SHOULD use an unambiguous representation such as ISO 8601 durations.

Plan-level `timeBudget` is an input to budget allocation and live schedule assessment.

Derived values such as time remaining, percentage of budget consumed, expected completion time, or on-track status MUST NOT be persisted anywhere in the plan directory.

## Provenance

The plan document MAY carry OKF 0.2 provenance using the `sources` frontmatter family, recording what the plan derives from, for example the masterplan artifact that the plan was based on:

```yaml
sources:
  - id: masterplan
    resource: ../grill-me/config-migration-masterplan.md
    title: Config migration masterplan
```

Entries follow OKF 0.2: each carries a `resource` naming the source (an absolute URL, a bundle-relative path, or a relative path), and optionally an `id` for per-claim attribution, a `title`, and credibility signals such as `author` and `last_modified`.

How provenance is provided and used is deliberately not fixed by this contract. The concrete conventions belong to the skills and workflows that do the higher-level planning and then integrate with this plugin: they decide which artifacts are recorded, with which ids and labels, and how downstream consumers read them.

pi-reins treats `sources` as provenance only. It does not derive contract obligations from provenance entries and does not execute them.

## Body

The body of `plan.md` is the human-readable prose description of the execution plan: its overall goal and the context agreed with the planning source.

The body is part of the agreed contract. Changes to it are contract-significant.

The body is authored prose, not a generated directory listing. It MUST NOT enumerate tasks or phases. Task and phase discovery stays structural so that no derivable listing is ever persisted as contract content.

## Task and phase discovery

Tasks are discovered from OKF frontmatter (`type: Task`), phases from `phase.md` directory markers, and default ordering from numeric path prefixes.

`plan.md` MUST NOT enumerate tasks or phases: it is the plan document, not a task registry.

The bundle `index.md` MAY list tasks and phases as navigation, but structural discovery MUST NOT depend on it, because the index is regenerable and never authoritative.

---

# `index.md`

**Introduced: Phase 1**

Every plan root MUST contain:

```text
index.md
```

The root `index.md` is the bundle index. It keeps strict OKF 0.2 index semantics:

- it is a navigation document for progressive disclosure, not the plan object;
- it carries no frontmatter except the root `okf_version` declaration;
- it carries no execution-plan schema fields.

### `okf_version`

Required.

Declares the OKF version the plan directory targets.

MUST be `"0.2"`, the OKF version this contract currently targets.

This is the one key OKF permits on a bundle-root `index.md`. Because the execution-plan schema lives on `plan.md`, the index needs no extension of its own.

### Navigation

The body of the root `index.md` follows the OKF index structure: one or more sections, each grouping the directory's contents under a heading with bulleted links. It navigates to the plan document, phases, tasks, and relevant supporting concepts:

```markdown
# Execution Plan

* [Configuration loading migration](plan.md) - the plan document: goal, context, and agreed contract

# Tasks

* [Inspect the current system](100-inspect-current-system.md) - understand the existing loading mechanism
* [Implement the change](200-implement-change.md) - implement the provider-based loader
* [Verify the result](300-verify-result.md) - confirm existing behavior is preserved

# Supporting Context

* [Context](010-context.md) - background and constraints
```

Entries SHOULD include the description from the linked document's frontmatter, per OKF. Once phases exist (Phase 2), the index MAY group tasks under their phase directories.

### Non-authoritative navigation

The index is regenerable navigation, never authoritative state:

- structural task and phase discovery MUST NOT depend on it;
- discrepancies between `index.md` and the actual directory contents resolve in favor of the directory;
- the plugin MAY regenerate or update it, and consumers MAY synthesize one when it is absent, per OKF;
- it MUST NOT carry execution state, such as task status, progress, active work, or budget assessments; the derived-state rules apply.

Index files in subdirectories, such as phase directories, follow plain OKF semantics and are optional. Only the plan-root `index.md` is required, because it declares `okf_version`.

---

# `log.md`

**Introduced: Phase 1**

Every plan root MUST contain:

```text
log.md
```

The root `log.md` is the plan's change log. It follows the OKF log structure: a flat list of date-grouped prose entries, newest first, under ISO 8601 `YYYY-MM-DD` date headings.

Example:

```markdown
# Plan Update Log

## 2026-09-03
* **Update**: Revision 2 accepted. Added the caller-migration task after review.

## 2026-09-01
* **Creation**: Initial proposed plan, derived from the masterplan.
```

The log records changes to the execution contract, not execution progress:

- plan creation;
- accepted plan revisions, one entry per review-gate approval;
- plan completion or deprecation.

Each accepted revision SHOULD be logged, so the durable history of the contract stays readable from the plan directory itself.

Ordinary execution-state changes such as task status transitions are already durable in task frontmatter and need not be logged.

`log.md` is durable history, not derived state: accepted revisions cannot be recomputed from the current plan contents.

Further `log.md` files MAY appear in subdirectories per OKF. This contract requires only the plan-root instance.

---

# Markdown Conformance

**Introduced: Phase 1**

All Markdown files within the plan directory MUST conform to OKF 0.2.

The targeted OKF version is declared with `okf_version: "0.2"` in the root `index.md`.

Semantic meaning SHOULD be expressed through OKF frontmatter wherever applicable.

Execution-plan-specific frontmatter fields, such as the plan, task, and phase fields this contract defines, are producer-defined extension keys. OKF explicitly permits additional keys, and consumers MUST NOT reject documents carrying unrecognized fields.

Reserved OKF filenames keep their OKF meaning: `index.md` and `log.md` are reserved at every level and never serve as task, phase, or plan documents.

The execution plugin MAY structurally ignore Markdown documents that have no execution-specific meaning.

---

# Numeric Ordering

**Introduced: Phase 1**

Task and supporting-context Markdown files and, once phases exist, phase directories SHOULD begin with a numeric prefix.

The reserved filenames (`index.md`, `log.md`) and the plan document (`plan.md`) carry no numeric prefix; they are outside default ordering.

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
plan document (plan.md: structured metadata and prose description)
plan execution status
accepted plan revision
plan change history (log.md)
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

The format SHOULD avoid persisting information that can be reliably recomputed from authoritative fields. The navigation content of the bundle `index.md` is the one deliberate exception: OKF defines index files as optional and synthesizable by consumers, so the index is regenerable navigation rather than authoritative derived state.

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
plan identity
plan prose description (plan.md body)
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

---

# Pending Phase 1 Work: OKF 0.2 Compliance

**Note for the Phase 1 Wayfinder map.**

This contract targets OKF 0.2 but does not yet guarantee strict conformance for every plan directory it describes. When planning Phase 1, create a `research` task in the Phase 1 Wayfinder map, followed by a `grilling` task, to verify and reconcile full OKF 0.2 compliance of this execution-plan filesystem format against the upstream specification.

Known points to investigate:

- the plan and task `status` fields reuse the standardized OKF lifecycle `status` family key (`draft`/`stable`/`deprecated`) for execution vocabulary (`proposed`/`active`/`completed`, `pending`/`in_progress`/`blocked`/`done`): decide whether to keep that as a documented extension or to separate execution state from OKF lifecycle;
- whether plan, task, and phase documents should adopt further OKF families, such as `generated`, `verified`, and `stale_after`;
- this format requires the root `index.md` and `log.md` and pins `okf_version: "0.2"`, while OKF itself leaves both files optional for producers: verify that strictness level against the upstream conformance rules;
- what else belongs in `log.md` and with what entry conventions;
- which of the above are documented OKF extensions, which are conformance gaps, and where the line runs.

The research findings and the settled decisions must be reconciled back into this document, so the format and OKF 0.2 stop contradicting each other.

---

# Summary

The durable format follows these rules:

```text
plan.md
    the plan-level concept: structured metadata, execution state,
    optional absolute budget, optional provenance (sources),
    plus the prose description of the plan

index.md
    bundle index: okf_version and progressive-disclosure navigation;
    regenerable, never authoritative, never the plan object

log.md
    durable history of contract changes

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