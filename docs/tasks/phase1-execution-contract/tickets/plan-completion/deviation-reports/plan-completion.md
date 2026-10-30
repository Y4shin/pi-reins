---
type: deviation report
title: Deviation report for plan-completion
status: stable
---

## Deviation report: plan-completion

### API surface changes

- **Planned:** the full `reins_complete` path in `src/tools/complete.ts`
  (tool IO carrying the required `setState` accessor): structural guard,
  then the deferred-proposal walkthrough (blocking fold-or-drop dialog per
  deferred item; fold designates a durable target outside the plan
  directory and returns the fold instruction; drops immediate), outstanding
  folds verified structurally on the next attempt with dispositioned
  proposal documents deleted through the landed `FsPort.delete`; then the
  completion verifier (fresh-context agent `reins-completion-verifier`,
  registered at session_start through pi-subagents' runtime agent
  registration event, run through the in-process RPC spawn, receiving the
  completion contract and a change digest, returning fulfilled or a gap
  list that becomes the refusal); on success the log Completion entry and
  the plan flipped to completed; pi-subagents absence fails visibly at
  session_start (notification plus widget marker) and completion refuses
  with a named error. Interface contract consumed from ticket 11: the
  acceptance write utilities (`prependLogEntry`, `appendVerifiedEvent`)
  reused for the Completion entry, with `appendVerifiedEvent` named in the
  spec's abstraction list for this ticket.
- **Actual:** as planned, plus additive surface:
  - `src/tools/complete.ts`: `CompleteToolIo` (with required `setState`, the
    renegotiation-session precedent for tool IOs), `remainingWork`,
    `planComplete(deps, state, setState)`, `WALKTHROUGH_OPTIONS`, and
    `createCompleteTool`; the existing `remainingWork(remaining)` renderer is
    shared by the refusal and the fold instruction.
  - `src/handlers/verifier.ts` (new module, beyond the spec's handlers/ list,
    continuing the attach/activate/renegotiate/drift precedent):
    `VERIFIER_AGENT_NAME` (`reins-completion-verifier`),
    `RUNTIME_AGENT_REGISTER_EVENT` (`pi-subagents:runtime-agent-register:v1`,
    the raw event contract, no runtime import of pi-subagents),
    `EventBus`, `VerifierRegistration`, `VerifierInstall`,
    `registerCompletionVerifier`, `installCompletionVerifier`,
    `parseVerifierVerdict`, `createSubagentsVerifier`.
  - `ReinsState`: `completionFolds?: CompletionFold[]` (ephemeral: a restart
    drops the designation while the proposal document stays on disk, so the
    walkthrough re-asks) and `verifierUnavailable?: string` (absence reason);
    both additive to the spec's "counter/state lives in state" direction.
  - `agents/reins-completion-verifier.md`: the verifier definition shipped as
    a markdown agent definition (frontmatter + system-prompt body) read at
    registration time; the spec's layout line ("verifier agent definition
    (registered at runtime)") did not pin a format.
  - `src/ui/widget.ts`: a `Verifier` marker line while
    `verifierUnavailable` is set.
  - **No `verified` event with the Completion entry**: `planComplete` uses
    `prependLogEntry` (and `writeFields` for the `executionStatus: completed`
    flip) but deliberately does not call `appendVerifiedEvent`. The binding
    `docs/plans/plan-fs-contract.md` ("Generated and Verified") appends a
    `verified` event only at activation and review acceptance and states
    "Nothing is appended at task completion". The arch spec's ticket-11
    interface-contract sentence ("log entry plus status flip plus verified
    event are reused for the Completion entry") and ticket-12's abstraction
    list naming `appendVerifiedEvent` were therefore followed only
    half-way, by design: the fs-contract wins.
- **Impact:** plan-completion is the last ticket, so there are no dependent
  tickets; downstream consumers are the coherence pass and the spec
  reconcile. Two concrete handoffs: (1) the spec'd visible-absence failure
  changes notification counts in two landed plan-editing-review
  crash-recovery tests (recorded divergence in the TDD result, foreign tests
  untouched; the coherence pass should simulate an installed owner per
  `docs/testing.md` or assert on the reconcile message); (2) the
  spec-reconciler should amend the ticket-11/12 contract wording to drop the
  verified event from the Completion path, matching the fs-contract.

### Abstraction usage

- Used/was specified: yes. Reused `presentationOf`/the renegotiation
  session's blocking dialog mechanics, the proposal store's
  `deferred()` set, `FsPort.delete`, `prependLogEntry`/`writeFields`,
  `requireUi`, the `VerifierRunner` port with the spec-fixed
  `VerifierRequest`/`VerifierResult` shapes (the wiring's refuse-visibly
  placeholder is now replaced), and the harness fixtures. The verifier
  registration intentionally does not import `pi-subagents` at runtime
  (raw event contract, per pi-subagents' own guidance); the real RPC runner
  (`createSubagentsVerifier`) stands behind the existing port instead of a
  second abstraction.

### Out-of-scope changes

- `tests/harness/index.ts`: `h.events`, a process-local pub/sub bus standing
  in for `pi.events`, so tests can simulate an installed pi-subagents owner.
- `docs/testing.md`: documentation of the event-bus fixture and the
  pi-subagents absence simulation.
- `src/pi.ts` wiring (verifier install before the leftover-gate reconcile so
  the state narration stays the last user-visible notification), required by
  the absence feature but touching shared composition.
- Known foreign breakage, not an out-of-scope edit: the two
  `tests/plan-editing-review.test.ts` notification-count assertions described
  above were left untouched (workflow divergence rule) and are red until the
  coherence pass updates them.

### Ticket doc update needed?

Yes. Append to `## Implementation notes`: the ordered `reins_complete` path
(structural guard, verifier-availability refusal, walkthrough, verifier
verdict, records); fold dispositions riding ephemeral
`state.completionFolds` with structural verification and `FsPort.delete`;
the verifier via the raw `pi-subagents:runtime-agent-register:v1` event and
the in-process RPC spawn with a shipped `agents/reins-completion-verifier.md`
definition; absence handling gated on a bound contract to compose with the
landed inertness rule; the Completion entry written without a `verified`
event per the fs-contract's "nothing at task completion" rule.

### User attention needed?

Yes, at the end-of-effort stage only; no immediate decision. (1) The suite
carries two deliberately-red foreign tests until the coherence pass fixes
them (fix direction recorded; nothing in this ticket's scope satisfies both
the arch spec's absence contract and those assertions unedited). (2) The
arch spec's Completion-entry contract sentence contradicts the binding
fs-contract about the `verified` event; the spec-reconciler should amend the
spec, not the code. Neither changes this ticket's scope or shipped surface.
