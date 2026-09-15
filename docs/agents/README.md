# docs/agents/

Per-repo configuration that the engineering skills read. Edit these files
directly to reconfigure; there is no separate config format.

## Conventions recorded here

- **Work items live in `docs/tasks/`, not an external tracker.** Maps,
  tasks, and their `blocked_by` edges are plain files with YAML
  frontmatter, manipulated through the `task_*` tools. Bugs arrive as
  `docs/bugs/*.md` files and move to agent-ready tasks through `triage`.
- **Domain language lives in `CONTEXT.md` at the repo root** (single
  context). ADRs live in `docs/adr/`. Consumers read the glossary
  before writing specs, tickets, or code, and record newly resolved
  terms there as they crystallize.
- **Out-of-scope requests** are recorded in
  `docs/tasks/out-of-scope/`, one file per rejection, with the reason.
  `triage` checks that directory before grilling an incoming request.

## Files that may live here later

Mirroring the setup-workflow convention, these are created lazily as the
project needs them:

- `domain.md`: domain doc layout (single- vs multi-context) and consumer
  rules for reading `CONTEXT.md` and `docs/adr/`.
- `triage-labels.md`: label strings mapped to the canonical triage
  roles, when `triage` is configured.

Nothing else is configured yet.
