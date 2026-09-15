# AGENTS.md

Conventions for AI agents working in this repo.

## What this repo is

**pi-reins** is a Pi plugin for execution alignment: it binds an
externally produced plan into an enforceable **execution contract**,
keeps execution state durable and visible, steers the agent within
bounds, and routes material changes through a two-gate user protocol.
It is not a planner; `docs/plans/plan.md` (mission, phases) and
`docs/plans/plan-fs-contract.md` (the durable format) are the binding
specs. Read both before touching the design.

Two vocabularies live side by side here; do not confuse them:

1. The **workflow vocabulary** (map, task, slice, frontier): how work on
   *this repo* is planned and executed, under `docs/tasks/`. Defined by
   the task-workflow package.
2. The **product vocabulary** (execution contract, plan directory, task
   status, proposal/review gate, steering): what pi-reins itself *is*.
   Defined in `CONTEXT.md` and the two plan documents.

To avoid ambiguity in this repo's own docs, product terms are written
plain (execution contract, plan directory) and workflow terms carry
their usual task-workflow meanings. When a sentence could mean either,
spell out which.

## Task-workflow layout

- `docs/tasks/` holds the work graph: `map.md` files (multi-task plans)
  and `<slug>/task.md` files (executable tasks with `blocked_by`
  edges). `docs/tasks/state.yaml` tracks the current task/slice and the
  `schema_version` stamp.
- `docs/tasks/archive/` and `docs/tasks/maps/archive/` hold completed
  work. `docs/tasks/out-of-scope/` is the rejected-requests KB: one
  file per consciously ruled-out request, with the reason.
- `docs/bugs/` holds incoming bug reports awaiting triage.
- `docs/adr/` holds architecture decision records (first one: the
  package name).
- `CONTEXT.md` at the root is the product's domain glossary. It is a
  glossary and nothing else: no implementation details, no specs.

## Working the graph

- Read `docs/tasks/state.yaml` (`task_state`) to see where work stands.
  `task_list`, `task_frontier` (maps), and `task_slices` (legacy tasks)
  answer what is ready.
- Task `type` drives execution: `research` and `prototype` tasks
  delegate to the `research` and `prototype` skills; `grilling` and
  `manual` run inline; `feature` and `bug` tasks are implemented through
  the TDD loop (`tdd` skill), one red-green slice at a time.
- `/skill:implement-task` implements a task's slices; `/skill:finalize-task`
  runs the closing pipeline (test gate, changelog, archive, merge).
- `/skill:code-review` reviews every diff on two axes (Standards + Spec)
  before landing.

## Product conventions

- **Specs are binding.** `docs/plans/plan.md` and
  `docs/plans/plan-fs-contract.md` define mission, phases, and the
  durable format. Implementation decisions must trace back to them; a
  change to either document is a material change to the product, treat
  it like one (and consider an ADR).
- **Derived state is never persisted.** A core product rule
  (recomputed progress, assessments, scoped allocations). Agents
  working on this repo must not "helpfully" cache computed values into
  the plan directory or `plan.json`.
- **No em-dashes anywhere in prose** (`SKILL.md` files, docs,
  `README.md`, `CHANGELOG.md`, ADRs, task docs, commit messages). Where
  a sentence reaches for one, rewrite it with a comma, colon, period,
  parentheses, or a conjunction, whichever the sentence actually wants;
  never do a blind character substitution.
- **YAML gotcha:** quote any frontmatter value containing `: ` (e.g. a
  title containing `type: bug`), or the task tools silently skip the
  file.
- **The plugin does not plan.** Suggesting planning features (goal
  refinement, requirement discovery) is out of scope; the explicit
  non-goals section of `docs/plans/plan.md` lists the full boundary.
  Record requests for such features in `docs/tasks/out-of-scope/`.

## Skill invocation convention

- Skills are invoked by their operative name, not by deep file
  cross-references: "delegate to the `research` skill", "call
  `/skill:grilling`". One skill per instruction. A step that needs two
  skills is two instructions.
- A user-invoked skill (`disable-model-invocation: true` in frontmatter)
  is reached only by the human typing `/skill:<name>`. A model-invoked
  skill is auto-invoked by the model or typed by the human. A
  user-invoked skill may invoke model-invoked skills, never another
  user-invoked one; phrase those as instructions for the human.
