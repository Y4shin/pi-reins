# Research: OKF 0.2 compliance audit of the execution-plan directory format

Task: `research-okf-compliance`. Date: 2026-09-29. This document is the
research artifact the task requires: item-by-item verdicts on the format
defined in `docs/plans/plan-fs-contract.md` against the upstream Open
Knowledge Format v0.2. No spec was modified; reconciliation edits belong to
`grill-okf-compliance`.

## Sources

Primary and binding for every verdict:

- Upstream OKF v0.2 specification:
  `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`
  (raw: `https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md`).
  Retrieved 2026-09-29 from `main`; verified byte-identical to the latest
  commit touching `okf/SPEC.md`, commit
  `62432a095456147ee71e70ac6e4dc0d2dea3ac30` (2026-08-21). SHA-256 of the
  audited copy:
  `26aa5da029278939f914e578107242d9607d4f2dc5fe153272b82f9ed1030101`.
  Citations below use the spec's own section numbers.

Binding local documents (the audit targets):

- `docs/plans/plan-fs-contract.md` (the format under audit; "the fs-contract")
- `docs/plans/plan.md`, `CONTEXT.md`, `AGENTS.md`

Prior art, informative only:

- `~/tmp/kb-llm-system/concepts/okf-conformance.md` and
  `~/tmp/kb-llm-system/decisions/D-042-okf-v02-zielformat.md` (a mature OKF
  0.2 bundle with a documented conformance profile)
- `/home/pplattner/Projects/pi-knowledgebase/docs/tasks/okf-format-adaptation/task.md`
  (a settled OKF adaptation for a personal knowledge base)

---

## 1. OKF 0.2 conformance rules, restated

### 1.1 Hard conformance: the only rules a bundle can fail

Section 11, "Conformance": "A bundle is **conformant** with OKF v0.2 if:

1. Every non-reserved `.md` file in the tree contains a parseable YAML
   frontmatter block.
2. Every frontmatter block contains a non-empty `type` field.
3. Every reserved filename (`index.md`, `log.md`) follows the structure in
   §8 and §9 respectively when present."

Section 11 adds: "Consumers SHOULD treat all other constraints as soft
guidance." No other rule can make a bundle non-conformant.

### 1.2 Rules for the standardized frontmatter families (SHOULD level)

Section 11: "When the trust, lifecycle, provenance, or computation families
are present, producers SHOULD follow §5 through §10", and consumers:

- MUST treat a bare `verified` mapping as a one-element list (§5.2);
- MUST NOT reject a concept for missing any optional family (§5.3);
- SHOULD derive trust tiers and staleness only from the fields the spec
  defines (§5.3, §5.5).

Section 5.4, "Lifecycle: `status`", fixes the value vocabulary:
`draft | stable | deprecated`, and "Absent `status` ⇒ `stable`."

### 1.3 Consumer tolerance

Section 11: consumers MUST NOT reject a bundle because of: missing optional
frontmatter fields; unknown `type` values; unknown additional frontmatter
keys; broken cross-links; missing `index.md` files.

### 1.4 Producer freedom, and the exact boundary of the extension permission

- §4.1, "Extensions": "Producers MAY include any additional keys. Consumers
  SHOULD preserve unknown keys when round-tripping and MUST NOT reject
  documents with unrecognized fields."
- §4.1: "`type` is the only always-required key; a concept carrying just
  `type` is fully conformant (§11)." And: "Type values are **not**
  registered centrally."
- §3, "Bundle structure": "The directory structure is independent of the
  domain: producers organize concepts however makes sense for the knowledge
  being captured."
- §1: the format "standardizes only the small set of structural
  conventions needed to make a knowledge corpus self-describing"; anything
  beyond that is left to the producer.
- §5: the provenance, trust, and lifecycle families "are optional. Their
  absence carries meaning: an unverified concept is distinguishable from a
  verified one, but is never rejected (§11)."

The boundary matters for this audit: the extension permission covers
*additional* keys. It does not cover redefining the value domain of a
standardized key such as `status`; the only clause touching that is the
producer SHOULD in §11 (see 1.2).

