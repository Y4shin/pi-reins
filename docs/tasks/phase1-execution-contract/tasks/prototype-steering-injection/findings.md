---
type: findings
title: "Findings: prototype-steering-injection"
status: stable
---
# Findings: prototype-steering-injection

Date: 2026-09-29. Task: `prototype-steering-injection` (type: prototype,
map: phase1-execution-contract). This document answers the task's five
sub-questions from the recorded evidence and states the verdict the
`to-spec` task consumes.

## Test setup (what was built and how it was measured)

The prototype (`prototype/steering-injection-prototype.extension.ts`,
835 lines, preserved on branch `prototype-steering-injection-rescue`,
commit eb0808c) is a throwaway pi extension implementing:

- a `context` handler that appends a synthetic custom message
  (`role: "custom"`, `customType: "reins-proto-summary"`, `display:
  false`) to the outgoing message list, computed fresh from the plan
  directory on every injected call and never written to the session;
- cadence counting (inject on every Nth LLM call) with forced triggers
  (first call of a run, expected-declaration events, completion
  attempts, and a post-compaction trigger that was never reached, see
  Limitations);
- a `reins_complete`-style tool with a remaining-work check, plus
  `reins_task_start/complete` and `reins_progress` tools over a fake
  plan directory (`prototype/fake-plan`, three tasks, fs-contract
  format);
- an `agent_settled` pushback chain (configurable channel:
  `sendMessage`, `sendUserMessage`, or none, max 2 pushbacks);
- a `tool_call` observer that matches write targets and bash commands
  against the tasks' `expectedPathRegexes` / `expectedBashRegexes` and
  forces a summary injection with a targeted note on out-of-declaration
  work (advisory only, nothing blocked);
- a JSONL measurement log (`REINS_PROTO_LOG`) recording every context
  call with injection reason, summary size, and per-call usage.

Every run was a fresh `pi -p --no-extensions -e <extension>` print-mode
session with `--thinking off`, against the user's configured provider:
**requesty, model `tensorx/glm-5.3`** (auth check: ready). The fake
plan was reset to a pristine state between runs
(`prototype/reset-plan.sh`). Summary variants: `minimal` (default,
about 445 chars), `narrative` (about 657 chars avg), `progress` (about
624 chars avg), all sharing an invariant header line.

Run inventory (from `/tmp/reins-proto-*` logs): smoke, smoke2, smoke3
(shakeout), R1 (tail, cadence 4, minimal), R2 (tail, cadence 1,
minimal), R3 (persistent mode, two prompts), CB-churn/nochurn x3
(cache micro-benchmark), R-narrative, R-progress (summary variants),
R6 (completion refused), R7 (completion clean), R8 (pushback via
`sendMessage`), R9 (pushback via `sendUserMessage`), R10 (forced
nudges with cadence disabled), R11/R11b/R11c (compaction attempts),
R11d (compaction attempt, aborted by the run cap mid-run).

Headline totals across the measured runs: **198 LLM calls, 81 tail
injections, zero provider rejections, zero handler errors after the
smoke fixes.**

## Sub-question 1: provider safety of the context-tail injection

**Measured: safe on this provider, across every run that injected.**

- The context handler appended the synthetic message on 81 calls (of
  198) across 12 measured runs. Not one request was rejected, retried
  due to malformed composition, or errored on the provider side. The
  only error class ever observed (smoke, smoke2) was the extension's
  own stale-ctx error after a pushback run started, an extension bug
  fixed before the measured runs (see sub-question 3).
- R1 (tail, cadence 4): 18 calls, 6 injected (calls 1, 2, 4, 8, 12,
  16), completion accepted, clean exit. R2 (cadence 1): 18 of 18
  calls injected, clean completion. R6: 22 calls, 9 injected, clean.
  R8: 20 calls, 7 injected. R9: 25 calls, 10 injected. R10: 21 calls,
  3 injected (forced triggers only, cadence 99). All exit code 0.
