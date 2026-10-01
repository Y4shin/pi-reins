---
type: deviation report
title: "Deviation report for scaffold-plan-io"
status: stable
---

## Deviation report: scaffold-plan-io

Verified against `git diff task/scaffold-plan-io..ticket/scaffold-plan-io`
(10 commits, 35 files, about 5.8k insertions), the arch spec's shared
architecture and per-ticket section 1, and the ticket doc's four
acceptance criteria. The suite was re-run during this review: 24 tests
passed, typecheck clean, the live inert-load check ran against the real
pi CLI and passed, and no em-dashes appear in any new prose.

### API surface changes

- **Planned:** `discoverPlanDir(fs, root)` returning `PlanScan`
  (plan, tasks, proposals, index, log, supporting, per-file findings).
- **Actual:** Exactly as planned, synchronous, plus a `root` field on
  `PlanScan` and five concrete finding rules (`unparseable-frontmatter`,
  `frontmatter-not-mapping`, `missing-frontmatter`, `missing-type`,
  `missing-task-heading`, plus `missing-plan-root`, `unreadable-file`,
  `missing-plan-document`).
- **Impact:** None on dependents. attach-validation consumes `PlanScan`
  as specced; the extra rules give it the missing/insufficient refusal
  classes for free.

- **Planned:** per-kind document parsers in `parse.ts`.
- **Actual:** one generic `parseDoc(text, file, opts)` plus
  `extractBindingSections(body)` and `splitFrontmatter`/
  `dumpDocument`, composed at the discover site. A `parseTaskDocument`
  convenience wrapper was removed as dead code.
- **Impact:** attach-validation should consume `PlanScan` (or compose
  `parseDoc` + `extractBindingSections`) rather than expecting
  per-type parser functions. Internal shape change only; the seam is
  unchanged.

- **Planned:** `writeFields` preserving bodies and stamping
  `generated { by: "pi-reins/<version>", at }`.
- **Actual:** as planned, via a `WriteDeps` subset (`fs`, `now`);
  `generatedBy()` reads the version from package.json. It throws on
  unparseable frontmatter (documented: callers surface that as a tool
  error), and re-serializes frontmatter, losing YAML comments and
  non-semantic formatting (same trade-off as the named prior art;
  bodies are preserved verbatim).

- **Planned:** `deps.actor` as the human actor id from the git
  user.email of the plan directory's repository, else OS username.
- **Actual:** resolved eagerly at wiring time from the session cwd's
  repository (`resolveActor(ctx.cwd)`), a plain string without the
  `human:` prefix.
- **Impact:** two flagged follow-ups, no breakage now: (1) when a plan
  directory lives outside the cwd repository the actor would be wrong;
  attach-validation should revisit resolution (per its own ticket
  scope). (2) `deps.ts` documents the actor as used for `human:<id>`
  verified events, but nothing owns prepending `human:` yet; the
  activation ticket must settle that when writing the first `verified`
  event.

- **Planned:** real adapters in `src/pi.ts` over the live runtime.
- **Actual:** as planned, with two scaffold placeholders that later
  tickets replace: the real FsPort is rooted at `ctx.cwd` (the deps
  comment and harness root it at the plan directory; the real root
  becomes correct once attach owns the path), and the real
  VerifierRunner refuses visibly ("pi-subagents integration lands with
  plan completion") rather than pretending to verify. The port shape is
  fixed now: `VerifierRequest { contract, changeDigest }` to
  `VerifierResult { fulfilled, gaps }`; plan-completion conforms or
  reshapes it.

- **Planned:** harness `createHarness({ planDir, uiScript, config })`.
- **Actual:** a superset: `+ now`, `+ verifier` options, and exposed
  `fire`, `dispatchTool` (thrown refusals become `{ isError, message }`
  outcomes exactly as pi reports them), `runCommand`, recorder ports
  (`session`, `messenger`, `toolset`, `steering`, `verifier`), and
  `registerTool`/`on` pass-throughs. It wires the real `registerReins`
  shell over a capturing fake ExtensionAPI, so tests exercise the same
  registration path pi uses. This strengthens the seam rather than
  changing it.

### Abstraction usage

- Used/was specified: yes. `yaml` for all frontmatter parsing and
  serialization (no hand parser); no general Markdown parser (only
  `# Task` H1 plus H2 extraction); no plan caching (rescan per
  invocation); the registration shell stays thin (only `src/pi.ts`
  touches `pi`/`ctx`); the state machine matches the arch spec's
  transition table exactly; no derived state is persisted anywhere;
  no em-dashes in prose.

### Out-of-scope changes

- `src/handlers/session.ts` (`onSessionStart`) registered by the
  shell: named in the shared layout but not in this ticket's export
  list; needed so "inert without an attached contract" is real,
  testable behavior at the event boundary. Reconciliation of an
  attached plan lands with attach-validation, as documented.
- `src/plan/fs.ts` (`NodeFsPort`, root-escape guarding, recursive
  list): named in the shared layout, not in the per-ticket exports.
- Nested reserved files (subdirectory `index.md`/`log.md`) parse
  leniently, are exempt from the missing-type rule, and land in
  supporting; only root index/log populate the scan fields. A
  reasonable reading of "reserved at every level"; attach-validation
  owns the strict rule surface.
- `package-lock.json` committed (about 3.5k lines): a consequence of
  `npm install`, needed for reproducible runs.
- No changes outside the ticket's scope: no behavior, docs, or config
  beyond `docs/testing.md` and `docs/dev-env.md` (both fill-ins are
  in the ticket's export list).

### Ticket doc update needed?

Yes, minor. The `## Implementation notes` section (appended by the
land-worker) should record for downstream tickets:

- consume `PlanScan` / `parseDoc` + `extractBindingSections`; there
  are no per-type parser functions;
- `writeFields` throws on unparseable frontmatter and re-serializes
  frontmatter (comments lost, bodies preserved);
- the actor caveat: resolved from the cwd repository at wiring time,
  `human:` prefix ownership unsettled, revisit at activation;
- the real FsPort is rooted at `ctx.cwd` until attach owns the plan
  path;
- the malformed fixture family grows per validation rule class
  (add one directory per class, no inline strings).

### User attention needed?

No. Scope is unchanged and no planned API surface broke its
dependents: attach-validation consumes `PlanScan` exactly as the
interface contract planned. The two follow-up flags (actor resolution
and the `human:` prefix) sit inside already-planned ticket scope and
are recorded above for the next chain.
