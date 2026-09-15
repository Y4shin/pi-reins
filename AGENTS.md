# AGENTS.md

Conventions for AI agents working in this repo. The repo runs on the
task-workflow: a dependency graph under `docs/tasks/` of maps and
executable tasks, with bugs under `docs/bugs/`, no external issue
tracker, everything in git.

## Task-workflow layout

- `docs/tasks/` holds the work graph: `map.md` files (multi-task plans)
  and `<slug>/task.md` files (executable tasks with `blocked_by` edges).
  `docs/tasks/state.yaml` tracks the current task/slice and the
  `schema_version` stamp.
- `docs/tasks/archive/` and `docs/tasks/maps/archive/` hold completed
  work. `docs/tasks/out-of-scope/` is the rejected-requests KB: one file
  per consciously ruled-out request, with the reason.
- `docs/bugs/` holds incoming bug reports awaiting triage; `triage`
  moves them into agent-ready tasks.
- `docs/adr/` holds architecture decision records.
- `CONTEXT.md` at the root is the project's domain glossary. It is a
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

## Prose rules

- **No em-dashes anywhere in prose** (`SKILL.md` files, docs,
  `README.md`, `CHANGELOG.md`, ADRs, task docs, commit messages). Where
  a sentence reaches for one, rewrite it instead with a comma, colon,
  period, parentheses, or a conjunction, whichever the sentence actually
  wants; never do a blind character substitution.
- **YAML gotcha:** quote any frontmatter value containing `: ` (e.g. a
  title containing `type: bug`), or the task tools silently skip the
  file.

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