- R11d (the run the predecessor was killed during) additionally shows
  the tail injecting into a very large context: run 1 carried a 288k
  char seed file (64,302 input tokens reported), run 2's first call
  still injected (`first_call_of_run`, 445 chars) and the provider
  accepted it; the run was executing the contract normally (2 of 3
  tasks completed) when the 30-minute cap aborted it.
- Because the tail is appended in the `context` event only, it never
  enters the session file; session recordings confirm the persisted
  transcript contains no summary messages.

Not exercised: provider-side retries mid-stream, tree navigation
(fork/switch) with an injected call, and actual compaction recovery
(compaction could not be induced, see Limitations). These remain
open, so "safe" here means: valid, accepted requests in every
measured composition, including very large contexts.

## Sub-question 2: cache cost of the changing tail

**Measured: the changing tail does not break prefix caching on this
provider; its cost is the tail's own tokens, billed as un-cached
input.**

Controlled micro-benchmark (CB runs, `/tmp/reins-proto-cb.jsonl`):
two prompts per session, two calls each, cadence 1, minimal summary,
three repetitions each of churn (call counter baked into the summary
so the tail text changes every call) and no-churn. Second-call
cacheRead was identical in both conditions:

```text
run              calls  per-call (input, cacheRead, sum)
CB-churn-1           2  (73, 6912, 6985)  (252, 6848, 7100)
CB-churn-2           2  (137, 6848, 6985) (271, 6848, 7119)
CB-churn-3           2  (137, 6848, 6985) (233, 6848, 7081)
CB-nochurn-1         2  (125, 6848, 6973) (144, 6848, 6992)
CB-nochurn-2         2  (61, 6912, 6973)  (263, 6848, 7111)
CB-nochurn-3         2  (125, 6848, 6973) (233, 6848, 7081)
```

The changed tail is billed only as un-cached input: about 100 to 270
tokens per call (the summary is 445 chars plus targeted-note
additions). cacheWrite was 0 on every call of every run.

Full-run accounting:

- R1 (cadence 4): 18 calls, totals input 26,761, cacheRead 188,032,
  cacheWrite 0, output 5,108.
- R2 (cadence 1, every call injected): totals input 16,526,
  cacheRead 150,016. Despite injecting on every call, total un-cached
  input was lower than R1; per-call cacheRead oscillates between two
  floors (6,848 vs 12,500+) in all runs, which the predecessor
  attributed to requesty backend routing, not to injection. That
  provider-side noise (1.7k to 6k token swings between adjacent
  calls) is roughly an order of magnitude larger than the summary's
  own cost.
- R3 (persistent-message mode, for comparison): 22 calls, 0 tail
  injections, totals input 6,036, cacheRead 197,376. The persistent
  message landed twice (once per run, 445 and 401 chars) and run 2
  still hit cache because its message sits at the tail of history.
  This comparison is incomplete by design: the fallback's companion
  filter was not implemented, so accumulation cost without a filter
  was not measured (see Limitations).

Caveat: all numbers come from one provider's usage reporting
(cacheWrite always 0, no cache-write billing category observed).
Cross-provider cache behavior is unknown.

## Sub-question 3: pushback channel, sendMessage versus sendUserMessage

**Measured: `sendUserMessage` is the reliable channel;
`sendMessage` works only with a workaround and silently skips the
run lifecycle.**

- `pi.sendMessage(msg, { triggerTurn: true })` from `agent_settled`
  calls `agent.prompt` directly: the pushback run gets **no
  `before_agent_start`** (R8: `before_agent_start` runs = [1] only,
  yet the pushback run executed the whole contract and reached a clean
  completion). It is also fire-and-forget: in print mode the runtime
  disposes after the first settle, which killed the pushback run
  mid-startup in smoke and smoke2 (stale-ctx errors on the `context`
  and `agent_settled` handlers). The prototype fixed this by making
  the `agent_settled` handler await a settle-chain waiter (a deferred
  resolved by the next `agent_settled` emit). R8 then passed: print
  mode survived the chain, 3 tasks completed, pushback chain done.
