# Phased Implementation Plan

## Mission

Grill-me is for collaboratively developing shared understanding of a plan, from high-level intent down to lower-level decisions. This plugin is for shared understanding during execution: establishing the execution plan up front, making the current execution state visible, steering and enforcing execution within reasonable bounds, and requiring user involvement when the plan needs to change rather than allowing spontaneous, uncoordinated deviation.

The plugin does **not** create or refine high-level plans. External tools, packages, or the user provide plans that are already sufficiently defined for execution.

Its responsibility begins when such a plan is to be executed.

---

# Core Principles

## Execution alignment, not planning

The plugin exists to keep the user and agent aligned on:

- what is currently being executed;
- what has already been completed;
- what remains;
- what is blocked;
- whether execution still corresponds to the agreed plan.

Planning systems remain external.

## Human-controlled contract changes

The agent has reasonable freedom in how it performs agreed work.

It does not have equivalent freedom to redefine that work.

The central rule is:

> The agent may autonomously execute and report progress against the agreed plan, but material changes to that plan require explicit user involvement.

## Strong enforcement where structure permits it

The plugin should strongly enforce facts it can know structurally, such as task state or dependencies.

Semantic adherence is necessarily approximate and should be handled through model steering rather than pretending to provide perfect sandboxing.

## Minimal context footprint

Execution state should remain salient without flooding the model context.

The plugin should synthesize the smallest useful representation of the current execution contract and state.

## Orthogonality to execution mechanisms

The plugin does not own:

- subagents;
- implementation tooling;
- autonomous agent runtimes;
- auditing agents;
- requirements discovery.

Systems such as `pi-subagents` remain independent execution mechanisms.

Parallel execution performed through such systems should still be representable by the execution contract.

---

# Phase 1 — Core Execution Contract

Phase 1 is the MVP and MUST already demonstrate the plugin's defining behavior.

It should not be an advisory todo list that becomes enforceable only in later phases.

## 1.1 Attach to an externally produced plan

The plugin must be able to attach to an existing execution plan and validate that it contains enough information to execute.

If the plan is malformed or insufficient, the plugin should report that rather than generating missing higher-level planning itself.

## 1.2 User-controlled activation

A plan does not become binding merely because it exists.

There must be a user-controlled transition from a proposed plan into an active execution contract.

Before activation, the user should have a meaningful opportunity to understand what is about to be executed.

The exact UI mechanism should be chosen based on Pi's available interaction capabilities.

## 1.3 Execution state management

The agent should be able to:

- inspect the active execution state;
- start work on a task;
- complete a task;
- mark a task blocked and explain why;
- resume blocked work;
- move on to the next appropriate task.

The plugin should keep execution progress synchronized with durable plan state.

Sequential execution will commonly have one current task, but the design should permit multiple tasks to be active concurrently where execution is intentionally parallel.

## 1.4 User visibility

The user should be able to determine at low friction:

- the current goal;
- overall progress;
- currently active work;
- remaining work;
- blocked work;
- whether execution is paused;
- whether the plugin is waiting for user involvement.

The concrete UI is intentionally unspecified.

The implementing agent should choose whichever Pi mechanisms best support this requirement.

## 1.5 Compact steering

While execution is active, the plugin should keep the contract salient to the model.

A conceptual steering summary might contain:

```text
Active execution contract

Goal:
...

Active work:
...

Remaining:
...

Remain within the agreed plan.
Material changes require user involvement.
```

It should not repeatedly inject full plan contents unless necessary.

The plugin should steer against:

- premature completion;
- stale progress state;
- silently skipped tasks;
- silent scope expansion;
- material reinterpretation of agreed work.

---

# Phase 1 — Human-in-the-Loop Replanning

Controlled replanning is part of the MVP.

Without it, the plugin cannot simultaneously discourage deviation and remain usable when execution inevitably reveals new information.

## 1.6 Change proposal gate

When the agent believes the agreed execution plan needs to change materially, it must explicitly propose that change.

The proposal should communicate:

- why the current plan is no longer sufficient;
- what the agent wants to change;
- why the change is necessary or preferable.

