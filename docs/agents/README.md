# docs/agents/

Per-repo configuration that the engineering skills read. Edit these files
directly to reconfigure; there is no separate config format.

## Conventions recorded here

- **Work items live in `docs/tasks/`, not an external tracker.** Maps,
  tasks, and their `blocked_by` edges are plain files with YAML
  frontmatter, manipulated through the `task_*` tools. Bugs arrive as
  `docs/bugs/*.md` files and move to agent-ready tasks through `triage`.
- **The product specs are binding.** `docs/plans/plan.md` (phased
  implementation plan) and `docs/plans/plan-fs-contract.md` (execution
  plan directory contract) define what pi-reins is and is not. Agents
  working in this repo read both before design or implementation work,
  and treat changes to them as material (ADR-worthy when structural).
- **Domain language lives in `CONTEXT.md` at the repo root** (single
  context). It holds the product's vocabulary: execution contract, plan
  directory, task, phase, dependency, scope, time budget, proposal
  gate, review gate, steering. The workflow vocabulary (map, task,
  slice, frontier) describes this repo's own development process and is
  defined by the task-workflow package, not pi-reins.
- **Out-of-scope requests** are recorded in
  `docs/tasks/out-of-scope/`, one file per rejection, with the reason.
  `triage` checks that directory before grilling an incoming request.

## Project-specific rules for agents

- **Do not cache derived state.** A core product rule: computed values
  (progress, budget assessment, scoped allocations, phase weights) are
  recomputed from durable artifacts, never written back. Agents
  implementing or extending pi-reins must respect this in code and in
  the plan directory.
- **The plugin does not plan.** Feature requests that push toward
  planning, requirements discovery, scheduling, or task assignment are
  out of scope; record them in `docs/tasks/out-of-scope/` rather than
  debating them inline.

## Files that may live here later

Created lazily as the project needs them:

- `domain.md`: domain doc layout (single- vs multi-context) and consumer
  rules for reading `CONTEXT.md` and `docs/adr/`.
- `triage-labels.md`: label strings mapped to the canonical triage
  roles, when `triage` is configured.