- `pi.sendUserMessage` goes through the full `prompt()` path. R9:
  `before_agent_start` fired for every pushback run (runs 1, 2, 3),
  the pushback landed as a real user message in the session
  (verified in the session recording: "Execution contract not
  complete. Remaining work (3): create-greet-module (pending); ..."),
  and the chain caught an actual premature stop: the model ended run
  2 after completing only task 1 of 3; pushback attempt 2 resumed it
  and run 3 finished the contract, completion accepted, chain end
  with remaining = [].
- Both channels eventually drove the model to completion; only
  `sendUserMessage` produces correct run boundaries, fires
  `before_agent_start` (so per-run injection and state hooks run), and
  leaves the pushback in the user-visible history.

## Sub-question 4: before_agent_start frequency

**Measured: once per submitted prompt; never for sendMessage-triggered
turns; once per sendUserMessage pushback run.**

- R3 (two positional prompts in one session): `before_agent_start`
  fired twice (runIndex 1 and 2), one persistent message per run.
- R8 (`sendMessage` pushback): fired once (run 1 only).
- R9 (`sendUserMessage` pushbacks): fired three times (runs 1, 2, 3),
  once per pushback.
- **UNTESTED: queued follow-ups** (a user prompt typed while a run is
  active). The extension had a `REINS_PROTO_QUEUE_FOLLOWUP` knob for
  the planned R12, but the run cap was hit before R12. Whether
  `before_agent_start` fires for queued follow-ups is unknown.

## Sub-question 5: steering quality and cadence/summary tuning

**Measured: all three summary variants steered to clean completion;
nudges were read, quoted, and correctly treated as advisory.**

- Cadence 4, minimal (R1): injected at calls 1 (forced), 2
  (declaration event), 4, 8, 12, 16 of 18. After a YAML unescape fix
  in the prototype's parser, all expected-declaration regexes matched
  (9 hits in R1: mkdir, greet.js, verify-greet.mjs, node
  verify-greet.mjs, SUMMARY.md, cat, and more); completion accepted.
- Cadence 1, minimal (R2): 18 of 18 calls injected, clean completion.
  Cadence 4 and cadence 1 both steered cleanly; the cost difference
  is inside provider noise (sub-question 2).
- Narrative variant (R-narrative): 18 calls, 7 injected, chars 549 to
  805 (avg 657), 3 tasks completed, 3 progress entries, completion
  accepted, no pushbacks.
- Progress variant (R-progress): 20 calls, 7 injected, chars 474 to
  730 (avg 624), same clean outcome.
- Expected-declaration nudges (R10, cadence 99 so only forced
  triggers fire): injections at call 1 (first of run), call 2 (the
  out-of-declaration write of `/tmp/reins-proto-out-of-band.txt`),
  and call 9 (an undeclared `node -e` smoke check). The targeted
  note rides the next call's summary tail and says the observed work
  was outside the task declarations.
- Model reaction, direct quotes from the session recordings'
  thinking blocks (R9 and R10):
  - "The steering nudge flagged the node smoke check as outside the
    task declarations (expectedBashRegexes only lists `^mkdir `).
    Understood."
  - "The steering reminder is showing 0/3 done, create-greet-module
    still in_progress."
  - "The user's instruction takes precedence here; the note i[s]
    ..." (on the deliberately out-of-band /tmp write: the model
    reasoned about advisory precedence instead of refusing, which is
    the intended advisory semantics).