Execution should not silently continue as though the proposed contract were already accepted.

The user may approve or reject the proposal.

Approval means:

> The user agrees that the agent may modify the execution plan in the proposed direction.

It does not yet approve the concrete modifications.

## 1.7 Plan-editing mode

After proposal approval, normal execution pauses.

The agent is allowed to modify the plan so that it represents the newly agreed direction.

During this state, it should not resume implementation work.

This creates a clear distinction between:

```text
executing the contract
```

and:

```text
editing the contract
```

## 1.8 Concrete review gate

After the agent finishes modifying the plan, it invokes a second user gate.

The user reviews the actual resulting plan changes.

If accepted:

```text
revised plan becomes authoritative
execution resumes
```

If rejected:

```text
execution remains paused
agent revises the plan
review occurs again
```

The two approvals mean different things:

1. **Proposal approval:** approve the intended change.
2. **Review approval:** approve the concrete representation of that change.

This two-stage interaction is a core feature rather than optional polish.

---

# Phase 2 — Structured Execution

Phase 2 adds richer execution relationships while preserving the same contract model.

## 2.1 Dependencies

Tasks may declare dependencies.

The plugin should then distinguish:

```text
task exists
```

from:

```text
task is currently eligible to execute
```

A task whose dependencies are incomplete should not be allowed to become active.

Default plan ordering remains a preference rather than a substitute for dependencies.

## 2.2 Phases

Plans may organize work into explicit execution phases.

The plugin should use these primarily for:

- execution context;
- user visibility;
- progress reporting;
- steering toward the appropriate region of the plan.

Phase state should preferably be derived from task state rather than introduce unnecessary parallel state machines.

## 2.3 Execution selection

With dependencies and phases available, the plugin can become more opinionated about the next appropriate task.

Among eligible work, default ordering should still guide execution unless there is a reasonable reason to deviate.

The plugin should not micromanage harmless tactical ordering.

Parallel execution of multiple eligible tasks should remain possible where useful.

---

# Phase 3 — Completion Semantics

Phase 3 strengthens what it means for the user and agent to agree that work is finished.

## 3.1 Acceptance expectations

Tasks may contain explicit acceptance criteria or equivalent completion expectations.

The plugin should make these salient when the agent approaches task completion.

## 3.2 Completion accounting

Completing a task should include a concise explanation of what was accomplished.

The purpose is not independent auditing.

It is to make the shared execution state answer:

> Why does the agent currently believe this task is done?

## 3.3 Plan completion

The agent should not simply declare the overall objective complete independently of execution state.

The plugin should prevent or strongly steer against completion while required work is:

- pending;
- in progress;
- blocked.

Completion should emerge from the execution contract rather than from conversational momentum.

---

# Phase 4 — Stronger Change Awareness

Phase 4 improves the plugin's ability to recognize and present changes to the agreed contract.

## 4.1 Better review presentation

The second replanning gate should become increasingly good at explaining concrete changes.

Useful distinctions include:

- added work;
- removed work;
- changed task intent;
- changed dependencies;
- changed phase structure;
- changed goal or constraints.

The user should be able to understand a revision without manually reconstructing the entire before/after state.

## 4.2 Unexpected modification detection

The plugin should detect contract-significant changes that occur during normal execution outside the expected replanning workflow.

Possible responses include:

- pausing execution;
- warning the agent;
- requiring reconciliation;
- directing the agent through the normal proposal/review mechanism.

The implementation may use ephemeral canonical state or fingerprints for detection.

No separate durable state store is required.

---

# Phase 5 — Smarter Semantic Steering

Once explicit contract mechanics are reliable, the plugin may become better at spotting likely semantic drift.

Examples include:

- substantial new work that is not represented by the contract;
- repeated activity apparently unrelated to the current task;
- newly discovered mandatory scope that has not gone through replanning;
- an agent effectively redefining a task while claiming to execute it.

The plugin should respond conservatively.

A typical intervention would be conceptually:

> This appears to materially change the agreed execution plan. Continue within the current task's scope or propose a plan change for user approval.

Semantic detection should remain best-effort.

False-positive-heavy enforcement would work against the plugin's purpose.