The spec's producer-side MUSTs are few: §3.1 (reserved filenames must not be
used for concept documents), §9 (log date headings must be ISO 8601
`YYYY-MM-DD`), and §7 (the `human:` actor prefix where actor fields record
human confirmation). Nothing else binds a producer.

### 1.5 Reserved filenames, index, log, versioning

- §3.1, "Reserved filenames": `index.md` and `log.md` "have defined meaning
  at any level of the hierarchy and MUST NOT be used for concept documents."
  All other `.md` files are concept documents.
- §8, "Index files": an `index.md` "MAY appear in any directory, including
  the bundle root." Index files carry no frontmatter, with one exception: a
  bundle-root `index.md` MAY carry an `okf_version` key. The body is one or
  more sections, each grouping concepts under a heading with bulleted links;
  entries SHOULD include the linked concept's `description`. "Producers MAY
  generate `index.md` automatically; consumers MAY synthesize one on the
  fly when none is present."
- §9, "Log files": a `log.md` "MAY appear at any level of the hierarchy to
  record the history of changes to that scope." Format: a flat list of
  date-grouped entries, newest first. "Date headings MUST use ISO 8601
  `YYYY-MM-DD` form. Log entries are prose; the leading bold word
  (`**Update**`, `**Creation**`, `**Deprecation**`) is a convention, not a
  requirement."
- §12, "Versioning": "Bundles MAY declare the version they target with
  `okf_version: "0.2"` in a bundle-root `index.md` frontmatter block (the
  only place frontmatter is permitted in an `index.md`)." Consumers that do
  not understand the declared version SHOULD attempt best-effort
  consumption rather than refusing the bundle.

### 1.6 Identity

§2, "Terminology": "**Concept ID**: The path of the concept's file within
the bundle, with the `.md` suffix removed." Upstream identity is path-based;
the spec defines no frontmatter identity key. §6.1: "Consumers MUST tolerate
broken links: a link whose target does not exist in the bundle is not
malformed."

### 1.7 The optional families this audit was asked about

- `sources` (§5.1): entries with a required `resource` (an absolute URL, a
  bundle-relative path, a path into `references/`, or a scope descriptor),
  optional `id` and `title`, and optional credibility signals (`author`,
  `usage_count`, `last_modified`).
- `generated` (§5.2): `{ by: actor, at: ISO 8601 datetime }`;
  `generated.by` is required within `generated`; `generated.at` marks "the
  content's last meaningful change."
- `verified` (§5.2): a list of `{ by, at }` verification events. §5.3
  derives trust tiers: no `verified` key means unverified; non-`human:`
  actors only means machine-confirmed; a `human:<id>` actor means
  human-reviewed.
- `stale_after` (§5.5): "Optional. An absolute instant. A concept is stale
  when `now >= stale_after`."
- Actor convention (§7): `<producer>/<version>` for agents, `human:<id>`
  for people, `process:<id>` for automated processes.

### 1.8 The asymmetry that settles the strictness question

The optionality of `index.md`, `log.md`, and `okf_version` (§8, §9, §12) is
written as permissions for producers ("MAY appear", "MAY declare"), never
as prohibitions on stricter producers. A bundle that contains these files
satisfies §11 rule 3 by following §8/§9 structure, and nothing else in §11
penalizes their presence. A producer profile that requires optional files
therefore produces conformant bundles; the strictness binds the format's
own producers, not OKF conformance.

---

## 2. Item-by-item verdicts

Verdicts use the task's three-way scheme: *conformant*, *conformant
extension* (permitted by a cited upstream rule), *compliance gap* (would
fail a cited upstream rule). One item lands honestly between categories and
is flagged as such.

### 2.1 The known points from the fs-contract's Pending Phase 1 Work section

#### K1. Plan and task `status` reusing the OKF lifecycle key

