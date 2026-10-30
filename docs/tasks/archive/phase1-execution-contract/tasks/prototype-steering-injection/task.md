---
type: task
title: Prototype the steering summary injection and pushback channels
status: deprecated
blocked_by: []
subtype: prototype
workflow_state: done
---

## The precise question

Does the adopted Phase 1 injection and pushback mechanics actually work,
at what cost, and with what steering quality? Five sub-questions:

1. Provider safety: does appending a synthetic custom message from the
   `context` event handler (the steering summary tail) produce valid
   requests on the configured provider? No shipped pi example performs
   this composition; retries, compaction recovery, and tree navigation
   must not choke on it.
2. Cache cost: what does the changing tail do to cached-prefix economics
   across turns (cacheRead deltas), compared with a persistent message?
3. Pushback channel: does `pi.sendMessage` or `pi.sendUserMessage`
   reliably resume work at `agent_settled` (the premature-completion
   pushback)?
4. `before_agent_start` frequency: does it fire once per submitted
   prompt only, or also for queued follow-ups?
5. Steering quality and tuning: which summary content variant and
   cadence N (default 4) keeps the agent on plan without degrading
   performance, and how do the expected-declaration nudges
   (`expectedPathRegexes` / `expectedBashRegexes`) behave in practice?

## The decision it unblocks

The Phase 1 spec's injection architecture (`to-spec`): tail injection
as designed, or the documented fallback (persistent message plus context
filter). Also the tuning defaults the spec ships with: cadence N,
summary content, nudge wording.

## Shape of the prototype

A throwaway pi extension, clearly named as a prototype and living
outside the repo's source (a scratch directory), plus a fake plan
directory with two or three tasks. The extension implements the context
handler with cadence counter and forced triggers, a
`reins_complete`-style tool with an `agent_settled` pushback, and stub
`tool_call` observation for the expected-declaration triggers. Summary
content: trial two or three variants (minimal counts, narrative, with
progress line).

## Evidence required for completion

- Per sub-question: the measurement or observation, naming the provider
  used, with raw numbers where relevant (cacheRead tokens, call counts).
- A go/no-go verdict on the tail injection, with the fallback decision
  if no-go.
- The recommended cadence N and summary variant, with observations.
- Implications for `to-spec`: what the Phase 1 spec's injection section
  should specify.
- Any newly discovered work for Wayfinder.

## Likely dependent tasks

`to-spec` consumes the verdict in the Phase 1 spec's architecture
section. If the tail injection fails on a provider the user needs, the
fallback design lands in the spec instead.

## Notes

- Throwaway from day one; delete the prototype code when done unless
  this task says to keep it. The findings artifact is the deliverable:
  write it as `findings.md` in this task directory.
- The prototype runs against the user's configured provider; provider
  acceptance is the question, so real requests are the point.
- If steer quality turns out to be human-judgment territory, ask the
  user to react to the variants; do not answer that on their behalf.
- No application code: the prototype must not quietly become production
  code; production behavior is a separate `type: feature` task.

## Execution notes

- First attempt (2026-09-29): the background child built the extension
  and fake plan, ran smoke rounds plus numbered measurement runs (R10,
  R11 compaction attempts, cache-behavior and out-of-band artifacts in
  /tmp/reins-proto-*), and hit the 30-minute single-async run cap before
  writing findings. The failure cleanup pruned its worktree; the
  committed prototype is preserved on branch
  `prototype-steering-injection-rescue` (eb0808c) and the child's
  session transcript survives. A recovery child wrote the findings from
  that transcript and the artifacts without re-running the matrix;
  untested sub-questions are listed there as limitations.

## Result

Done 2026-09-29. Findings in [findings.md](findings.md): **GO** on the
context-tail injection. 81 injections across 12 measured runs and 198
LLM calls (requesty / tensorx/glm-5.3) with zero provider rejections;
a controlled churn benchmark showed a changing tail does not damage
prefix caching (identical second-call cacheRead with and without
churn); tail cost measured at ~100-270 un-cached tokens per injected
call. Pushback channel answered: `sendUserMessage` reliably resumes
work and caught an actual premature stop in testing; `sendMessage` is
fire-and-forget and needs a settle-chain waiter. Recommended defaults:
cadence N = 4 with forced triggers, the minimal summary variant
(~445 chars), advisory targeted-note nudges overriding cadence.
Ten named limitations (post-compaction trigger never observed, queued
follow-ups and tree navigation untested, single provider, the
fallback's filter half unmeasured, human judgment on variants not
collected) are recorded as documented risks for to-spec rather than
new tasks; a cheap follow-up spike can close any that become
load-bearing.