---

# Phase 6 — Interoperability and Ecosystem Polish

Once execution semantics are stable, make the plugin easy for external planning systems to target.

Potential work includes:

- publishing the execution-plan specification;
- schema validation tooling;
- compatibility/version documentation;
- stable integration APIs;
- parser/writer libraries if useful;
- simple handoff mechanisms from external planners.

The intended ecosystem boundary is:

```text
external planner / Grill-me / human
              |
              | creates plan
              v
      execution contract
              |
              v
      execution plugin
```

No direct dependency on a specific planning package should be necessary.

---

# Phase 7 — Budgets and Schedule Awareness

Phase 7 adds time-awareness to the execution contract.

Its purpose is not project-management scheduling. It is to extend shared execution understanding with:

> Are we spending roughly the amount of time on this work that the user intended?

## 7.1 Absolute and relative estimates

The user or external planner may provide:

- an absolute time budget for the whole plan;
- an absolute time budget for a phase;
- an absolute time budget for an individual task;
- a relative `scope` estimate for a task.

Tasks may have either:

```text
timeBudget
```

or:

```text
scope
```

but not both.

Initial relative scopes:

```text
XS
S
M
L
XL
```

Scope values are relative effort weights, not aliases for fixed durations.

For example, `M` should not inherently mean "30 minutes."

## 7.2 Derived task allocations

When a task has only a relative scope and an ancestor provides a concrete time budget, the plugin should derive an approximate task allocation.

For example:

```text
Phase budget: 90m

Task A: S
Task B: M
Task C: S
```

The available phase budget is distributed according to the configured relative scope weights.

The resulting approximate durations are derived state.

They must not be written back as if they were explicit user-provided task budgets.

## 7.3 Mixed explicit budgets and scopes

Explicit child budgets are reserved first.

Any remaining budget is distributed among scoped descendants.

For example:

```text
Phase budget: 120m

Task A: explicit 30m
Task B: S
Task C: M
```

The plugin first reserves 30 minutes for A, then proportionally allocates the remaining 90 minutes between B and C.

This allows the user to be precise where they have strong expectations and relative elsewhere.

## 7.4 Hierarchical budget domains

A more specific explicit budget takes precedence over a broader ancestor budget.

For example:

```text
Plan: 4h

Discovery: 45m
    Task A: S
    Task B: M

Implementation:
    Task C: L
    Task D: M
```

The Discovery tasks derive their allocations from the 45-minute phase budget.

The remaining plan budget is available to other descendants according to the applicable allocation rules.

## 7.5 Phase weights are derived

Phases never have independent relative scopes.

Their effective relative weight should be derived from their descendant tasks.

This avoids redundant estimates and keeps phases as aggregation nodes.

## 7.6 Time tracking

The plugin should track actual execution time at task level.

The implementation must distinguish:

- task execution time;
- phase wall-clock consumption;
- plan wall-clock consumption.

This becomes important when multiple tasks execute concurrently.

## 7.7 Parallel execution accounting

When tasks overlap in time, parent budget consumption must not double-count the overlap.

For example:

```text
Task A active for 10 minutes
Task B active for the same 10 minutes
```

should yield:

```text
Task A elapsed: 10m
Task B elapsed: 10m
Phase wall-clock elapsed: 10m
```

not 20 minutes.

Parent consumption should therefore be based on the union of descendant active intervals.

Aggregate compute effort, if ever measured, would be a separate metric.

## 7.8 Live budget assessment

The plugin should continuously derive whether execution appears:

```text
on track
at risk
behind
```

or an equivalent representation.

This assessment should consider available information such as:

- actual elapsed execution time;
- explicit task budgets;
- phase budgets;
- plan budget;
- remaining tasks;
- relative scopes;
- derived expected allocations;
- parallel work.

The confidence and precision of the assessment should reflect the quality of the supplied budgeting information.

A plan with only a top-level budget allows weaker conclusions than one with detailed task or phase allocations.

## 7.9 Agent nudges

When execution appears to be drifting materially from budget expectations, the plugin should nudge the agent.

Examples:

> This task has consumed most of its expected allocation and remains in progress. Reassess the current approach and prioritize what is necessary to satisfy the task.

or:

> The current phase appears behind its expected budget trajectory. Consider whether the execution approach remains appropriate.

Nudges should:

- be compact;
- avoid repeated nagging;
- encourage reassessment rather than premature abandonment;
- never authorize silently dropping agreed work.

If the budget situation implies that the plan itself should change, the normal human-in-the-loop replanning process applies.

## 7.10 Budget exhaustion is not contract cancellation

Exceeding a time budget must not automatically:

- mark a task done;
- skip work;
- cancel a task;
- alter acceptance criteria;
- redefine the goal.

Budgets are steering constraints and expectations.

Changing the contract because of budget pressure still requires user involvement.

---

# Deliberate Grilling Surfaces

Most implementation details can be resolved incrementally. The following areas deserve explicit discussion because they materially affect whether the plugin fulfills its mission.

## 1. Material deviation boundary

This is the central semantic question.

The implementing agent should work through concrete examples of:

- ordinary implementation freedom;
- tactical deviations that do not affect the agreement;
- new work that is reasonably implied by an existing task;
- task reinterpretation;
- scope expansion;
- removal or replacement of agreed work.

The target principle is:

> Require user involvement when a change would materially alter the user's reasonable understanding of what the agent agreed to do.

This boundary needs practical examples, not merely an abstract definition.

If too permissive, the execution contract becomes advisory.

If too strict, routine implementation becomes bureaucratic.

## 2. Replanning state machine

The exact behavior of the two-gate protocol deserves deliberate design.

Questions include:

- What information must the proposal contain?
- What may the agent do while waiting for proposal approval?
- Exactly what is permitted during plan-editing mode?
- How is actual execution prevented before the second gate passes?
- What does review rejection do?
- Can the user abandon the revision entirely?
- What happens if Pi exits or crashes in the middle of this ephemeral transaction?

The implementation should preserve the distinction between:

```text
approval of intent
```

and:

```text
approval of concrete plan changes
```

## 3. Enforcement and context strategy in Pi

The implementing agent should inspect Pi's actual extension capabilities before settling the enforcement architecture.

In particular, determine the best available mechanisms for:

- injecting compact execution context;
- reacting when the agent tries to conclude prematurely;
- keeping task state synchronized;
- detecting execution while a gate is active;
- reacting to unexpected plan changes;
- presenting approval and review interactions;
- surfacing execution state to the user.

The goal is **reliable steering with minimal context pollution**.

The plugin should avoid solving weak enforcement by dumping increasingly large instructions into every turn.

## 4. Phase 7 timing and budget semantics

Budgeting requires deliberate design because incorrect accounting could give the user and agent misleading feedback.

The implementing agent should explicitly work through:

- What event starts a task's execution clock?
- What event pauses or ends it?
- Does time waiting for ordinary tools count?
- Does time waiting for the user count?
- How is long-running subagent work represented?
- How are concurrently active tasks associated with actual intervals?
- What happens across process suspension or crashes?
- Which timing facts must be durable to reconstruct elapsed execution accurately?
- How are nested explicit budgets allocated?
- What scope-weight curve should `XS` through `XL` use?
- How should explicit child budgets interact with scoped siblings?
- How should unbudgeted or unscoped descendants affect allocation?
- What evidence is sufficient to label execution "behind" rather than merely "high budget consumption"?
- At what thresholds should nudges occur?
- How should repeated nudges be rate-limited or escalated?

The design should favor conservative, explainable assessments over false precision.

---

# Explicit Non-Goals

The plugin should not evolve into:

- a high-level planning assistant;
- a requirements-discovery framework;
- a Grill-me replacement;
- a subagent runtime;
- an auditor-agent framework;
- an autonomous continuation engine;
- a generic project-management application;
- a scheduler;
- a task-assignment system;
- a system that attempts to approve every implementation-level action.

Phase 7 budgeting does not change this boundary. It provides execution feedback, not calendar scheduling or project-management forecasting.

Its job remains:

> Maintain shared understanding, visibility, and coordinated adherence while an externally defined plan is being executed.