- Completion gate: R6 (all tasks pending, prompt "call reins_complete
  now"): the tool refused with the remaining-work list of 3; the
  model then executed all three tasks and re-called, accepted (22
  calls). R7 (all tasks done): accepted on the first call, run
  terminated cleanly (1 call).
- Pushback steering quality: R9's chain caught a real premature stop
  (model stopped after 1 of 3 tasks) and the resumed runs quoted the
  summary ("The steering reminder shows 2/3 done, 1 pending:
  record-run-summary").
- Not done: the human-judgment step. The task notes say if steer
  quality is human-judgment territory, ask the user to react to the
  variants. That reaction was not collected; variant preference below
  is grounded in mechanical observations only.

## Go/no-go verdict on the context-tail injection

**Go, on the recorded evidence, with stated caveats.**

Grounds, from the measurements only:

1. Provider acceptance: 81 injections across 12 measured runs and
   198 calls on requesty / `tensorx/glm-5.3`, zero rejections or
   composition errors, including injection into a 64k-token context
   (R11d).
2. Cache economics: the controlled churn benchmark shows a changing
   tail does not damage prefix caching (identical second-call
   cacheRead of 6,848 with and without churn); the tail costs only
   its own 100 to 270 un-cached tokens per injected call, smaller
   than the provider's own cache-miss noise.
3. The mechanism's structural advantages held in practice: zero
   accumulation (nothing persisted), always current (recomputed per
   call from the plan directory), invisible to the user transcript.

Caveats that keep this from being an unqualified green light:

- One provider, one model. The task's question was provider
  acceptance on the configured provider; that is answered. Other
  providers are untested.
- Compaction interaction was never observed (the post-compaction
  forced trigger is structurally sound, since the tail is recomputed
  per call, but the recovery path through a real compaction was not
  exercised).
- Retries mid-stream and tree navigation with an injected call were
  not exercised.

If `to-spec` needs a hard fallback rule: the persistent message plus
context filter remains the documented fallback (briefing, surface 1).
The prototype measured the persistent half (R3: 2 injections, cache
still hit on run 2) but not the filter half, so the fallback is
itself only half-validated; treat it as documented-but-unmeasured.

## Recommended defaults for the Phase 1 spec

From the observations:

- **Cadence N: keep 4** (the briefing amendment's default). Cadence 1
  was affordable (16,526 total un-cached input tokens, less than
  cadence 4's R1 run) but the difference is provider noise, not
  signal; cadence 4 with forced triggers carried every measured run
  to a clean completion, and forced triggers (first call of run,
  declaration events, completion attempts) fire exactly when salience
  matters. If a future provider shows real per-call cache-write
  costs, cadence is the knob to turn.
- **Summary variant: minimal** (counts plus next task, about 445
  chars, roughly 100 to 270 tokens). It was the variant in every
  cache-measured run and steered cleanly in all of them. Narrative
  (avg 657 chars) and progress (avg 624 chars) also steered cleanly;
  pick narrative or progress only if the user asks for the extra
  content, since the minimal variant is the cheapest measured option
  with identical mechanical outcomes.
- **Pushback channel: `sendUserMessage`**, for the run-lifecycle
  reasons in sub-question 3. If `sendMessage` is ever used, the
  handler must await the follow-up run's settle (settle-chain
  waiter) or print-mode and RPC hosts may dispose the runtime under
  it, and the pushback run will not fire `before_agent_start`.
- **Nudge shape: targeted note appended to the summary, overriding
  cadence, advisory wording.** The observed wording made the model
  reason about precedence correctly (it weighed the user's explicit
  instruction against the note instead of blind-obeying or
  ignoring). Keep "never permission" semantics: the prototype never
  blocked a tool call, and the advisory nudge was sufficient to
  bring undeclared work back into declaration.
- **Completion gate: refusal lists remaining work and the model
  recovers** (R6); clean accept terminates the run (R7). The spec's
  `reins_complete` remaining-work check behaves as designed.

## Limitations (candidates for a follow-up run)

Everything below was not completed by the prototype run; each is
precisely scoped for a re-run.

1. **Post-compaction forced trigger: never observed.** Three
   compaction attempts failed with "Nothing to compact (session too
   small)": R11 (no seed), R11b (seed file failed to load: the
   `@file` mention with trailing prose in one positional prompt was
   parsed as a file path), R11c (72,040-char seed loaded, compaction
   still refused), R11d (288,160-char seed, 64,302 real input tokens,
   compaction still refused; the run then executed 25 turns and 2 of
   3 tasks before the cap aborted it). Mechanism (from pi's
   compaction source, verified after the fact): `prepareCompaction`
   keeps the most recent `keepRecentTokens` (default 20,000) and
   refuses when nothing remains to summarize; a single oversized
   user message exceeds the keep-recent window by itself, so a
   one-message seed can never trigger manual compaction. A follow-up
   needs a multi-turn session whose history beyond the keep-recent
   boundary accumulates gradually.
2. **Queued follow-ups: untested.** R12 (the
   `REINS_PROTO_QUEUE_FOLLOWUP` run) never executed; whether
   `before_agent_start` fires for a prompt queued during an active
   run is unknown.
3. **Tree navigation (fork, switch, back) with a tail-injected
   call: untested.** The sub-question asked that navigation must not
   choke on the synthetic message; no navigation was performed in
   any run.
4. **Provider retries mid-stream with an injected call: not
   explicitly exercised.** No run deliberately induced a retry.
5. **Single provider and model.** All 198 calls went to requesty /
   `tensorx/glm-5.3`. The fs-contract's "provider acceptance on the
   configured provider" is answered for that provider only; a
   second provider (especially one with cacheWrite billing) would
   strengthen the cache-cost answer.
6. **cacheWrite was 0 in every run.** Either the provider reports no
   cache-write category or none occurred; cache-write economics on
   other providers are unknown.
7. **The fallback's filter half: unmeasured.** The prototype
   implemented persistent injection (R3) but not the companion
   context filter that the fallback design requires, so the
   fallback's accumulation-without-filter cost and the filter's
   cache behavior are unknown.
8. **CacheRead oscillation (two floors, 6,848 vs 12,500+) is
   attributed to provider routing but unverified.** It does not
   change the verdict (it appears in injection-free runs too) but
   the attribution is the predecessor's inference.
9. **Steering-quality human judgment: not collected.** Variants were
   compared on mechanical outcomes (clean completion, nudge
   obedience, token cost) only; the user-reaction step from the task
   notes was not performed.
10. **R11d is incomplete evidence by construction:** it ran to 2 of
    3 tasks (25 calls) before the 30-minute cap aborted it; its
    value here is the large-context injection datapoint, not a full
    run.

## Provenance

These findings were recovered without re-running the test matrix.
The predecessor background agent built the extension and fake plan,
ran the full smoke sequence and runs R1 through R11d, and was killed
by the 30-minute single-async run cap at 16:20:42 UTC while R11d was
mid-contract, before writing any findings. Sources for this
document:

- the predecessor's full session transcript (224 JSONL entries:
  every command, observation, and running conclusion), at
  `~/.pi/agent/sessions/--home-pplattner-Projects-pi-reins--/
  2026-09-29T10-14-51-546Z_.../22ab42ac-.../run-0/session.jsonl`;
- the raw measurement artifacts under `/tmp/reins-proto-*` (per-run
  JSONL logs, stderr logs, the cache-behavior log, the out-of-band
  test file, and the session recordings under `/tmp/reins-proto-sessions/`),
  used to verify every number quoted above;
- the prototype itself, preserved on branch
  `prototype-steering-injection-rescue` (commit eb0808c), consulted
  read-only for mechanism details (summary variants, pushback
  handler, injection shape).

The run inventory, totals (198 calls, 81 injections), and all token
counts were recomputed from the artifacts, not copied from prose.
Interpretive statements that are inference rather than measurement
(the compaction refusal mechanism, the cache-oscillation
attribution) are marked as such in the text.