Claim under audit (fs-contract, `plan.md` "status" and Tasks "status"
sections): plan values `proposed`/`active`/`completed` and task values
`pending`/`in_progress`/`blocked`/`done`, written into the frontmatter key
`status`.

Upstream rules bearing on it:

- §5.4: the lifecycle family `status` accepts `draft | stable | deprecated`;
  absent means `stable`. The execution values are outside this vocabulary.
- §11 hard rules 1-3: not violated. Parseable frontmatter and non-empty
  `type` are unaffected by the value of `status`, and no reserved filename
  is involved. The bundle does not fail conformance.
- §4.1: the extension permission covers additional keys. `status` is a
  standardized key, so the permission does not cover repurposing it.
- §11: with the lifecycle family present, "producers SHOULD follow §5
  through §10". Values outside §5.4's vocabulary depart from that SHOULD.
  It is a SHOULD-level departure only; §11 itself downgrades such
  constraints to soft guidance for consumers.
- Contrast that pins the risk: unknown `type` values and unknown additional
  keys get explicit consumer-tolerance rules (§4.1, §11). Unknown values of
  a *present standardized family* get no defined consumer behavior at all.
  A generic OKF consumer cannot reject the document, but its derived
  lifecycle for it is undefined: the spec neither maps `in_progress` onto a
  lifecycle nor says what to do with it.

Verdict: not a compliance gap (no §11 hard rule and no producer MUST is
failed), and not squarely a conformant extension either (the §4.1
permission covers additional keys only). It is a SHOULD-level deviation
with a genuine semantic collision, the one audited point that sits on the
line between the two categories. Keeping it requires documenting it as a
profile-level override; renaming the field turns it into an unambiguous
conformant extension. See R1 and Q1.

Confidence: high (rule analysis); high (that the collision is real for
generic OKF consumers).

#### K2. Adopting further OKF families (`generated`, `verified`, `stale_after`)

Claim under audit: the fs-contract currently uses none of these families on
plan, task, or phase documents (its frontmatter surface is `type`, `id`,
`title`, `description`, `status`, `schemaVersion`, `goal`, `revision`,
`sources` on `plan.md`, plus task/phase fields; fs-contract, `plan.md`,
Tasks, and Phases sections).

Upstream: §5: the families "are optional. Their absence carries meaning...
but is never rejected (§11)." Adopting them is equally optional and
conformant if the §5 conventions are followed (including the §7 actor
convention for `generated.by` and `verified[].by`).

Verdict: conformant as it stands; there is nothing to fail, and adoption is
permitted, not required. The interesting question is product-level, not
conformance-level; see R2 and Q2/Q3.

Confidence: high (permissiveness); medium (the adoption recommendations in
R2 are product judgment).

#### K3. Required root `index.md` and `log.md`, pinned `okf_version: "0.2"`

Claim under audit (fs-contract, `index.md` and `log.md` sections): every
plan root MUST contain `index.md` and `log.md`; `okf_version` MUST be
`"0.2"`; the index carries no frontmatter except `okf_version` and no
execution-plan schema fields; the log follows the OKF log structure;
subdirectory index files are optional with plain OKF semantics.

Upstream: §8/§9 make the files optional for producers ("MAY appear"), §12
makes the declaration optional ("MAY declare"), and §11 rule 3 requires only
that they follow §8/§9 structure *when present*. Per 1.8, permissions are
floors, not ceilings: a stricter producer profile remains conformant. The
fs-contract's structural mandates already match the upstream structures:

- index: no frontmatter except the root `okf_version` (matches §8 and §12's
  parenthetical, "the only place frontmatter is permitted in an
  `index.md`"); sectioned body with bulleted links; entries SHOULD carry
  the linked document's `description` (matches §8).
- log: date-grouped prose entries, newest first, ISO `YYYY-MM-DD` headings,
  leading bold word as convention (matches §9; the fs-contract's example
  `# Plan Update Log` with `## 2026-09-03` and `* **Update**: ...` follows
  the §9 shape).
- version: `"0.2"` is the current spec version (§12).

Verdict: conformant. The strictness is safe under upstream conformance
rules, on one condition that the fs-contract already satisfies: the
required files must actually follow §8/§9, because a deviating `log.md`
(for example a non-ISO date heading) would fail §11 rule 3 and the §9 MUST.
Keep the strictness; document it in the profile note (R5).

Confidence: high.

#### K4. What else belongs in `log.md`, and entry conventions

Claim under audit (fs-contract, `log.md` section): the log records plan
creation, accepted plan revisions (one entry per review-gate approval), and
plan completion or deprecation; ordinary task-status transitions need not be
logged because they are durable in task frontmatter.

Upstream: §9 fixes structure only (see 1.5); content policy is the
producer's. The fs-contract's rules and example conform to §9 exactly, and
its exclusion of recomputable execution state is consistent with §9's
purpose ("the history of changes to that scope", the scope here being the
contract) and with the product's derived-state rule
(`docs/plans/plan-fs-contract.md`, Derived State).

Verdict: conformant. One contract-lifecycle event is missing from the
content list: activation, the user-controlled `proposed` to `active`
transition (`docs/plans/plan.md` §1.2), is neither a revision nor covered
by "creation". See R3 and Q4.

Confidence: high (conformance); medium (content recommendations, which are
product judgment).

#### K5. Which are documented extensions, which are gaps, where the line runs

Derived from §11, §4.1, §3.1, and §1 (see 1.1-1.8):

- A compliance gap exists only if a plan directory would fail an §11 hard
  rule: a non-reserved `.md` file without parseable frontmatter or without a
  non-empty `type` (which includes supporting context files like
  `010-context.md`), or a reserved filename not following §8/§9, or a
  violation of one of the three producer MUSTs (§3.1, §7, §9).
- A conformant extension is any of: an additional frontmatter key (§4.1);
  an unregistered `type` value (§4.1: "Type values are **not** registered
  centrally"); a producer-side structural convention inside the directory
  tree (§3 organization freedom), such as `plan.md`, `phase.md` markers, or
  numeric prefixes; or a stricter producer profile that requires files or
  fields upstream leaves optional (§1, §8, §9, §12).
- Between the two: repurposing a standardized family key. No MUST fails,
  the §4.1 permission does not apply, only the §11 producer SHOULD does.
  K1 is the sole instance in this format.
- Hard gaps this format correctly avoids: `index.md`/`log.md` are never
  used as concept documents (§3.1 MUST NOT, respected by the fs-contract's
  Markdown Conformance section); every Markdown file is required to conform
  to OKF (§11 rules 1-2). The avoidance must be *enforced* at validation
  time; see R6.

Verdict: the fs-contract's deviations are all in permitted-extension or
SHOULD-level territory. Zero hard compliance gaps found.

Confidence: high.

### 2.2 The structural basics

#### S1. Numeric prefixes vs OKF path identity

Claim under audit (fs-contract, Numeric Ordering and Stable References):
numeric prefixes define default ordering only and are never identifiers;
stable identity is the frontmatter `id`; re-prefixing (`110-...` becomes
`130-...`) does not change semantic identity; references use `id`s.

Upstream: §2 defines Concept ID as the file path minus the `.md` suffix, so
upstream identity is path-based and the spec defines no frontmatter identity
key. `id` is an additional key (permitted, §4.1), so keying `dependsOn` and
other references on it is a permitted extension. Re-prefixing a file
changes its OKF Concept ID; markdown links to it break, which consumers
must tolerate (§6.1), so no conformance failure occurs, but a generic OKF
consumer sees a *different* concept where this format sees the same one.

Verdict: conformant extension (additional key, §4.1), with a dual-identity
caveat that belongs in the profile note: the fs-contract's own claim is
accurate for its consumers, but upstream consumers will nonetheless track
path identity (R5). Prior art takes the same stance and documents the same
caveat (`~/tmp/kb-llm-system/concepts/okf-conformance.md`, the `id` bullet
under "Bewusste Erweiterungen").

Confidence: high.

#### S2. `phase.md` as a phase marker

Claim under audit (fs-contract, Phases): a directory represents an execution
phase if and only if it contains `phase.md`; `phase.md` MUST conform to
OKF, with `type: Phase`, `id`, `title` in the example; a directory that
merely contains tasks is not necessarily a phase.

Upstream: OKF has no notion of phases; §3 leaves directory organization to
producers. `phase.md` is not a reserved filename (§3.1 reserves only
`index.md` and `log.md`), so it is an ordinary concept document; the
fs-contract's requirement that it carry a non-empty `type` satisfies §11
rule 2. Presence-of-a-named-file as a directory marker is a producer
convention; no upstream rule bears on it.

Verdict: conformant extension (organization freedom, §3; concept
requirements, §4 and §11).

Confidence: high.

#### S3. `plan.md` as the plan-level concept

Claim under audit (fs-contract, `plan.md` section): exactly one `plan.md`
at the plan root, an ordinary OKF concept document whose frontmatter
carries the plan metadata (`type: Execution Plan`, `id`, `schemaVersion`,
`goal`, `status`, `revision`, `sources`) and whose body carries prose; no
separate manifest; provenance via the OKF `sources` family.

Upstream: `plan.md` is not reserved (§3.1), so it is a concept document;
`Execution Plan` is an unregistered type value, which §4.1 permits; the
profile-required keys are additional keys (§4.1); "exactly one" is a
stricter producer rule, permitted per 1.8. The `sources` usage follows
§5.1 (required `resource` per entry; optional `id`, `title`, and
credibility signals), and the example's `resource: ../grill-me/...` is an
accepted path-valued form (§6.2: "a relative path (for example
`../computations/revenue.md`)").

Verdict: conformant, with the `status` caveat carried by K1.

Confidence: high.

#### S4. The reserved-filename rules

Claim under audit (fs-contract, Markdown Conformance): `index.md` and
`log.md` are reserved at every level and never serve as task, phase, or plan
documents; the root `index.md` carries no frontmatter except `okf_version`;
subdirectory index files are optional, plain-OKF; further `log.md` files
MAY appear in subdirectories.

Upstream: §3.1 is an exact match (same two filenames, same defined meaning
at any level, same MUST NOT). §8 matches the frontmatter exception
(`okf_version` on the bundle-root index only). §8/§9 make non-root
occurrences optional, matching the fs-contract.

Verdict: conformant; the closest-to-upstream claim in the contract.

Confidence: high.

#### S5. The extension-key claim in the Markdown Conformance section

Claim under audit (fs-contract, Markdown Conformance):
"Execution-plan-specific frontmatter fields, such as the plan, task, and
phase fields this contract defines, are producer-defined extension keys.
OKF explicitly permits additional keys, and consumers MUST NOT reject
documents carrying unrecognized fields."

Upstream: the sentence is accurate for every genuinely producer-defined key
(`id`, `schemaVersion`, `goal`, `revision`, `blockedReason`, `dependsOn`,
`timeBudget`, `scope`, `completionSummary`), and its paraphrase of §4.1 is
faithful, including the MUST NOT. It is inaccurate for two classes of keys
the format also uses:

- `status`: a standardized lifecycle key (§5.4), not an extension key;
  see K1.
- `title`, `description`, `sources`: recommended or standard OKF keys
  (§4.1, §5.1) that the format follows; also not extension keys.

Verdict: the underlying format remains conformant, but the claim as written
overstates the extension boundary. A wording fix is required as part of the
K1 resolution (R4).

Confidence: high.

### 2.3 Summary table and counts

| Item | Verdict | Confidence |
|---|---|---|
| K1 status key reuse | conformant extension only in the weak sense; SHOULD-level deviation (§11, §5.4); not a hard gap | high |
| K2 further families | conformant either way (§5) | high |
| K3 required index/log + okf_version pin | conformant (§8, §9, §11, §12, §1) | high |
| K4 log.md content and conventions | conformant structure (§9); activation event missing | high |
| K5 extensions vs gaps line | zero hard gaps; permitted extensions plus one SHOULD-level deviation | high |
| S1 numeric prefixes / id identity | conformant extension (§4.1); dual-identity caveat (§2) | high |
| S2 phase.md marker | conformant extension (§3, §4) | high |
| S3 plan.md plan-level concept | conformant (§3.1, §4.1, §5.1, §6.2) | high |
| S4 reserved-filename rules | conformant (§3.1, §8) | high |
| S5 extension-key claim | inaccurate as written; wording fix needed (not a bundle-level failure) | high |

Counts: conformant 5 (K2, K3, K4, S3, S4); conformant extension 3 (K1 weak,
S1, S2); compliance gap 0. Two further findings are not verdicts but fixes:
the spec-text inaccuracy S5, and the missing activation log event in K4.

---

## 3. Recommendations

One recommendation per gap, deviation, or open convention. Where a
recommendation requires a product choice, it is mirrored as a question in
section 4; the grilling task settles it.

### R1. Resolve the `status` collision by renaming the execution field (K1, S5)

Recommended: rename the execution-status frontmatter key on `plan.md` and
task documents to a dedicated, non-standard key (suggested:
`executionStatus`), carrying the existing values unchanged
(`proposed`/`active`/`completed` on plans; `pending`/`in_progress`/`blocked`/
`done` on tasks). The OKF `status` key then reverts to its lifecycle
meaning and may simply be omitted (absent means `stable`, §5.4), or used
where lifecycle is genuinely meant (a retired plan can carry
`status: deprecated` while `executionStatus: completed` records why it
stopped being active).

Rationale:

- Every execution-plan-specific field becomes a genuine additional key, so
  the fs-contract's Markdown Conformance claim (S5) becomes exactly true
  with no exceptions.
- Generic OKF consumers get defined lifecycle semantics instead of an
  undefined value with no specified fallback (§5.4).
- The rename is a spec edit, not a migration: Phase 1 is unimplemented, and
  the plugin is the primary writer and reader of execution state.
- Both prior-art bundles keep `status` on the OKF vocabulary and carry
  domain state in their own keys
  (`~/tmp/kb-llm-system/decisions/D-042-okf-v02-zielformat.md`,
  "Konkrete Übernahmen"; pi-knowledgebase
  `docs/tasks/okf-format-adaptation/task.md`, Q5).

Alternative, if the user prefers key stability: keep `status` carrying
execution values and document it in the profile note as a deliberate
profile-level override of the lifecycle family, explicitly acknowledging
that it departs from the §11 producer SHOULD and that generic consumers
will read an undefined lifecycle value. This keeps the collision
permanently and leaves the fs-contract's "self-contained OKF 0.2 bundle"
claim qualified; that is the cost to state in the decision.

### R2. Family adoption: `generated` yes as MAY, `verified` as a user decision, `stale_after` no (K2)

- `generated` (§5.2): do not *require* it, but permit it and have the plugin
  maintain it (`{ by: <actor>, at: ... }`, actor per §7, for example
  `pi-reins/<version>`) whenever it writes plan or task documents. It is
  the OKF-native record of "the content's last meaningful change" and gives
  the stale-progress steering (`docs/plans/plan.md` §1.5) a durable,
  non-derivable timestamp without depending on VCS presence or mtimes.
  Caveat: any writer that fails to maintain it makes it silently wrong, so
  the writer obligation is the real decision (Q3), and it overlaps the
  deliberately open Phase 7 timing-facts design (fs-contract, Durable
  timing facts): decide the boundary once.
- `verified` (§5.2, §5.3): recommend not adopting in the Phase 1 core. The
  one semantically defensible use is appending a `verified` event
  (`{ by: human:<id>, at: ... }`) to `plan.md` at each review-gate
  acceptance (`docs/plans/plan.md` §1.8) and possibly at activation, which
  would make the plan read as human-reviewed to any trust-tier-aware
  consumer. It duplicates the `log.md` entry in structured form and needs
  a stable human actor id; both prior-art bundles deliberately leave
  `verified` unset absent genuine file-level review. This is a genuine
  user decision (Q2).
- `stale_after` (§5.5): do not adopt on plan, task, or phase documents. An
  absolute staleness instant fits time-bound knowledge, not an execution
  contract whose staleness is a runtime judgment (steering against stale
  progress state, `docs/plans/plan.md` §1.5); a persisted absolute date
  would either be ignored or spuriously flag whole plans. It remains
  available, with no format change, for supporting context documents an
  external planner authors.

### R3. `log.md` conventions: add Activation, fix the entry vocabulary (K4)

- Add activation to the logged events: one entry for the user-controlled
  `proposed` to `active` transition (`docs/plans/plan.md` §1.2). It is a
  contract-lifecycle event that is neither creation nor an accepted
  revision, and it is currently unrepresented in the durable history.
- Fix a small closed set of leading bold words, following the §9
  convention: `**Creation**`, `**Activation**`, `**Update**` (accepted
  revisions, one entry per review-gate approval, referencing the revision
  number), `**Completion**`, `**Deprecation**`.
- Keep the structural rules already specified (they match §9): newest
  first; same-day entries share one ISO `YYYY-MM-DD` date heading; entries
  are one-line prose.
- Keep the exclusions already specified and reaffirm them: task-status
  transitions, derived progress, and budget assessments never belong in
  `log.md` (durable in frontmatter or recomputed; fs-contract, `log.md`
  and Derived State sections).
- Defer one convention to Phase 4: whether an out-of-band
  contract-significant modification that gets detected and reconciled
  (`docs/plans/plan.md` §4.2) earns a log entry. Decide when detection
  exists.

### R4. Fix the Markdown Conformance wording (S5)

Scope the extension-key sentence to genuinely producer-defined keys, and
state explicitly how standardized keys are handled: `title` and
`description` follow §4.1, `sources` follows §5.1, and the lifecycle
`status` key is either reserved for OKF lifecycle use (if R1's rename is
accepted) or documented as a profile-level override (if the alternative is
chosen). This is the minimal edit that makes the section's claims exactly
true.

### R5. Add an OKF 0.2 profile note to the fs-contract (K5, S1, K3)

Replace the Pending Phase 1 Work section (its stated purpose) with a short
"OKF 0.2 profile" section that lists, in one place, the documented
extensions and deviations, each with its upstream permission:

- additional keys (id, schemaVersion, goal, revision, blockedReason,
  dependsOn, timeBudget, scope, completionSummary, and the execution-status
  key if renamed), permitted by §4.1;
- unregistered type values (`Execution Plan`, `Task`, `Phase`), permitted by
  §4.1;
- producer-side structure conventions: `plan.md`, `phase.md` markers,
  numeric prefixes as ordering only, permitted by §3;
- stricter-than-upstream requirements: root `index.md` and `log.md`
  mandatory, `okf_version: "0.2"` pinned, permitted because §8/§9/§12
  grant permissions, not ceilings (see 1.8);
- the dual-identity caveat: upstream Concept ID is the path (§2); this
  format keys identity on the `id` extension, so renames and re-prefixes
  change what generic consumers see while preserving internal references;
- the status decision, whichever way Q1 is settled.

Both prior-art bundles maintain exactly such a profile note
(`~/tmp/kb-llm-system/concepts/okf-conformance.md`; pi-knowledgebase
planned one in its settled adaptation task). This note is what keeps the
fs-contract's "self-contained OKF 0.2 bundle" claim honest.

### R6. Carry the conformance rules into the validation surface (K5)

The zero-gap verdict holds only if the plugin enforces it. The attach-time
validation surface (`docs/plans/plan.md` §1.1, and the map's fog item on
the concrete plan-validation surface) must check, over the whole tree:

- every non-reserved `.md` file, including supporting context such as
  `010-context.md` and `references/api-notes.md`, has parseable frontmatter
  with a non-empty `type` (§11 rules 1-2);
- `index.md` and `log.md` follow §8/§9 structure, including ISO date
  headings (the §9 MUST);
- the profile rules: exactly one `plan.md`, unique task `id`s, the
  execution-status vocabulary, and (from Phase 2) `phase.md` markers and
  `dependsOn` resolution.

---

## 4. Questions that must go to the user

These are not decidable from the sources; the sources only bound what is
permitted.

1. **Status resolution (R1).** Rename the plan and task execution-status
   key (suggested `executionStatus`), freeing `status` for OKF lifecycle
   use, or keep `status` carrying execution values and document it as a
   profile-level override of the OKF lifecycle family? If renaming: which
   key name? This is a material spec change that also touches what
   `CONTEXT.md` and `docs/plans/plan.md` say, and it shapes what external
   planners must write.
2. **`verified` on review-gate acceptance (R2).** Should each review-gate
   acceptance (and activation) append a structured
   `verified: { by: human:<id>, at: ... }` event to `plan.md`, recording
   human review in the OKF trust family, at the cost of duplicating the
   `log.md` entry in structured form? If yes, what stable `human:<id>`
   identifies the user?
3. **Writer-maintained `generated` (R2).** Should the plugin maintain
   `generated` (actor plus timestamp, §5 and §7 conventions) on the plan
   and task documents it writes, as the OKF-native last-change record
   feeding stale-state steering, or should any writer-maintained
   timestamps wait for the Phase 7 timing-facts design so the boundary is
   decided once?
4. **Log conventions confirmation (R3).** Confirm adding the Activation
   entry type, and confirm deferring the Phase 4 out-of-band reconciliation
   entry until detection exists. (Minor; settle in grilling.)

---

## 5. Impact on dependents

### On `grill-okf-compliance`

The audit maps onto the grilling task's five decision-list items
(`docs/tasks/grill-okf-compliance/task.md`):

1. Status-key collision: R1 with Q1; the audit supplies the rule analysis
   (no hard gap, §11/§5.4 SHOULD-level collision) and both options with
   costs.
2. Further OKF families: R2 with Q2 and Q3; `stale_after` needs no user
   time (recommendation is a clear no for plan/task/phase docs).
3. Required index and log strictness: verdict conformant (K3); decision is
   "keep", with the profile note (R5) documenting why it is safe. No edit
   to the strictness itself.
4. Log conventions: R3 with Q4.
5. Extension vs gap classification: K5 plus R5 (the profile note) and R4
   (the wording fix). The audit found zero hard gaps, so no
   reconciliation edit is needed for conformance reasons beyond R1/R4/R5;
   R1 is the only decision with real alternatives.

Per that task's notes, the fs-contract edits (including replacing the
Pending Phase 1 Work section) land in the grilling task, and it also owns
touching `docs/plans/plan.md`, `CONTEXT.md`, and `docs/plans/INDEX.md` if
the status decision changes what they say (it would: `CONTEXT.md` "Execution
state" names per-task status values tied to the field).

### On the Phase 1 spec (`to-spec`)

- Validation surface: R6 turns the §11 hard rules plus profile rules into
  concrete attach-time checks; this sharpens the map's fog item "what
  malformed or insufficient means structurally for a plan directory".
- Writer obligations: index regeneration (already specified), `log.md`
  entries now including Activation (R3), the execution-status key instead
  of overloading `status` if R1 is accepted, and `generated` maintenance
  if Q3 is answered yes.
- Steering inputs: `generated.at` becomes a durable staleness signal if
  adopted (Q3); otherwise stale-state detection stays runtime-only.
- Scope: no hard conformance gap exists, so no structural rework of the
  Phase 1 format is required by this audit. All recommendations are
  spec-text or convention edits.

### Evidence bar

The task's completion evidence is this artifact: upstream rules restated
with citations (section 1), item-by-item verdicts with confidence and cited
rules (section 2), recommendations per gap (section 3), user questions
(section 4), and dependent impact (section 5). The upstream spec was
retrieved and pinned (Sources). The evidence bar is met; the task can be
marked done.
