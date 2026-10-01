# Testing

## Framework

- **Vitest** (test runner) plus **`tsc --noEmit`** (type checking).
  Source and tests are TypeScript ESM; vitest transforms them directly,
  no build step. The suite runs with `npm test`, type checking with
  `npm run typecheck`.
- The suite never uses an LLM and never touches the network. The one
  exception outside the default gate is the inert-load check
  (`tests/inert-load.test.ts`), which shells out to the real `pi` CLI
  and is skipped when the binary is absent.

## Run commands

| Command | Purpose |
|---|---|
| `npm test` | Run the full test suite |
| `npm run typecheck` | Type check src and tests with `tsc --noEmit` |
| `npx vitest run tests/plan` | Run one area, e.g. the plan-directory module |

## Seams

Tests live only at the four seams agreed in the effort's architecture
spec (`docs/tasks/phase1-execution-contract/arch-spec.md`):

1. **Event-handler boundary**: `h.fire(eventType, event)` drives
   handlers registered through the real registration shell with
   synthetic pi events. Assert outgoing message lists, block decisions
   with reasons, terminate flags, and refusal messages.
2. **Tool boundary**: `h.dispatchTool(name, args)` calls a tool as the
   model would. A thrown refusal surfaces as `{ isError: true, message }`,
   matching how pi reports thrown tool errors. Assert one-line results
   and durable file effects.
3. **Plan-directory module**: `discoverPlanDir` / `parseDoc` /
   `writeFields` against real temporary directories built from
   `tests/fixtures/` via `copyFixture`.
4. **UI port**: scripted dialog answers from `uiScript` (gates run
   deterministically); captured notify, widget, and dialog calls.

Rules: no assertions on internal call order, private module structure,
or exact strings beyond the steering summary's required content lines.

## Mock conventions

- **`createHarness({ planDir, uiScript, config, now, verifier })`**
  (`tests/harness/index.ts`) is the single substrate: it wires the real
  `registerReins` shell over a capturing fake `ExtensionAPI`, injects a
  full `ReinsDeps`, and gives each test an isolated temp directory.
  `planDir: "plan-valid"` copies the shared conforming fixture into
  `<tempRoot>/plan/`; the fs port is rooted there.
- **Scripted dialogs fail closed**: an unscripted `confirm` answers
  `false`, `select` and `input` answer `undefined`, which is exactly
  the no-UI degradation the gates must handle.
- **Recorder ports**: session entries, messenger calls, toolset
  changes, steering force-injects, and verifier requests are all
  captured on the harness (`h.session`, `h.messenger`, `h.toolset`,
  `h.steering`, `h.verifier`) for direct assertion.
- **Fixtures**: `tests/fixtures/plan-valid/` is the conforming sample
  plan (plan document, index, log, three tasks with binding sections,
  two carrying expected declaration regexes, one change proposal, one
  supporting doc). `plan-active/` and `plan-completed/` are the same
  plan in those execution states. `tests/fixtures/malformed-*/` holds
  the malformed family, one rule class per directory with its defects
  in separate files, plus `malformed-multi/` carrying defects from
  several classes for report-completeness; add one per new validation
  rule class rather than inventing inline strings.

## Skill prose testing

- **YAML gotcha:** an unquoted `: ` inside a frontmatter value (e.g. a
  title containing `type: bug`) makes the YAML invalid; the task tools
  then *silently skip* the file. Quote such values.
- **Frontmatter keys:** the task tools read `type`, `subtype`, `title`,
  `status`, `workflow_state`, `blocked_by` (tasks and tickets); `type`,
  `title`, `status` (maps and specs). Malformed frontmatter makes an
  artifact invisible to the graph tools.
